const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  listDisplays: () => ipcRenderer.invoke('display:list'),
  listWindows: () => ipcRenderer.invoke('window:list'),
  openWindow: (url, displayId) => ipcRenderer.invoke('window:open', { url, displayId }),
  closeWindow: (id) => ipcRenderer.invoke('window:close', { id }),
  refreshWindow: (id) => ipcRenderer.invoke('window:refresh', { id }),
  navigateWindow: (id, url) => ipcRenderer.invoke('window:navigate', { id, url }),
  blackoutWindow: (id, blackout) => ipcRenderer.invoke('window:blackout', { id, blackout }),
  setWindowVisibility: (id, hidden) => ipcRenderer.invoke('window:visibility', { id, hidden }),
  moveWindow: (id, displayId) => ipcRenderer.invoke('window:move', { id, displayId }),
  getThumbnail: (id) => ipcRenderer.invoke('window:thumbnail', { id }),
  sendClick: (id, normX, normY) => ipcRenderer.invoke('window:sendClick', { id, normX, normY }),
  sendScroll: (id, normX, normY, deltaX, deltaY) => ipcRenderer.invoke('window:sendScroll', { id, normX, normY, deltaX, deltaY }),
  sendKey: (id, key, modifiers) => ipcRenderer.invoke('window:sendKey', { id, key, modifiers }),
  getActiveInputValue: (id) => ipcRenderer.invoke('window:getActiveInputValue', { id }),
  goBack: (id) => ipcRenderer.invoke('window:goBack', { id }),
  goForward: (id) => ipcRenderer.invoke('window:goForward', { id }),
  setContentSize: (w, h) => ipcRenderer.invoke('control:setContentSize', { w, h }),
  setMinimumSize: (w, h) => ipcRenderer.invoke('control:setMinimumSize', { w, h }),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('control:alwaysontop', { enabled }),
  onWindowsUpdated: (callback) => {
    const handler = (_, windows) => callback(windows)
    ipcRenderer.on('windows:updated', handler)
    return () => ipcRenderer.removeListener('windows:updated', handler)
  },
  onDisplaysUpdated: (callback) => {
    const handler = (_, displays) => callback(displays)
    ipcRenderer.on('displays:updated', handler)
    return () => ipcRenderer.removeListener('displays:updated', handler)
  }
})
