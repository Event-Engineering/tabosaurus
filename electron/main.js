const { app, BrowserWindow, Menu, ipcMain, screen, session } = require('electron')
const path = require('path')
const fs = require('fs')

let controlWindow = null
const browserWindows = new Map() // id -> { win, url, displayId, blackout, hidden }
let nextId = 1

// ── Control window ────────────────────────────────────────────

function createControlWindow() {
  const iconExt = process.platform === 'darwin' ? 'icns' : process.platform === 'win32' ? 'ico' : 'png'
  controlWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 500,
    minHeight: 400,
    icon: path.join(__dirname, `../build/icon.${iconExt}`),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Tabosaurus',
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
  saveState()
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
    hidden: data.hidden,
    canGoBack: data.canGoBack,
    canGoForward: data.canGoForward,
    alwaysOnTop: data.alwaysOnTop,
    customCSS: data.customCSS
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
// DOM manipulation is handled in browser-preload.js via IPC — avoids
// executeJavaScript unreliability in Electron 29 on Windows.

const HIDE_SCROLLBARS_CSS =
  '::-webkit-scrollbar{display:none!important}' +
  '*{scrollbar-width:none!important;-ms-overflow-style:none!important}'

function applyBlackout(win) {
  if (!win.isDestroyed()) win.webContents.send('blackout:on')
}

function removeBlackout(win) {
  if (!win.isDestroyed()) win.webContents.send('blackout:off')
}

// ── Persistence ───────────────────────────────────────────────

function saveState() {
  const state = {
    windows: Array.from(browserWindows.values()).map(d => ({
      url: d.url,
      displayId: d.displayId,
      alwaysOnTop: d.alwaysOnTop,
      customCSS: d.customCSS
    }))
  }
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'state.json'), JSON.stringify(state))
  } catch (e) {
    console.error('Failed to save state:', e.message)
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'state.json'), 'utf8'))
  } catch {
    return null
  }
}

// ── Window factory ────────────────────────────────────────────

function openBrowserWindow(url, displayId, { hidden = false, alwaysOnTop = false, customCSS = '' } = {}) {
  const allDisplays = screen.getAllDisplays()
  const display = allDisplays.find(d => d.id === displayId) || screen.getPrimaryDisplay()

  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    show: !hidden,
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'browser-preload.js')
    }
  })

  if (!hidden) {
    if (process.platform === 'darwin') {
      win.setSimpleFullScreen(true)
    } else {
      win.setFullScreen(true)
    }
  }

  const id = nextId++
  browserWindows.set(id, { win, url, displayId: display.id, blackout: false, hidden, alwaysOnTop, customCSS, cssKey: null, canGoBack: false, canGoForward: false })

  if (alwaysOnTop && !hidden) {
    if (process.platform === 'darwin') win.setAlwaysOnTop(true, 'screen-saver')
    else win.setAlwaysOnTop(true)
  }

  function updateNavState(newUrl) {
    const d = browserWindows.get(id)
    if (!d) return
    if (newUrl) d.url = newUrl
    d.canGoBack = win.webContents.canGoBack()
    d.canGoForward = win.webContents.canGoForward()
    notifyControlWindow()
  }

  win.webContents.on('did-navigate', (_, newUrl) => updateNavState(newUrl))
  win.webContents.on('did-navigate-in-page', (_, newUrl) => updateNavState(newUrl))

  win.webContents.on('did-finish-load', async () => {
    if (win.isDestroyed()) return
    const data = browserWindows.get(id)
    if (!data) return
    data.cssKey = null
    await win.webContents.insertCSS(HIDE_SCROLLBARS_CSS).catch(() => {})
    if (data.customCSS) {
      data.cssKey = await win.webContents.insertCSS(data.customCSS).catch(() => null)
    }
    if (data.blackout) applyBlackout(win)
  })

  win.on('closed', () => {
    browserWindows.delete(id)
    notifyControlWindow()
  })

  if (hidden) {
    // Window isn't visible — skip the loading page, just load in background
    win.loadURL(url).catch(() => {
      if (!win.isDestroyed()) {
        win.loadFile(path.join(__dirname, 'error.html'), { query: { url } }).catch(() => {})
      }
    })
  } else {
    // Load the local loading page immediately so the window is never blank,
    // then chain into the real URL. Chromium keeps the loading page visible
    // until the new navigation commits, so it stays up during DNS/connect waits.
    win.loadFile(path.join(__dirname, 'loading.html'), { query: { url } })
      .then(() => win.loadURL(url))
      .then(() => {
        if (!win.isDestroyed()) {
          win.webContents.clearHistory()
          updateNavState()
        }
      })
      .catch(() => {
        if (!win.isDestroyed()) {
          win.loadFile(path.join(__dirname, 'error.html'), { query: { url } }).catch(() => {})
        }
      })
  }

  return id
}

function restoreWindows() {
  const state = loadState()
  if (!state || !Array.isArray(state.windows) || state.windows.length === 0) return

  const currentDisplayIds = new Set(screen.getAllDisplays().map(d => d.id))

  for (const { url, displayId, alwaysOnTop, customCSS } of state.windows) {
    const hidden = !currentDisplayIds.has(displayId)
    openBrowserWindow(url, displayId, { hidden, alwaysOnTop: !hidden && !!alwaysOnTop, customCSS: customCSS || '' })
  }

  notifyControlWindow()
}

// ── IPC: displays ─────────────────────────────────────────────

ipcMain.handle('app:version', () => app.getVersion())

ipcMain.handle('display:list', () => buildDisplayList())

// ── IPC: control window ───────────────────────────────────────

ipcMain.handle('control:setContentSize', (_, { w, h }) => {
  if (!controlWindow || controlWindow.isDestroyed()) return
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  controlWindow.setContentSize(
    Math.round(Math.min(w, sw * 0.95)),
    Math.round(Math.min(h, sh * 0.95))
  )
})

ipcMain.handle('control:setMinimumSize', (_, { w, h }) => {
  if (!controlWindow || controlWindow.isDestroyed()) return
  controlWindow.setMinimumSize(Math.round(w), Math.round(h))
})

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
  const id = openBrowserWindow(url, displayId)
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

ipcMain.handle('window:blackout', (_, { id, blackout }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  data.blackout = blackout
  if (blackout) applyBlackout(data.win)
  else removeBlackout(data.win)
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
    // Fall back to primary if the target display is no longer connected
    let display = screen.getAllDisplays().find(d => d.id === data.displayId)
    if (!display) {
      display = screen.getPrimaryDisplay()
      data.displayId = display.id
    }
    data.win.show()
    data.win.setBounds(display.bounds)
    await enterFullscreen(data.win)
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

ipcMain.handle('window:sendClick', async (_, { id, normX, normY }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed() || data.hidden) return false
  const display = screen.getAllDisplays().find(d => d.id === data.displayId) || screen.getPrimaryDisplay()
  const x = Math.round(normX * display.bounds.width)
  const y = Math.round(normY * display.bounds.height)

  // Inspect the element at the click position before sending the click.
  // elementFromPoint is reliable; activeElement after a synthetic click is not.
  let isTextInput = false
  try {
    isTextInput = await data.win.webContents.executeJavaScript(
      `(function(){
        function isText(el){
          if(!el)return false;
          if(el.tagName==='TEXTAREA')return true;
          if(el.tagName==='INPUT'){
            var t=(el.type||'text').toLowerCase();
            return !['button','submit','reset','checkbox','radio','file','image','range','color'].includes(t);
          }
          return !!el.isContentEditable;
        }
        function checkAt(doc,x,y){
          var el=doc.elementFromPoint(x,y);
          while(el&&el.tagName!=='BODY'){
            if(isText(el))return true;
            if(el.tagName==='IFRAME'){
              try{var r=el.getBoundingClientRect();return checkAt(el.contentDocument,x-r.left,y-r.top);}
              catch(e){return false;}
            }
            el=el.parentElement;
          }
          return false;
        }
        return checkAt(document,${x},${y});
      })()`
    )
  } catch { isTextInput = false }

  data.win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  data.win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  await new Promise(r => setTimeout(r, 50))
  data.win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })

  let currentValue = ''
  if (isTextInput) {
    await new Promise(r => setTimeout(r, 50))
    try {
      currentValue = await data.win.webContents.executeJavaScript(
        '(function(){' +
          'function readEl(el){' +
            'if(!el||el.type==="password")return "";' +
            'if(typeof el.value==="string")return el.value;' +
            'if(el.isContentEditable)return el.textContent||"";' +
            'return "";' +
          '}' +
          'const el=document.activeElement;if(!el)return "";' +
          'if(el.tagName==="IFRAME"){' +
            'try{return readEl(el.contentDocument.activeElement);}catch(e){return "";}' +
          '}' +
          'return readEl(el);' +
        '})()'
      )
    } catch { currentValue = '' }
  }

  return { isTextInput, currentValue }
})

ipcMain.handle('window:getActiveInputValue', async (_, { id }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return ''
  try {
    return await data.win.webContents.executeJavaScript(
      '(function(){' +
        'function readEl(el){' +
          'if(!el||el.type==="password")return "";' +
          'if(typeof el.value==="string")return el.value;' +
          'if(el.isContentEditable)return el.textContent||"";' +
          'return "";' +
        '}' +
        'const el=document.activeElement;if(!el)return "";' +
        'if(el.tagName==="IFRAME"){try{return readEl(el.contentDocument.activeElement);}catch(e){return "";}}' +
        'return readEl(el);' +
      '})()'
    )
  } catch { return '' }
})

ipcMain.handle('window:sendKey', (_, { id, key, modifiers }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed() || data.hidden) return

  // Map DOM key names → Electron Accelerator names used by sendInputEvent
  const keyMap = {
    ' ': 'Space', 'Enter': 'Return',
    'ArrowLeft': 'Left', 'ArrowRight': 'Right', 'ArrowUp': 'Up', 'ArrowDown': 'Down',
  }
  const keyCode = keyMap[key] || key
  const isPrintable = key.length === 1 && !modifiers.includes('control') && !modifiers.includes('meta')

  // Briefly focus the browser window to deliver the key, then immediately
  // return focus to the control window so the typing overlay keeps capturing.
  data.win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  if (isPrintable) data.win.webContents.sendInputEvent({ type: 'char', keyCode: key })
  data.win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.focus()
})

ipcMain.handle('window:goBack', (_, { id }) => {
  const data = browserWindows.get(id)
  if (data && !data.win.isDestroyed() && data.win.webContents.canGoBack()) data.win.webContents.goBack()
})

ipcMain.handle('window:goForward', (_, { id }) => {
  const data = browserWindows.get(id)
  if (data && !data.win.isDestroyed() && data.win.webContents.canGoForward()) data.win.webContents.goForward()
})

ipcMain.handle('window:alwaysOnTop', (_, { id, enabled }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  if (enabled) {
    for (const [otherId, otherData] of browserWindows.entries()) {
      if (otherId !== id && otherData.displayId === data.displayId && otherData.alwaysOnTop) {
        otherData.alwaysOnTop = false
        if (!otherData.win.isDestroyed()) otherData.win.setAlwaysOnTop(false)
      }
    }
  }
  data.alwaysOnTop = enabled
  if (process.platform === 'darwin') {
    data.win.setAlwaysOnTop(enabled, 'screen-saver')
  } else {
    data.win.setAlwaysOnTop(enabled)
  }
  notifyControlWindow()
  saveState()
})

ipcMain.handle('window:injectCSS', async (_, { id, css }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  if (data.cssKey) {
    await data.win.webContents.removeInsertedCSS(data.cssKey).catch(() => {})
    data.cssKey = null
  }
  data.customCSS = css
  if (css) {
    data.cssKey = await data.win.webContents.insertCSS(css).catch(() => null)
  }
  notifyControlWindow()
  saveState()
})

ipcMain.handle('window:sendScroll', (_, { id, normX, normY, deltaX, deltaY }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed() || data.hidden) return
  const display = screen.getAllDisplays().find(d => d.id === data.displayId) || screen.getPrimaryDisplay()
  const x = Math.round(normX * display.bounds.width)
  const y = Math.round(normY * display.bounds.height)
  data.win.webContents.sendInputEvent({
    type: 'mouseWheel', x, y,
    deltaX: -Math.round(deltaX), deltaY: -Math.round(deltaY),
    wheelTicksX: -Math.round(deltaX / 100), wheelTicksY: -Math.round(deltaY / 100)
  })
})

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  const ua = session.defaultSession.getUserAgent().replace(/\s*Electron\/[\d.]+/, '')
  session.defaultSession.setUserAgent(ua)
  Menu.setApplicationMenu(null)
  createControlWindow()
  restoreWindows()
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
