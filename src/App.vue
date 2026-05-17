<template>
  <div class="app">
    <header class="header">
      <div class="url-bar">
        <input
          v-model="urlInput"
          @keyup.enter="openWindow"
          placeholder="https://example.com"
          class="url-input"
          type="text"
          spellcheck="false"
        />
        <select
          v-model="selectedDisplayId"
          class="display-select"
          :disabled="displays.length <= 1"
          :title="displays.length <= 1 ? 'Only one display detected' : 'Choose display'"
        >
          <option v-for="d in displays" :key="d.id" :value="d.id">
            {{ d.label }}{{ d.isPrimary ? ' (Primary)' : '' }}
          </option>
        </select>
        <button @click="openWindow" class="btn btn-primary" :disabled="!urlInput.trim()">
          Open
        </button>
        <button
          @click="toggleAlwaysOnTop"
          class="btn btn-pin"
          :class="{ 'btn-pin-active': alwaysOnTop }"
          :title="alwaysOnTop ? 'Unpin window (disable always-on-top)' : 'Pin window (enable always-on-top)'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"></line>
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
          </svg>
        </button>
      </div>
    </header>

    <main class="main">
      <div v-if="windows.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        </div>
        <p class="empty-title">No browser windows open</p>
        <p class="empty-hint">Enter a URL above to open a fullscreen browser window</p>
      </div>

      <div v-else class="window-grid">
        <WindowCard
          v-for="win in windows"
          :key="win.id"
          :win="win"
          :thumbnail="thumbnails[win.id]"
          :display="displayById(win.displayId)"
          @refresh="refreshWindow(win.id)"
          @close="closeWindow(win.id)"
          @move="startMove(win)"
          @navigate="(url) => navigateWindow(win.id, url)"
          @blackout="blackoutWindow(win.id, !win.blackout)"
          @visibility="setWindowVisibility(win.id, !win.hidden)"
          @interact-click="(normX, normY, cb) => interactClick(win.id, normX, normY, cb)"
          @interact-scroll="(normX, normY, deltaX, deltaY) => interactScroll(win.id, normX, normY, deltaX, deltaY)"
          @interact-key="(key, modifiers, cb) => interactKey(win.id, key, modifiers, cb)"
        />
      </div>
    </main>

    <MonitorPicker
      v-if="movingWindow"
      :win="movingWindow"
      :displays="displays"
      @move="doMove"
      @cancel="movingWindow = null"
    />
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import WindowCard from './components/WindowCard.vue'
import MonitorPicker from './components/MonitorPicker.vue'

export default {
  name: 'App',
  components: { WindowCard, MonitorPicker },
  setup() {
    const urlInput = ref('')
    const displays = ref([])
    const selectedDisplayId = ref(null)
    const windows = ref([])
    const thumbnails = ref({})
    const movingWindow = ref(null)
    const alwaysOnTop = ref(true)
    let thumbTimer = null
    let unsubscribe = null
    let unsubDisplays = null
    const interactThumbTimers = {}

    function displayById(id) {
      return displays.value.find(d => d.id === id) || null
    }

    async function init() {
      displays.value = await window.api.listDisplays()
      const defaultDisplay = displays.value.find(d => !d.isPrimary) || displays.value[0]
      if (defaultDisplay) selectedDisplayId.value = defaultDisplay.id

      windows.value = await window.api.listWindows()

      unsubscribe = window.api.onWindowsUpdated(updated => {
        windows.value = updated
      })

      unsubDisplays = window.api.onDisplaysUpdated(updated => {
        displays.value = updated
        if (!updated.find(d => d.id === selectedDisplayId.value)) {
          const fallback = updated.find(d => !d.isPrimary) || updated[0]
          if (fallback) selectedDisplayId.value = fallback.id
        }
      })

      thumbTimer = setInterval(refreshThumbnails, 2500)
      refreshThumbnails()
    }

    async function refreshThumbnails() {
      for (const win of windows.value) {
        if (win.hidden) continue
        const thumb = await window.api.getThumbnail(win.id)
        if (thumb) thumbnails.value = { ...thumbnails.value, [win.id]: thumb }
      }
    }

    async function openWindow() {
      let url = urlInput.value.trim()
      if (!url) return
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      await window.api.openWindow(url, selectedDisplayId.value)
      urlInput.value = ''
    }

    async function refreshWindow(id) {
      await window.api.refreshWindow(id)
    }

    async function closeWindow(id) {
      await window.api.closeWindow(id)
      const next = { ...thumbnails.value }
      delete next[id]
      thumbnails.value = next
    }

    async function navigateWindow(id, url) {
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      await window.api.navigateWindow(id, url)
    }

    async function refreshThumbnail(id) {
      const thumb = await window.api.getThumbnail(id)
      if (thumb) thumbnails.value = { ...thumbnails.value, [id]: thumb }
    }

    async function interactClick(id, normX, normY, onTypingResult) {
      const { isTextInput, currentValue } = await window.api.sendClick(id, normX, normY)
      setTimeout(() => refreshThumbnail(id), 300)
      onTypingResult(isTextInput, currentValue)
    }

    function interactScroll(id, normX, normY, deltaX, deltaY) {
      window.api.sendScroll(id, normX, normY, deltaX, deltaY)
      clearTimeout(interactThumbTimers[id])
      interactThumbTimers[id] = setTimeout(() => refreshThumbnail(id), 250)
    }

    async function interactKey(id, key, modifiers, onAfterKey) {
      await window.api.sendKey(id, key, modifiers)
      if (onAfterKey) {
        await new Promise(r => setTimeout(r, 80))
        const value = await window.api.getActiveInputValue(id)
        onAfterKey(value)
      }
    }

    async function blackoutWindow(id, blackout) {
      await window.api.blackoutWindow(id, blackout)
    }

    async function setWindowVisibility(id, hidden) {
      await window.api.setWindowVisibility(id, hidden)
    }

    async function toggleAlwaysOnTop() {
      alwaysOnTop.value = !alwaysOnTop.value
      await window.api.setAlwaysOnTop(alwaysOnTop.value)
    }

    function startMove(win) {
      movingWindow.value = win
    }

    async function doMove({ windowId, displayId }) {
      await window.api.moveWindow(windowId, displayId)
      movingWindow.value = null
    }

    onMounted(init)

    onUnmounted(() => {
      if (unsubscribe) unsubscribe()
      if (unsubDisplays) unsubDisplays()
      if (thumbTimer) clearInterval(thumbTimer)
    })

    return {
      urlInput, displays, selectedDisplayId, windows, thumbnails, movingWindow, alwaysOnTop,
      displayById, openWindow, refreshWindow, closeWindow, navigateWindow, blackoutWindow,
      setWindowVisibility, toggleAlwaysOnTop, startMove, doMove, interactClick, interactScroll, interactKey
    }
  }
}
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  padding: 12px 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.url-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.url-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}

.url-input:focus {
  border-color: var(--accent);
}

.url-input::placeholder {
  color: var(--text-secondary);
}

.display-select {
  padding: 8px 10px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  cursor: pointer;
  white-space: nowrap;
  max-width: 180px;
}

.display-select:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn {
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.btn-primary {
  background: var(--accent);
  color: #0d1117;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.82;
}

.btn-pin {
  padding: 8px 10px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  flex-shrink: 0;
}

.btn-pin:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn-pin-active {
  background: rgba(157, 119, 245, 0.1);
  border-color: rgba(157, 119, 245, 0.4);
  color: var(--accent);
}

.btn-pin-active:hover {
  background: rgba(157, 119, 245, 0.18);
  color: var(--accent);
}

.main {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: var(--text-secondary);
}

.empty-icon {
  opacity: 0.25;
  margin-bottom: 4px;
}

.empty-title {
  font-size: 15px;
  color: var(--text-primary);
}

.empty-hint {
  font-size: 12px;
}

.window-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  align-content: start;
  max-width: calc((100vh - 180px) * 1.5);
  margin: 0 auto;
  width: 100%;
}
</style>
