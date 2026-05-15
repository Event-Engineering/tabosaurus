const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')

let controlWindow = null
const browserWindows = new Map() // id -> { win, url, displayId, blackout }
let nextId = 1

// ── Control window ────────────────────────────────────────────

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Browserator',
    backgroundColor: '#0d1117'
  })

  if (process.platform === 'darwin') {
    controlWindow.setAlwaysOnTop(true, 'screen-saver')
  } else {
    controlWindow.setAlwaysOnTop(true)
  }

  const isDev = process.env.npm_lifecycle_event === 'dev'
  const url = isDev
    ? 'http://localhost:8080'
    : `file://${path.join(__dirname, '../dist/index.html')}`

  controlWindow.loadURL(url)

  if (isDev) {
    controlWindow.webContents.openDevTools({ mode: 'detach' })
  }

  controlWindow.on('closed', () => {
    controlWindow = null
    app.quit()
  })
}

// ── Helpers ───────────────────────────────────────────────────

function notifyControlWindow() {
  if (!controlWindow || controlWindow.isDestroyed()) return
  controlWindow.webContents.send('windows:updated', buildWindowList())
}

function buildDisplayList() {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
    label: d.label || `Display ${i + 1}`,
    isPrimary: d.id === primaryId
  }))
}

function notifyDisplaysUpdated() {
  if (!controlWindow || controlWindow.isDestroyed()) return
  controlWindow.webContents.send('displays:updated', buildDisplayList())
}

let lastDisplaySig = ''
function pollDisplays() {
  const sig = JSON.stringify(buildDisplayList().map(d => d.id + d.bounds.x + d.bounds.y + d.bounds.width + d.bounds.height + d.scaleFactor))
  if (sig !== lastDisplaySig) {
    lastDisplaySig = sig
    notifyDisplaysUpdated()
  }
}

function buildWindowList() {
  return Array.from(browserWindows.entries()).map(([id, data]) => ({
    id,
    url: data.url,
    displayId: data.displayId,
    blackout: data.blackout,
    hidden: data.hidden
  }))
}

function exitFullscreen(win) {
  return new Promise(resolve => {
    if (process.platform === 'darwin') {
      win.setSimpleFullScreen(false)
      setTimeout(resolve, 400)
    } else if (win.isFullScreen()) {
      win.once('leave-full-screen', resolve)
      win.setFullScreen(false)
    } else {
      resolve()
    }
  })
}

function enterFullscreen(win) {
  return new Promise(resolve => {
    if (process.platform === 'darwin') {
      win.setSimpleFullScreen(true)
      setTimeout(resolve, 200)
    } else {
      win.once('enter-full-screen', resolve)
      win.setFullScreen(true)
    }
  })
}

// ── Blackout helpers ──────────────────────────────────────────
// Pure JS overlay — no insertCSS key tracking needed, survives navigation safely.

const BLACKOUT_JS_ADD =
  'if(!document.getElementById("__br_blackout")){' +
  'const d=document.createElement("div");d.id="__br_blackout";' +
  'd.style.cssText="position:fixed!important;top:0!important;left:0!important;' +
  'width:100vw!important;height:100vh!important;background:#000!important;' +
  'z-index:2147483647!important;pointer-events:none!important";' +
  'document.documentElement.appendChild(d)}void 0'

const BLACKOUT_JS_REMOVE =
  'const d=document.getElementById("__br_blackout");if(d)d.remove()'

const HIDE_SCROLLBARS_CSS =
  '::-webkit-scrollbar{display:none!important}' +
  '*{scrollbar-width:none!important;-ms-overflow-style:none!important}'

async function applyBlackout(win) {
  try {
    await win.webContents.executeJavaScript(BLACKOUT_JS_ADD)
  } catch { /* page may be mid-navigation or window hidden */ }
}

async function removeBlackout(win) {
  try {
    await win.webContents.executeJavaScript(BLACKOUT_JS_REMOVE)
  } catch { /* page may be mid-navigation */ }
}

// ── IPC: displays ─────────────────────────────────────────────

ipcMain.handle('display:list', () => buildDisplayList())

// ── IPC: control window ───────────────────────────────────────

ipcMain.handle('control:alwaysontop', (_, { enabled }) => {
  if (!controlWindow || controlWindow.isDestroyed()) return
  if (process.platform === 'darwin') {
    controlWindow.setAlwaysOnTop(enabled, 'screen-saver')
  } else {
    controlWindow.setAlwaysOnTop(enabled)
  }
})

// ── IPC: windows ──────────────────────────────────────────────

ipcMain.handle('window:list', () => buildWindowList())

ipcMain.handle('window:open', (_, { url, displayId }) => {
  const displays = screen.getAllDisplays()
  const display = displays.find(d => d.id === displayId) || screen.getPrimaryDisplay()

  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.platform === 'darwin') {
    win.setSimpleFullScreen(true)
  } else {
    win.setFullScreen(true)
  }

  const id = nextId++
  browserWindows.set(id, { win, url, displayId: display.id, blackout: false, hidden: false })

  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed()) return
    win.webContents.insertCSS(HIDE_SCROLLBARS_CSS).catch(() => {})
    const data = browserWindows.get(id)
    if (data && data.blackout) applyBlackout(win)
  })

  win.on('closed', () => {
    browserWindows.delete(id)
    notifyControlWindow()
  })

  // Load the local loading page immediately so the window is never blank,
  // then chain into the real URL. Chromium keeps the loading page visible
  // until the new navigation commits, so it stays up during DNS/connect waits.
  win.loadFile(path.join(__dirname, 'loading.html'), { query: { url } })
    .then(() => win.loadURL(url))
    .catch(() => {
      if (!win.isDestroyed()) {
        win.loadFile(path.join(__dirname, 'error.html'), { query: { url } }).catch(() => {})
      }
    })

  notifyControlWindow()
  return id
})

ipcMain.handle('window:close', (_, { id }) => {
  const data = browserWindows.get(id)
  if (data && !data.win.isDestroyed()) data.win.close()
})

ipcMain.handle('window:refresh', (_, { id }) => {
  const data = browserWindows.get(id)
  if (data && !data.win.isDestroyed()) data.win.webContents.reload()
})

ipcMain.handle('window:navigate', async (_, { id, url }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  try {
    await data.win.loadURL(url)
    data.url = url
    notifyControlWindow()
  } catch {
    if (!data.win.isDestroyed()) {
      await data.win.loadFile(path.join(__dirname, 'error.html'), { query: { url } }).catch(() => {})
    }
  }
})

ipcMain.handle('window:blackout', async (_, { id, blackout }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  // Set flag first — prevents did-finish-load from re-applying while we remove
  data.blackout = blackout
  if (blackout) {
    await applyBlackout(data.win)
  } else {
    await removeBlackout(data.win)
  }
  notifyControlWindow()
})

ipcMain.handle('window:visibility', async (_, { id, hidden }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  data.hidden = hidden
  if (hidden) {
    await exitFullscreen(data.win)
    data.win.minimize()
  } else {
    const display = screen.getAllDisplays().find(d => d.id === data.displayId)
    data.win.show()
    if (display) {
      data.win.setBounds(display.bounds)
      await enterFullscreen(data.win)
    }
  }
  notifyControlWindow()
})

ipcMain.handle('window:move', async (_, { id, displayId }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return

  const display = screen.getAllDisplays().find(d => d.id === displayId)
  if (!display) return

  await exitFullscreen(data.win)
  data.win.setBounds(display.bounds)
  await enterFullscreen(data.win)

  data.displayId = displayId
  notifyControlWindow()
})

ipcMain.handle('window:thumbnail', async (_, { id }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return null
  try {
    const img = await data.win.webContents.capturePage()
    return img.toDataURL()
  } catch {
    return null
  }
})

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  createControlWindow()
  screen.on('display-added', notifyDisplaysUpdated)
  screen.on('display-removed', notifyDisplaysUpdated)
  screen.on('display-metrics-changed', notifyDisplaysUpdated)
  setInterval(pollDisplays, 2000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!controlWindow) createControlWindow()
})
