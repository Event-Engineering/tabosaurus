<template>
  <div class="app">
    <header class="header">
      <div class="url-bar">
        <div class="url-input-wrap">
          <input
            v-model="urlInput"
            @keyup.enter="openWindow"
            @focus="showSuggestions = true"
            @blur="hideSuggestions"
            @keydown="handleSuggestionsKey"
            @input="suggestionIndex = -1"
            placeholder="https://example.com"
            class="url-input"
            type="text"
            spellcheck="false"
          />
          <ul v-if="showSuggestions && filteredRecentUrls.length" class="url-suggestions">
            <li
              v-for="(url, i) in filteredRecentUrls"
              :key="url"
              :class="{ active: i === suggestionIndex }"
              @mousedown.prevent="selectSuggestion(url)"
            >
              <span class="suggestion-url">{{ url }}</span>
              <button class="suggestion-delete" @mousedown.prevent.stop="removeRecentUrl(url)" title="Remove from history">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </li>
          </ul>
        </div>
        <button
          v-if="displays.length > 1"
          class="btn btn-display"
          @click="openDisplayPicker"
          title="Choose display"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          {{ selectedDisplay ? selectedDisplay.label : '' }}
        </button>
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

    <main class="main" ref="mainRef">
      <div v-if="windows.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        </div>
        <p class="empty-title">No browser windows open</p>
        <p class="empty-hint">Enter a URL above to open a fullscreen browser window on any connected display</p>
        <p class="empty-version" v-if="appVersion">v{{ appVersion }}</p>
      </div>

      <div v-else class="window-grid" :style="gridStyle">
        <WindowCard
          v-for="win in windows"
          :key="win.id"
          :win="win"
          :thumbnail="thumbnails[win.id]"
          :display="displayById(win.displayId)"
          :interactive="win.id === interactiveWindowId"
          @refresh="refreshWindow(win.id)"
          @close="closeWindow(win.id)"
          @move="(e) => startMove(win, e)"
          @navigate="(url) => navigateWindow(win.id, url)"
          @back="goBack(win.id)"
          @forward="goForward(win.id)"
          @blackout="blackoutWindow(win.id, !win.blackout)"
          @visibility="setWindowVisibility(win.id, !win.hidden)"
          @toggle-interactive="toggleInteractive(win.id)"
          @interact-click="(normX, normY, cb) => interactClick(win.id, normX, normY, cb)"
          @interact-scroll="(normX, normY, deltaX, deltaY) => interactScroll(win.id, normX, normY, deltaX, deltaY)"
          @interact-key="(key, modifiers, cb) => interactKey(win.id, key, modifiers, cb)"
          @pin="handlePin(win.id)"
          :settings="{ ...(windowSettings[win.id] || { autoReload: false, reloadInterval: 30 }), reloadStartedAt: reloadCycleStarts[win.id] }"
          @set-reload="({ enabled, interval }) => handleSetReload(win.id, enabled, interval)"
          @apply-css="({ css }) => handleApplyCss(win.id, css)"
          @rename-display="handleRenameDisplay"
        />
      </div>
    </main>

    <MonitorPicker
      v-if="movingWindow"
      :win="movingWindow"
      :displays="labelledDisplays"
      :anchor="moveAnchor"
      @move="doMove"
      @cancel="movingWindow = null"
    />
    <MonitorPicker
      v-if="showDisplayPicker"
      :win="{ id: null, displayId: selectedDisplayId }"
      :displays="labelledDisplays"
      :anchor="displayPickerAnchor"
      title="Open on Screen"
      instruction="Click a screen to open new windows there."
      :allowCurrent="true"
      @move="selectDisplay"
      @cancel="showDisplayPicker = false"
    />
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import WindowCard from './components/WindowCard.vue'
import MonitorPicker from './components/MonitorPicker.vue'

export default {
  name: 'App',
  components: { WindowCard, MonitorPicker },
  setup() {
    const urlInput = ref('')
    const displays = ref([])
    const customDisplayLabels = ref(JSON.parse(localStorage.getItem('displayLabels') || '{}'))
    const labelledDisplays = computed(() =>
      displays.value.map(d => ({ ...d, label: customDisplayLabels.value[d.id] || d.label }))
    )
    const selectedDisplayId = ref(null)
    const windows = ref([])
    const thumbnails = ref({})
    const movingWindow = ref(null)
    const moveAnchor = ref(null)
    const showDisplayPicker = ref(false)
    const displayPickerAnchor = ref(null)
    const alwaysOnTop = ref(true)
    const interactiveWindowId = ref(null)
    const recentUrls = ref(JSON.parse(localStorage.getItem('recentUrls') || '[]'))
    const showSuggestions = ref(false)
    const suggestionIndex = ref(-1)
    const appVersion = ref('')

    const filteredRecentUrls = computed(() => {
      const q = urlInput.value.trim().toLowerCase()
      if (!q) return recentUrls.value
      return recentUrls.value.filter(u => u.toLowerCase().includes(q))
    })
    let thumbTimer = null
    let unsubscribe = null
    let unsubDisplays = null
    const interactThumbTimers = {}
    const windowSettings = ref({})
    const reloadTimers = {}
    const reloadCycleStarts = ref({})

    // Grid layout
    const mainRef = ref(null)
    const containerW = ref(0)
    const containerH = ref(0)
    let resizeObserver = null

    // Card body (url row + actions) uses cqw units, adding a proportional
    // height contribution on top of the thumbnail. Calibrated against 16:9:
    // original C (0.663) minus pure thumbnail ratio (9/16 = 0.5625) = 0.1005.
    const C_BODY = 0.663 - 9 / 16

    function cardAspectC(win) {
      const d = displays.value.find(d => d.id === win.displayId)
      return d ? d.bounds.height / d.bounds.width : 9 / 16
    }

    function effectiveC() {
      if (windows.value.length === 0) return 0.663
      return Math.max(...windows.value.map(w => cardAspectC(w) + C_BODY))
    }

    // Returns an array of per-row max C values for a given column count.
    // Row height = maxC_i × cardW + K, so total height = sum(maxC_i) × cardW + rows×K + gaps.
    function rowMaxCs(cols) {
      const n = windows.value.length
      const count = Math.max(n, 1)
      const rows = Math.ceil(count / cols)
      const result = []
      for (let r = 0; r < rows; r++) {
        let maxC = -Infinity
        for (let c = 0; c < cols && r * cols + c < n; c++) {
          maxC = Math.max(maxC, cardAspectC(windows.value[r * cols + c]) + C_BODY)
        }
        result.push(maxC === -Infinity ? 9 / 16 + C_BODY : maxC)
      }
      return result
    }

    // Like rowMaxCs but returns only the display aspect ratio per row (no C_BODY).
    // Used for the large-card height constraint where controls are at their clamp() caps.
    function rowMaxAspects(cols) {
      const n = windows.value.length
      const count = Math.max(n, 1)
      const rows = Math.ceil(count / cols)
      const result = []
      for (let r = 0; r < rows; r++) {
        let maxA = -Infinity
        for (let c = 0; c < cols && r * cols + c < n; c++) {
          maxA = Math.max(maxA, cardAspectC(windows.value[r * cols + c]))
        }
        result.push(maxA === -Infinity ? 9 / 16 : maxA)
      }
      return result
    }

    function computeCols(n, W, H) {
      const C = effectiveC()
      const GAP = 20, MIN_CARD_W = 410
      let cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * W / H / (1 / C)))))
      while (cols > 1 && (W - GAP * (cols - 1)) / cols < MIN_CARD_W) cols--
      return cols
    }

    const gridStyle = computed(() => {
      const n = windows.value.length
      if (n === 0 || !containerW.value || !containerH.value) return {}

      const W = containerW.value
      const H = containerH.value
      const GAP = 20, K = 15

      const cols = computeCols(n, W, H)
      const rows = Math.ceil(n / cols)

      // Two height models for maxCardW:
      // 1. Proportional (accurate at small card widths): controls scale with cqw, C includes C_BODY
      // 2. Capped (accurate at large card widths): controls hit clamp() caps ~85px, C is just display aspect
      // Take the less restrictive (larger maxCardW) — the controls will actually fit.
      const sumC = rowMaxCs(cols).reduce((a, b) => a + b, 0)
      const sumAspect = rowMaxAspects(cols).reduce((a, b) => a + b, 0)
      const maxCardW = Math.max(
        (H - K * rows - GAP * (rows - 1)) / sumC,
        (H - 85 * rows - GAP * (rows - 1)) / sumAspect
      )

      const cardW = Math.min((W - GAP * (cols - 1)) / cols, maxCardW)
      const maxW = Math.round(cols * cardW + GAP * (cols - 1))

      return { gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth: `${maxW}px` }
    })

    function displayById(id) {
      return labelledDisplays.value.find(d => d.id === id) || null
    }

    const selectedDisplay = computed(() => labelledDisplays.value.find(d => d.id === selectedDisplayId.value) || null)

    function handleRenameDisplay({ displayId, label }) {
      const labels = { ...customDisplayLabels.value }
      if (label.trim()) labels[displayId] = label.trim()
      else delete labels[displayId]
      customDisplayLabels.value = labels
      localStorage.setItem('displayLabels', JSON.stringify(labels))
    }

    function selectDisplay({ displayId }) {
      selectedDisplayId.value = displayId
      showDisplayPicker.value = false
    }

    function headerFixedW() {
      const headerEl = document.querySelector('.header')
      const urlBar = headerEl?.querySelector('.url-bar')
      return urlBar
        ? Array.from(urlBar.children)
            .filter(el => !el.matches('.url-input-wrap'))
            .reduce((sum, el) => sum + el.offsetWidth, 0)
          + (urlBar.children.length - 1) * 8
          + 32
          + 120
        : 500
    }

    function updateMinimumSize() {
      const n = windows.value.length
      if (!n || !containerW.value || !containerH.value) return
      const GAP = 20, K = 15, MAIN_PAD = 40, MIN_CARD_W = 410
      const headerEl = document.querySelector('.header')
      const HEADER_H = headerEl ? headerEl.offsetHeight : 64

      const cols = computeCols(n, containerW.value, containerH.value)
      const rows = Math.ceil(n / cols)
      const sumC = rowMaxCs(cols).reduce((a, b) => a + b, 0)

      const chromeW = window.outerWidth - window.innerWidth
      const chromeH = window.outerHeight - window.innerHeight
      const minW = Math.max(cols * MIN_CARD_W + (cols - 1) * GAP + MAIN_PAD, headerFixedW())
      const minH = Math.round(sumC * MIN_CARD_W + rows * K + (rows - 1) * GAP) + MAIN_PAD + HEADER_H
      window.api.setMinimumSize(Math.round(minW) + chromeW, Math.round(minH) + chromeH)
    }

    function fitWindowToCards(n, savedCardW = null, prevCount = 0, savedCols = 0) {
      const count = Math.max(n, 1)
      const GAP = 20, K = 15, MAIN_PAD = 40, MIN_CARD_W = 410

      const primary = displays.value.find(d => d.isPrimary) || displays.value[0]
      const defaultCardW = primary ? Math.round(primary.bounds.width * 0.27) : 480

      // Use the card width captured before windows.value was updated; fall back to default.
      const CARD_W = (savedCardW !== null && savedCardW >= 200) ? savedCardW : defaultCardW

      const headerEl = document.querySelector('.header')
      const HEADER_H = headerEl ? headerEl.offsetHeight : 64

      // When removing windows, preserve the previous column count (capped at new window count)
      // so the window doesn't unnecessarily collapse to fewer columns.
      // When adding, use the sqrt heuristic for a balanced layout.
      const cols = (n < prevCount && savedCols > 0)
        ? Math.max(1, Math.min(savedCols, count))
        : Math.max(1, Math.min(count, Math.round(Math.sqrt(count))))
      const rows = Math.ceil(count / cols)
      const rowCs = rowMaxCs(cols)
      const sumC = rowCs.reduce((a, b) => a + b, 0)
      const w = Math.max(cols * CARD_W + (cols - 1) * GAP + MAIN_PAD, headerFixedW())
      const h = sumC * CARD_W + rows * K + (rows - 1) * GAP + MAIN_PAD + HEADER_H

      // Update minimum BEFORE setContentSize — Electron silently rejects a resize that
      // falls below the current minimum, so the new minimum must be applied first.
      const chromeW = window.outerWidth - window.innerWidth
      const chromeH = window.outerHeight - window.innerHeight
      const minW = Math.max(cols * MIN_CARD_W + (cols - 1) * GAP + MAIN_PAD, headerFixedW())
      const minH = Math.round(sumC * MIN_CARD_W + rows * K + (rows - 1) * GAP) + MAIN_PAD + HEADER_H
      window.api.setMinimumSize(Math.round(minW) + chromeW, Math.round(minH) + chromeH)
      window.api.setContentSize(Math.round(w), Math.round(h))
    }

    function hideSuggestions() {
      showSuggestions.value = false
      suggestionIndex.value = -1
    }

    function selectSuggestion(url) {
      urlInput.value = url
      hideSuggestions()
    }

    function handleSuggestionsKey(e) {
      const suggestions = filteredRecentUrls.value
      if (!showSuggestions.value || !suggestions.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        suggestionIndex.value = Math.min(suggestionIndex.value + 1, suggestions.length - 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        suggestionIndex.value = Math.max(suggestionIndex.value - 1, -1)
      } else if (e.key === 'Escape') {
        hideSuggestions()
      } else if (e.key === 'Enter' && suggestionIndex.value >= 0) {
        e.stopImmediatePropagation()
        selectSuggestion(suggestions[suggestionIndex.value])
      }
    }

    function loadReloadSettings(displayId) {
      try { return JSON.parse(localStorage.getItem(`reload:${displayId}`)) } catch { return null }
    }

    function saveReloadSettings(displayId, settings) {
      localStorage.setItem(`reload:${displayId}`, JSON.stringify(settings))
    }

    function startReloadTimer(id, interval) {
      clearReloadTimer(id)
      reloadCycleStarts.value = { ...reloadCycleStarts.value, [id]: Date.now() }
      reloadTimers[id] = setInterval(() => {
        reloadCycleStarts.value = { ...reloadCycleStarts.value, [id]: Date.now() }
        refreshWindow(id)
      }, Math.max(1, interval) * 1000)
    }

    function clearReloadTimer(id) {
      if (reloadTimers[id]) { clearInterval(reloadTimers[id]); delete reloadTimers[id] }
      if (id in reloadCycleStarts.value) {
        const next = { ...reloadCycleStarts.value }
        delete next[id]
        reloadCycleStarts.value = next
      }
    }

    function initWindowSettings(win) {
      if (windowSettings.value[win.id]) return
      const saved = loadReloadSettings(win.displayId)
      windowSettings.value = { ...windowSettings.value, [win.id]: saved || { autoReload: false, reloadInterval: 30 } }
      if (saved?.autoReload) startReloadTimer(win.id, saved.reloadInterval)
    }

    async function handlePin(id) {
      const win = windows.value.find(w => w.id === id)
      if (!win) return
      await window.api.setWindowAlwaysOnTop(id, !win.alwaysOnTop)
    }

    async function handleApplyCss(id, css) {
      await window.api.injectCSS(id, css)
    }

    function handleSetReload(id, enabled, interval) {
      interval = Math.max(1, interval || 1)
      const win = windows.value.find(w => w.id === id)
      if (win) saveReloadSettings(win.displayId, { autoReload: enabled, reloadInterval: interval })
      windowSettings.value = { ...windowSettings.value, [id]: { autoReload: enabled, reloadInterval: interval } }
      if (enabled) startReloadTimer(id, interval)
      else clearReloadTimer(id)
    }

    function saveRecentUrl(url) {
      const list = [url, ...recentUrls.value.filter(u => u !== url)].slice(0, 10)
      recentUrls.value = list
      localStorage.setItem('recentUrls', JSON.stringify(list))
    }

    function removeRecentUrl(url) {
      const list = recentUrls.value.filter(u => u !== url)
      recentUrls.value = list
      localStorage.setItem('recentUrls', JSON.stringify(list))
    }

    async function init() {
      appVersion.value = await window.api.getVersion()
      displays.value = await window.api.listDisplays()
      const defaultDisplay = displays.value.find(d => !d.isPrimary) || displays.value[0]
      if (defaultDisplay) selectedDisplayId.value = defaultDisplay.id

      windows.value = await window.api.listWindows()
      fitWindowToCards(windows.value.length)
      for (const win of windows.value) initWindowSettings(win)

      unsubscribe = window.api.onWindowsUpdated(updated => {
        const prevIds = new Set(windows.value.map(w => w.id))
        const prevDisplayById = new Map(windows.value.map(w => [w.id, w.displayId]))
        const prevCount = windows.value.length

        // Capture current card width BEFORE updating windows.value so effectiveC / rowMaxCs
        // still reflect the previous layout when we compute it.
        let savedCardW = null, savedCols = 0
        if (prevCount > 0 && containerW.value > 0 && containerH.value > 0) {
          const GAP = 20, K = 15
          savedCols = computeCols(prevCount, containerW.value, containerH.value)
          const rows = Math.ceil(prevCount / savedCols)
          const sumC = rowMaxCs(savedCols).reduce((a, b) => a + b, 0)
          const maxCW = (containerH.value - K * rows - GAP * (rows - 1)) / sumC
          const cw = Math.min((containerW.value - GAP * (savedCols - 1)) / savedCols, maxCW)
          if (cw >= 200) savedCardW = Math.round(cw)
        }

        const nextSettings = { ...windowSettings.value }
        for (const win of windows.value) {
          if (!updated.find(w => w.id === win.id)) {
            clearReloadTimer(win.id)
            delete nextSettings[win.id]
          }
        }
        windowSettings.value = nextSettings
        windows.value = updated
        const displayChanged = updated.some(w => prevDisplayById.get(w.id) !== w.displayId)
        if (updated.length !== prevCount || displayChanged) fitWindowToCards(updated.length, savedCardW, prevCount, savedCols)
        for (const win of updated) {
          if (!prevIds.has(win.id)) initWindowSettings(win)
        }
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
      saveRecentUrl(url)
      await window.api.openWindow(url, selectedDisplayId.value)
      urlInput.value = ''
    }

    async function refreshWindow(id) {
      await window.api.refreshWindow(id)
    }

    async function closeWindow(id) {
      clearReloadTimer(id)
      await window.api.closeWindow(id)
      const next = { ...thumbnails.value }
      delete next[id]
      thumbnails.value = next
      if (interactiveWindowId.value === id) interactiveWindowId.value = null
    }

    function toggleInteractive(id) {
      interactiveWindowId.value = interactiveWindowId.value === id ? null : id
    }

    async function navigateWindow(id, url) {
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      await window.api.navigateWindow(id, url)
    }

    async function goBack(id) { await window.api.goBack(id) }
    async function goForward(id) { await window.api.goForward(id) }

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
      if (blackout && interactiveWindowId.value === id) interactiveWindowId.value = null
      await window.api.blackoutWindow(id, blackout)
    }

    async function setWindowVisibility(id, hidden) {
      if (hidden && interactiveWindowId.value === id) interactiveWindowId.value = null
      await window.api.setWindowVisibility(id, hidden)
    }

    async function toggleAlwaysOnTop() {
      alwaysOnTop.value = !alwaysOnTop.value
      await window.api.setAlwaysOnTop(alwaysOnTop.value)
    }

    function startMove(win, anchor) {
      movingWindow.value = win
      moveAnchor.value = anchor ?? null
    }

    function openDisplayPicker(event) {
      const btnRect = event.currentTarget.getBoundingClientRect()
      const pinBtn = event.currentTarget.closest('.url-bar')?.querySelector('.btn-pin')
      const pinRect = pinBtn?.getBoundingClientRect()
      displayPickerAnchor.value = {
        top: btnRect.top,
        bottom: btnRect.bottom,
        left: btnRect.left,
        right: pinRect ? pinRect.right : btnRect.right
      }
      showDisplayPicker.value = true
    }

    async function doMove({ windowId, displayId }) {
      await window.api.moveWindow(windowId, displayId)
      movingWindow.value = null
    }

    onMounted(() => {
      init()
      resizeObserver = new ResizeObserver(([entry]) => {
        containerW.value = entry.contentRect.width
        containerH.value = entry.contentRect.height
        updateMinimumSize()
      })
      if (mainRef.value) resizeObserver.observe(mainRef.value)
    })

    onUnmounted(() => {
      if (unsubscribe) unsubscribe()
      if (unsubDisplays) unsubDisplays()
      if (thumbTimer) clearInterval(thumbTimer)
      if (resizeObserver) resizeObserver.disconnect()
      Object.keys(reloadTimers).forEach(id => clearReloadTimer(Number(id)))
    })

    return {
      urlInput, displays, labelledDisplays, selectedDisplayId, selectedDisplay, windows, thumbnails, movingWindow, moveAnchor, showDisplayPicker, displayPickerAnchor, alwaysOnTop, interactiveWindowId,
      recentUrls, filteredRecentUrls, showSuggestions, suggestionIndex, appVersion,
      hideSuggestions, selectSuggestion, handleSuggestionsKey, removeRecentUrl,
      mainRef, gridStyle,
      windowSettings, reloadCycleStarts,
      displayById, openWindow, refreshWindow, closeWindow, navigateWindow, goBack, goForward, blackoutWindow,
      setWindowVisibility, toggleAlwaysOnTop, startMove, openDisplayPicker, doMove, selectDisplay, toggleInteractive, interactClick, interactScroll, interactKey,
      handlePin, handleSetReload, handleApplyCss, handleRenameDisplay
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

.url-input-wrap {
  flex: 1;
  position: relative;
  min-width: 0;
}

.url-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  list-style: none;
  padding: 4px 0;
  margin: 0;
  z-index: 100;
  max-height: 220px;
  overflow-y: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.url-suggestions li {
  padding: 7px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.url-suggestions li:hover,
.url-suggestions li.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.suggestion-url {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.suggestion-delete {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity 0.1s, background 0.1s, color 0.1s;
}

.url-suggestions li:hover .suggestion-delete,
.url-suggestions li.active .suggestion-delete {
  opacity: 1;
}

.suggestion-delete:hover {
  background: rgba(248, 81, 73, 0.15);
  color: var(--danger);
}

.url-input {
  width: 100%;
  height: 35px;
  box-sizing: border-box;
  padding: 0 12px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.url-input:focus {
  border-color: var(--accent);
}

.url-input::placeholder {
  color: var(--text-secondary);
}


.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 35px;
  box-sizing: border-box;
  padding: 0 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid transparent;
  transition: opacity 0.15s, background 0.12s, color 0.12s, border-color 0.12s;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.btn-primary {
  background: var(--accent);
  border-color: rgba(0, 0, 0, 0.2);
  color: #0d1117;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.82;
}

.btn-display {
  gap: 5px;
  padding: 0 11px;
  background: var(--bg-dark);
  border-color: var(--border);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.btn-display:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn-pin {
  padding: 0 10px;
  background: var(--bg-dark);
  border-color: var(--border);
  color: var(--text-secondary);
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
  overflow: hidden;
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

.empty-version {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.45;
  margin-top: 8px;
}

.window-grid {
  display: grid;
  gap: 20px;
  align-content: start;
  margin: 0 auto;
  width: 100%;
}
</style>
