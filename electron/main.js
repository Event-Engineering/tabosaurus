const { app, BrowserWindow, Menu, ipcMain, screen, session } = require('electron')
const path = require('path')
const fs = require('fs')

let controlWindow = null
const browserWindows = new Map() // id -> { win, url, displayId, blackout, hidden }
const lastActiveBrowserPerDisplay = new Map() // displayId -> browser window id
let nextId = 1

// ── Control window ────────────────────────────────────────────

let saveStateTimer = null
function debouncedSaveState() {
  clearTimeout(saveStateTimer)
  saveStateTimer = setTimeout(saveState, 500)
}

function createControlWindow() {
  const iconExt = process.platform === 'darwin' ? 'icns' : process.platform === 'win32' ? 'ico' : 'png'
  const savedBounds = loadState()?.controlBounds
  controlWindow = new BrowserWindow({
    width: savedBounds?.width || 960,
    height: savedBounds?.height || 700,
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

  controlWindow.on('resize', debouncedSaveState)

  controlWindow.on('maximize', () => {
    if (!controlWindow.isDestroyed()) controlWindow.webContents.send('control:maximized', true)
  })
  controlWindow.on('unmaximize', () => {
    if (!controlWindow.isDestroyed()) controlWindow.webContents.send('control:maximized', false)
  })

  if (process.platform !== 'darwin') {
    // On Windows, the taskbar can climb above browser windows in the TOPMOST band when
    // focus shifts. Delay slightly so our moveTop() fires after the taskbar has reasserted,
    // not before. Raise in two passes: non-pinned first, pinned last, control on top.
    controlWindow.on('focus', () => {
      setTimeout(() => {
        if (!controlWindow || controlWindow.isDestroyed()) return
        const raisedDisplays = new Set()
        // Pass 1: raise one non-pinned browser per display (last-active, or any).
        // Skip displays that have a pinned browser — the pinned pass covers those.
        const pinnedDisplays = new Set()
        for (const data of browserWindows.values()) {
          if (!data.win.isDestroyed() && !data.hidden && data.alwaysOnTop) pinnedDisplays.add(data.displayId)
        }
        for (const [displayId, browserId] of lastActiveBrowserPerDisplay.entries()) {
          if (pinnedDisplays.has(displayId)) continue
          const data = browserWindows.get(browserId)
          if (data && !data.win.isDestroyed() && !data.hidden && !data.alwaysOnTop) {
            data.win.moveTop()
            raisedDisplays.add(displayId)
          }
        }
        for (const data of browserWindows.values()) {
          if (!data.win.isDestroyed() && !data.hidden && !data.alwaysOnTop && !raisedDisplays.has(data.displayId) && !pinnedDisplays.has(data.displayId)) {
            data.win.moveTop()
            raisedDisplays.add(data.displayId)
          }
        }
        // Pass 2: raise pinned browsers (ends up above non-pinned on each display).
        for (const data of browserWindows.values()) {
          if (!data.win.isDestroyed() && !data.hidden && data.alwaysOnTop) data.win.moveTop()
        }
        controlWindow.moveTop()
      }, 50)
    })
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
    locked: data.locked,
    customCSS: data.customCSS,
    zoomFactor: data.zoomFactor,
    muted: data.muted,
    audioOutputDeviceId: data.audioOutputDeviceId
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
      // Windows: window is already frame: false and positioned to display bounds.
      // setFullScreen resets the TOPMOST flag mid-transition, breaking z-order.
      resolve()
    }
  })
}

// ── Audio sink injection ──────────────────────────────────────
// Injects JS that calls setSinkId on all audio/video elements and watches for new ones.
// Note: AudioContext sources are not affected — setSinkId only works on HTMLMediaElement.

function buildSinkScript(deviceId) {
  return `(function(sinkId){
    function applyToEl(el){if(typeof el.setSinkId==='function')el.setSinkId(sinkId).catch(()=>{})}
    document.querySelectorAll('audio,video').forEach(applyToEl)
    if(window.__sinkObs){window.__sinkObs.disconnect()}
    window.__sinkObs=new MutationObserver(function(ms){
      ms.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if(!n||n.nodeType!==1)return
          if(n.matches&&n.matches('audio,video'))applyToEl(n)
          if(n.querySelectorAll)n.querySelectorAll('audio,video').forEach(applyToEl)
        })
      })
    })
    window.__sinkObs.observe(document.documentElement,{childList:true,subtree:true})
  })(${JSON.stringify(deviceId)})`
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
    controlBounds: controlWindow && !controlWindow.isDestroyed() ? controlWindow.getBounds() : undefined,
    windows: Array.from(browserWindows.values()).map(d => ({
      url: d.url,
      displayId: d.displayId,
      alwaysOnTop: d.alwaysOnTop,
      locked: d.locked,
      customCSS: d.customCSS,
      zoomFactor: d.zoomFactor,
      audioOutputDeviceId: d.audioOutputDeviceId
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

function openBrowserWindow(url, displayId, { hidden = false, alwaysOnTop = false, locked = false, customCSS = '', zoomFactor = 1, audioOutputDeviceId = '' } = {}) {
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

  if (!hidden && process.platform === 'darwin') {
    win.setSimpleFullScreen(true)
  }

  const id = nextId++
  browserWindows.set(id, { win, url, displayId: display.id, blackout: false, hidden, alwaysOnTop, locked, customCSS, cssKey: null, canGoBack: false, canGoForward: false, zoomFactor, muted: false, audioOutputDeviceId })

  if (locked) win.setIgnoreMouseEvents(true)

  win.on('focus', () => {
    const d = browserWindows.get(id)
    if (d?.locked && !d.win.isDestroyed()) {
      d.win.blur()
      return
    }
    if (process.platform !== 'darwin') {
      lastActiveBrowserPerDisplay.set(d.displayId, id)
      if (!win.isDestroyed()) win.moveTop()
      if (controlWindow && !controlWindow.isDestroyed()) controlWindow.moveTop()
    }
  })
  if (zoomFactor !== 1) win.webContents.setZoomFactor(zoomFactor)

  if (process.platform === 'darwin') {
    if (alwaysOnTop && !hidden) win.setAlwaysOnTop(true, 'floating')
  } else {
    // On Windows: browser windows are always TOPMOST — taskbar can never cover them.
    // "Pinned" asserts order via moveTop(), never by toggling setAlwaysOnTop.
    win.setAlwaysOnTop(true)
    if (alwaysOnTop && !hidden) {
      setTimeout(() => {
        if (!win.isDestroyed()) win.moveTop()
        if (controlWindow && !controlWindow.isDestroyed()) controlWindow.moveTop()
      }, 50)
    }
  }

  function updateNavState(newUrl) {
    const d = browserWindows.get(id)
    if (!d) return
    if (newUrl) d.url = newUrl
    d.canGoBack = win.webContents.navigationHistory.canGoBack()
    d.canGoForward = win.webContents.navigationHistory.canGoForward()
    notifyControlWindow()
  }

  win.webContents.on('did-navigate', (_, newUrl) => updateNavState(newUrl))
  win.webContents.on('did-navigate-in-page', (_, newUrl) => updateNavState(newUrl))

  win.webContents.on('dom-ready', async () => {
    if (win.isDestroyed()) return
    const data = browserWindows.get(id)
    if (!data) return
    data.cssKey = null
    await win.webContents.insertCSS(HIDE_SCROLLBARS_CSS).catch(() => {})
    if (data.customCSS) {
      data.cssKey = await win.webContents.insertCSS(data.customCSS).catch(() => null)
    }
    if (data.zoomFactor && data.zoomFactor !== 1) win.webContents.setZoomFactor(data.zoomFactor)
    if (data.muted) win.webContents.setAudioMuted(true)
    if (data.audioOutputDeviceId) await win.webContents.executeJavaScript(buildSinkScript(data.audioOutputDeviceId)).catch(() => {})
    if (data.blackout) applyBlackout(win)
  })

  win.on('closed', () => {
    browserWindows.delete(id)
    for (const [displayId, bid] of lastActiveBrowserPerDisplay.entries()) {
      if (bid === id) lastActiveBrowserPerDisplay.delete(displayId)
    }
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
          win.webContents.navigationHistory.clear()
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

  for (const { url, displayId, alwaysOnTop, locked, customCSS, zoomFactor, audioOutputDeviceId } of state.windows) {
    const hidden = !currentDisplayIds.has(displayId)
    openBrowserWindow(url, displayId, { hidden, alwaysOnTop: !hidden && !!alwaysOnTop, locked: !!locked, customCSS: customCSS || '', zoomFactor: zoomFactor || 1, audioOutputDeviceId: audioOutputDeviceId || '' })
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
    data.win.hide()
  } else {
    // Fall back to primary if the target display is no longer connected
    let display = screen.getAllDisplays().find(d => d.id === data.displayId)
    if (!display) {
      display = screen.getPrimaryDisplay()
      data.displayId = display.id
    }
    data.win.showInactive()
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

  if (data.hidden) {
    if (data.alwaysOnTop) {
      const conflictOnDest = Array.from(browserWindows.values()).some(
        d => d !== data && d.displayId === displayId && d.alwaysOnTop
      )
      if (conflictOnDest) {
        data.alwaysOnTop = false
        if (process.platform === 'darwin') data.win.setAlwaysOnTop(false)
      }
    }
    data.displayId = displayId
    notifyControlWindow()
    saveState()
    return
  }

  await exitFullscreen(data.win)

  const sourceDisplayId = data.displayId
  const destPinned = Array.from(browserWindows.values()).find(
    d => d !== data && d.displayId === displayId && d.alwaysOnTop && !d.win.isDestroyed() && !d.hidden
  )

  // Scenario A: moving window is pinned but destination already has a pinned window — unpin it
  if (data.alwaysOnTop && destPinned) {
    data.alwaysOnTop = false
    if (process.platform === 'darwin') data.win.setAlwaysOnTop(false)
  }

  if (process.platform !== 'darwin') {
    // Assert z-order BEFORE setBounds so the window arrives already in the correct position.
    if (data.alwaysOnTop) {
      // Scenario B: moving window stays pinned — raise it to the top before the move
      data.win.moveTop()
    } else {
      // Scenarios A, C, K: raise the authoritative window on the destination first so the
      // arriving window is already behind it when setBounds lands it there
      let toRaise = null
      if (destPinned && !destPinned.win.isDestroyed() && !destPinned.hidden) {
        toRaise = destPinned
      } else {
        const authId = lastActiveBrowserPerDisplay.get(displayId)
        const tracked = authId ? browserWindows.get(authId) : null
        toRaise = (tracked && !tracked.win.isDestroyed() && !tracked.hidden && tracked !== data)
          ? tracked
          : Array.from(browserWindows.values()).find(d => d !== data && d.displayId === displayId && !d.win.isDestroyed() && !d.hidden) || null
      }
      if (toRaise) toRaise.win.moveTop()
    }
  }

  data.win.setBounds(display.bounds)
  await enterFullscreen(data.win)

  if (lastActiveBrowserPerDisplay.get(sourceDisplayId) === id) lastActiveBrowserPerDisplay.delete(sourceDisplayId)
  data.displayId = displayId

  if (process.platform !== 'darwin') {
    if (data.alwaysOnTop) lastActiveBrowserPerDisplay.set(displayId, id)
    if (controlWindow && !controlWindow.isDestroyed()) controlWindow.moveTop()
  }

  notifyControlWindow()
  saveState()
})

ipcMain.handle('window:thumbnail', async (_, { id, targetWidth }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return null
  try {
    const img = await data.win.webContents.capturePage()
    return img.resize({ width: targetWidth, quality: 'best' }).toDataURL()
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
  if (data && !data.win.isDestroyed() && data.win.webContents.navigationHistory.canGoBack()) data.win.webContents.navigationHistory.goBack()
})

ipcMain.handle('window:goForward', (_, { id }) => {
  const data = browserWindows.get(id)
  if (data && !data.win.isDestroyed() && data.win.webContents.navigationHistory.canGoForward()) data.win.webContents.navigationHistory.goForward()
})

ipcMain.handle('window:alwaysOnTop', (_, { id, enabled }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  if (enabled) {
    for (const [otherId, otherData] of browserWindows.entries()) {
      if (otherId !== id && otherData.displayId === data.displayId && otherData.alwaysOnTop) {
        otherData.alwaysOnTop = false
        // macOS: un-float the window. Windows: leave TOPMOST, only update tracking state.
        if (process.platform === 'darwin' && !otherData.win.isDestroyed()) otherData.win.setAlwaysOnTop(false)
      }
    }
  }
  data.alwaysOnTop = enabled
  if (enabled && process.platform !== 'darwin') lastActiveBrowserPerDisplay.set(data.displayId, id)
  if (process.platform === 'darwin') {
    data.win.setAlwaysOnTop(enabled, 'floating')
  } else {
    // On Windows: TOPMOST is permanent; pin/unpin only asserts order via moveTop().
    if (enabled) {
      const assertPin = () => {
        if (!data.win.isDestroyed() && data.alwaysOnTop) data.win.moveTop()
        if (controlWindow && !controlWindow.isDestroyed()) controlWindow.moveTop()
      }
      setTimeout(assertPin, 50)
      setTimeout(assertPin, 250)
    }
  }
  notifyControlWindow()
  saveState()
})

ipcMain.handle('window:setLocked', (_, { id, locked }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  data.locked = locked
  data.win.setIgnoreMouseEvents(locked)
  if (locked && data.win.isFocused()) data.win.blur()
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

ipcMain.handle('window:setZoom', (_, { id, factor }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  data.zoomFactor = factor
  data.win.webContents.setZoomFactor(factor)
  notifyControlWindow()
  saveState()
})

ipcMain.handle('window:setMuted', (_, { id, muted }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  data.muted = muted
  data.win.webContents.setAudioMuted(muted)
  notifyControlWindow()
})

ipcMain.handle('window:setAudioOutput', async (_, { id, deviceId }) => {
  const data = browserWindows.get(id)
  if (!data || data.win.isDestroyed()) return
  data.audioOutputDeviceId = deviceId
  if (deviceId) {
    await data.win.webContents.executeJavaScript(buildSinkScript(deviceId)).catch(() => {})
  } else {
    await data.win.webContents.executeJavaScript(buildSinkScript('')).catch(() => {})
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
  // Grant speaker-selection permission so setSinkId works in browser windows
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'speaker-selection') return true
    return null
  })
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
