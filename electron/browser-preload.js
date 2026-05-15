const { ipcRenderer } = require('electron')

ipcRenderer.on('blackout:on', () => {
  let d = document.getElementById('__br_blackout')
  if (!d) {
    d = document.createElement('div')
    d.id = '__br_blackout'
    d.style.cssText =
      'position:fixed!important;top:0!important;left:0!important;' +
      'width:100vw!important;height:100vh!important;background:#000!important;' +
      'z-index:2147483647!important;pointer-events:none!important;' +
      'opacity:0;transition:opacity 0.4s ease'
    document.documentElement.appendChild(d)
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = '1' }))
})

ipcRenderer.on('blackout:off', () => {
  const d = document.getElementById('__br_blackout')
  if (d) d.remove()
})
