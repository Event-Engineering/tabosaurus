<template>
  <div class="card" :class="{ 'card-blacked-out': win.blackout, 'card-interactive': interactive, 'card-hidden': win.hidden, 'card-pinned': win.alwaysOnTop && !win.blackout && !interactive }">
    <!-- Thumbnail -->
    <div
      class="thumbnail-wrap"
      :class="{ 'thumbnail-interactive': interactive }"
      :style="display ? { aspectRatio: `${display.bounds.width} / ${display.bounds.height}` } : {}"
      @click="onThumbnailClick"
      @wheel.prevent="onThumbnailScroll"
    >
      <img v-if="thumbnail" :src="thumbnail" class="thumbnail" :alt="win.url" />
      <div v-else class="thumbnail-placeholder">
        <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span>Loading preview…</span>
      </div>
      <!-- Typing overlay -->
      <div v-if="typing && interactive" class="type-overlay" @click.stop>
        <svg class="type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <line x1="6" y1="10" x2="6" y2="10" stroke-width="2.5"/>
          <line x1="10" y1="10" x2="10" y2="10" stroke-width="2.5"/>
          <line x1="14" y1="10" x2="14" y2="10" stroke-width="2.5"/>
          <line x1="18" y1="10" x2="18" y2="10" stroke-width="2.5"/>
          <line x1="6" y1="14" x2="6" y2="14" stroke-width="2.5"/>
          <line x1="18" y1="14" x2="18" y2="14" stroke-width="2.5"/>
          <line x1="10" y1="14" x2="14" y2="14"/>
        </svg>
        <input
          ref="typeInputRef"
          v-model="typeBuffer"
          class="type-input"
          @keydown="onTypeKeydown"
          placeholder="Typing to browser…"
          spellcheck="false"
          autocomplete="off"
        />
        <span class="type-hint">Esc to stop</span>
      </div>

      <!-- Pin badge -->
      <button
        class="pin-badge"
        :class="{ 'pin-active': win.alwaysOnTop }"
        @click.stop="$emit('pin')"
        :title="win.alwaysOnTop ? 'Unpin (disable always-on-top)' : 'Pin on top of all windows'"
      >
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="17" x2="12" y2="22"></line>
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
        </svg>
      </button>

      <!-- Interactive mode indicator -->
      <div v-if="interactive" class="interactive-badge">
        <span class="interactive-dot"></span>Live
      </div>

      <!-- Hidden overlay on thumbnail -->
      <Transition name="hidden-overlay">
        <div v-if="win.hidden" class="hidden-overlay">
          <svg class="hidden-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
          <span>Hidden</span>
        </div>
      </Transition>

      <!-- Blackout overlay on thumbnail -->
      <Transition name="blackout" :duration="550">
        <div v-if="win.blackout" class="blackout-overlay">
          <div class="curtain-left"></div>
          <div class="curtain-right"></div>
          <div class="blackout-label">
            <svg class="blackout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="2" y1="3" x2="22" y2="3"></line>
              <path d="M2 3 L2 21 C4 23 10 21 12 19 L12 3"></path>
              <path d="M22 3 L22 21 C20 23 14 21 12 19 L12 3"></path>
            </svg>
            <span>Blacked Out</span>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Info + URL edit -->
    <div class="card-body">
      <div class="url-row">
        <button @click="$emit('back')" class="icon-btn nav-btn" :disabled="!win.canGoBack" title="Back">
          <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <button @click="$emit('forward')" class="icon-btn nav-btn" :disabled="!win.canGoForward" title="Forward">
          <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
        <template v-if="!editing">
          <div class="url" :title="win.url" @click="startEdit">{{ win.url }}</div>
          <div class="display-tag" v-if="display">
            <span class="dot" :class="{ 'dot-primary': display.isPrimary }" :title="display.isPrimary ? 'Primary. Obviously.' : 'Secondary. Mysteriously.'"></span>
            <input
              v-if="editingLabel"
              ref="labelInputRef"
              class="display-label-input"
              v-model="labelDraft"
              @blur="saveLabelEdit"
              @keydown.enter.prevent="$refs.labelInputRef.blur()"
              @keydown.escape="cancelLabelEdit"
              @click.stop
            />
            <span v-else class="display-label" @click.stop="startLabelEdit">{{ display.label }}</span>
          </div>
        </template>
        <template v-else>
          <input
            ref="urlInputRef"
            v-model="editUrl"
            @keyup.enter="confirmEdit"
            @keyup.escape="cancelEdit"
            class="url-edit-input"
            placeholder="https://..."
            spellcheck="false"
            type="text"
          />
          <button @click="confirmEdit" class="icon-btn icon-btn-confirm" title="Navigate">
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
          <button @click="cancelEdit" class="icon-btn icon-btn-cancel" title="Cancel">
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </template>
      </div>
    </div>

    <!-- Settings popover (teleported to body to escape card overflow:hidden) -->
    <Teleport to="body">
      <template v-if="openPopover">
        <div class="wc-popover-backdrop" @click="openPopover = false"></div>
        <div class="wc-popover" :style="popoverStyle">
          <div class="wc-popover-row">
            <div class="wc-popover-title">Auto-reload</div>
            <button
              class="wc-switch"
              :class="{ 'wc-switch-on': settings.autoReload }"
              @click="toggleAutoReload"
              :title="settings.autoReload ? 'Disable auto-reload' : 'Enable auto-reload'"
              role="switch"
              :aria-checked="settings.autoReload"
            ><span class="wc-switch-thumb"></span></button>
          </div>
          <label class="wc-popover-interval">
            <span>Every</span>
            <input
              type="text"
              v-model="localIntervalText"
              class="wc-popover-duration"
              placeholder="0:30"
              @blur="onIntervalBlur"
              @keydown.enter="$event.target.blur()"
            />
          </label>
          <div class="wc-popover-divider"></div>
          <div class="wc-popover-row">
            <div class="wc-popover-title">Zoom</div>
            <div class="wc-zoom-controls">
              <button class="wc-zoom-btn wc-zoom-reset" :style="{ visibility: currentZoom !== 1 ? 'visible' : 'hidden' }" @click="$emit('set-zoom', 1)" title="Reset to 100%">↺</button>
              <button class="wc-zoom-btn" @click="zoomOut" :disabled="currentZoom <= 0.1">−</button>
              <input
                v-if="editingZoom"
                ref="zoomInputRef"
                class="wc-zoom-input"
                v-model="zoomDraft"
                @blur="confirmZoomEdit"
                @keydown.enter.prevent="zoomInputRef.blur()"
                @keydown.escape.prevent="cancelZoomEdit"
              />
              <span v-else class="wc-zoom-value" @click="startZoomEdit">{{ Math.round(currentZoom * 100) }}%</span>
              <button class="wc-zoom-btn" @click="zoomIn" :disabled="currentZoom >= 5">+</button>
            </div>
          </div>
          <div class="wc-popover-divider"></div>
          <div class="wc-popover-row">
            <div class="wc-popover-title">Audio Output</div>
          </div>
          <div class="wc-audio-select-wrap">
            <select
              class="wc-audio-select"
              :value="win.audioOutputDeviceId || ''"
              @change="$emit('set-audio-output', $event.target.value)"
            >
              <option value="">System default</option>
              <option v-for="d in audioOutputDevices" :key="d.deviceId" :value="d.deviceId">
                {{ d.label || d.deviceId }}
              </option>
            </select>
          </div>
          <div class="wc-audio-caveat">Only affects &lt;audio&gt; and &lt;video&gt; elements — Web Audio API sources are not routed.</div>
          <div class="wc-popover-divider"></div>
          <div class="wc-popover-row">
            <div class="wc-popover-title">Inject CSS</div>
            <button
              class="wc-switch"
              :class="{ 'wc-switch-on': win.customCSS }"
              @click="toggleCSSEnabled"
              :title="win.customCSS ? 'Remove injected CSS' : 'Apply CSS'"
              role="switch"
              :aria-checked="!!win.customCSS"
            ><span class="wc-switch-thumb"></span></button>
          </div>
          <textarea
            v-model="localCss"
            class="wc-css-textarea"
            spellcheck="false"
            placeholder="body { background: #000; }"
          ></textarea>
          <div class="wc-popover-footer">
            <button v-if="localCss" class="wc-popover-btn wc-popover-clear" @click="clearCss">Clear</button>
          </div>
        </div>
      </template>
    </Teleport>

    <!-- Actions -->
    <div class="card-actions">
      <button
        @click="$emit('toggle-interactive')"
        class="action-btn action-btn-interact"
        :class="{ 'action-btn-active': interactive }"
        :disabled="win.hidden || win.blackout"
        :title="interactive ? 'Exit interactive mode' : 'Interact via thumbnail'"
      >
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 4l7.07 17 2.51-7.39L21 11.07z"></path>
        </svg>
        {{ interactive ? 'Done' : 'Interact' }}
      </button>
      <button
        @click="$emit('refresh')"
        class="action-btn"
        :class="{ 'action-btn-autoreload': settings.autoReload }"
        :title="settings.autoReload ? 'Auto-reload active — click to reload now' : 'Refresh page'"
      >
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        {{ settings.autoReload ? formatDuration(countdown) : 'Refresh' }}
      </button>
      <button @click="emitMove($event)" class="action-btn" title="Move to another screen">
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        Move
      </button>
      <button
        @click="$emit('visibility')"
        class="action-btn"
        :class="{ 'action-btn-active': win.hidden }"
        :title="win.hidden ? 'Show window' : 'Hide window'"
      >
        <svg v-if="!win.hidden" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        <svg v-else width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
        {{ win.hidden ? 'Show' : 'Hide' }}
      </button>
      <button
        @click="$emit('blackout')"
        class="action-btn"
        :class="{ 'action-btn-active': win.blackout }"
        :title="win.blackout ? 'Remove blackout' : 'Black out screen'"
      >
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="2" y1="3" x2="22" y2="3"></line>
          <path d="M2 3 L2 21 C4 23 10 21 12 19 L12 3"></path>
          <path d="M22 3 L22 21 C20 23 14 21 12 19 L12 3"></path>
        </svg>
        {{ win.blackout ? 'Unblack' : 'Blackout' }}
      </button>
      <button
        @click="$emit('set-muted', !win.muted)"
        class="action-btn action-btn-close"
        :class="{ 'action-btn-muted': win.muted }"
        :title="win.muted ? 'Unmute audio' : 'Mute audio'"
      >
        <svg v-if="!win.muted" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
        <svg v-else width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
      </button>
      <button
        ref="cogBtnRef"
        @click="togglePopover()"
        class="action-btn action-btn-close"
        :class="{ 'action-btn-cog-active': settings.autoReload || win.customCSS || (win.zoomFactor && win.zoomFactor !== 1) || win.audioOutputDeviceId }"
        title="Advanced settings"
      >
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      <button @click="$emit('close')" class="action-btn action-btn-close action-btn-danger" title="Close window">
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  </div>
</template>

<script>
import { ref, computed, nextTick, watch, onUnmounted } from 'vue'

export default {
  name: 'WindowCard',
  props: {
    win: { type: Object, required: true },
    thumbnail: { type: String, default: null },
    display: { type: Object, default: null },
    interactive: { type: Boolean, default: false },
    settings: { type: Object, default: () => ({ autoReload: false, reloadInterval: 30 }) },
    audioOutputDevices: { type: Array, default: () => [] }
  },
  emits: ['refresh', 'move', 'close', 'navigate', 'back', 'forward', 'blackout', 'visibility', 'interact-click', 'interact-scroll', 'interact-key', 'toggle-interactive', 'pin', 'set-reload', 'apply-css', 'rename-display', 'set-zoom', 'set-muted', 'set-audio-output'],
  setup(props, { emit }) {
    const editing = ref(false)
    const editUrl = ref('')
    const urlInputRef = ref(null)
    const labelInputRef = ref(null)
    const editingLabel = ref(false)
    const labelDraft = ref('')

    function startLabelEdit() {
      labelDraft.value = props.display?.label || ''
      editingLabel.value = true
      nextTick(() => {
        labelInputRef.value?.select()
      })
    }

    function saveLabelEdit() {
      if (editingLabel.value) {
        emit('rename-display', { displayId: props.display.id, label: labelDraft.value })
        editingLabel.value = false
      }
    }

    function cancelLabelEdit() {
      editingLabel.value = false
    }
    const typing = ref(false)
    const typeBuffer = ref('')
    const typeInputRef = ref(null)

    function onThumbnailClick(e) {
      if (!props.interactive) return
      const rect = e.currentTarget.getBoundingClientRect()
      emit('interact-click',
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
        async (isTextInput, currentValue) => {
          if (isTextInput) {
            typing.value = true
            typeBuffer.value = currentValue || ''
            await nextTick()
            typeInputRef.value?.focus()
            typeInputRef.value?.setSelectionRange(typeBuffer.value.length, typeBuffer.value.length)
          } else {
            typing.value = false
            typeBuffer.value = ''
          }
        }
      )
    }

    function onThumbnailScroll(e) {
      if (!props.interactive) return
      const rect = e.currentTarget.getBoundingClientRect()
      const multiplier = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1
      emit('interact-scroll',
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
        e.deltaX * multiplier,
        e.deltaY * multiplier
      )
    }

    function onDocKeydown(e) {
      if (e.key === 'Escape' && props.interactive && !typing.value) {
        emit('toggle-interactive')
        e.preventDefault()
      }
    }

    watch(() => props.interactive, (val) => {
      if (val) document.addEventListener('keydown', onDocKeydown)
      else {
        document.removeEventListener('keydown', onDocKeydown)
        typing.value = false
        typeBuffer.value = ''
      }
    })

    onUnmounted(() => {
      document.removeEventListener('keydown', onDocKeydown)
      document.removeEventListener('keydown', onPopoverKeydown)
      if (countdownTimer) clearInterval(countdownTimer)
    })

    async function onTypeKeydown(e) {
      if (e.key === 'Escape') {
        typing.value = false
        typeBuffer.value = ''
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.key === 'Tab') e.preventDefault()
      if (e.key === 'Enter') typeBuffer.value = ''
      const modifiers = []
      if (e.shiftKey) modifiers.push('shift')
      if (e.ctrlKey) modifiers.push('control')
      if (e.altKey) modifiers.push('alt')
      if (e.metaKey) modifiers.push('meta')
      const onAfterKey = e.key === 'Tab' ? async (newValue) => {
        typeBuffer.value = newValue || ''
        await nextTick()
        typeInputRef.value?.select()
      } : null
      emit('interact-key', e.key, modifiers, onAfterKey)
      await nextTick()
      typeInputRef.value?.focus()
    }


    async function startEdit() {
      editing.value = true
      editUrl.value = props.win.url
      await nextTick()
      urlInputRef.value?.focus()
      urlInputRef.value?.select()
    }

    function confirmEdit() {
      const url = editUrl.value.trim()
      if (url) emit('navigate', url)
      editing.value = false
    }

    function cancelEdit() {
      editing.value = false
    }

    // ── Advanced: popovers ────────────────────────────────────────
    const openPopover = ref(false)
    const localCss = ref('')
    const localInterval = ref(30)
    const localIntervalText = ref('0:30')
    const cogBtnRef = ref(null)
    const popoverPos = ref({ bottom: 0, right: 0, maxH: 600, maxW: 400 })

    const popoverStyle = computed(() => {
      const pos = popoverPos.value
      return {
        position: 'fixed',
        bottom: `${pos.bottom}px`,
        right: `${pos.right}px`,
        maxHeight: `${pos.maxH}px`,
        maxWidth: `${pos.maxW}px`,
        zIndex: 1000
      }
    })

    function formatDuration(secs) {
      const m = Math.floor(secs / 60)
      const s = secs % 60
      return `${m}:${String(s).padStart(2, '0')}`
    }

    function parseDuration(str) {
      const colonMatch = str.trim().match(/^(\d+):(\d{1,2})$/)
      if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2])
      const n = parseInt(str)
      return isNaN(n) ? null : n
    }

    function onIntervalBlur() {
      const secs = Math.max(1, parseDuration(localIntervalText.value) ?? localInterval.value)
      localInterval.value = secs
      localIntervalText.value = formatDuration(secs)
      onIntervalChange()
    }

    function togglePopover() {
      if (openPopover.value) { openPopover.value = false; return }
      if (cogBtnRef.value) {
        const rect = cogBtnRef.value.getBoundingClientRect()
        popoverPos.value = {
          bottom: window.innerHeight - rect.top + 6,
          right: Math.max(20, window.innerWidth - rect.right),
          maxH: rect.top - 12,
          maxW: rect.right - 20
        }
      }
      if (!localCss.value && props.win.customCSS) localCss.value = props.win.customCSS
      localInterval.value = props.settings?.reloadInterval ?? 30
      localIntervalText.value = formatDuration(localInterval.value)
      openPopover.value = true
    }

    function toggleCSSEnabled() {
      emit('apply-css', { css: props.win.customCSS ? '' : localCss.value })
    }

    function clearCss() {
      localCss.value = ''
      emit('apply-css', { css: '' })
    }

    watch(() => props.win.customCSS, (val) => {
      if (!localCss.value && val) localCss.value = val
    })

    function onIntervalChange() {
      localInterval.value = Math.max(1, localInterval.value || 1)
      emit('set-reload', { enabled: props.settings?.autoReload ?? false, interval: localInterval.value })
    }

    function toggleAutoReload() {
      emit('set-reload', { enabled: !props.settings?.autoReload, interval: Math.max(1, localInterval.value || 1) })
    }

    function onPopoverKeydown(e) {
      if (e.key === 'Escape') { openPopover.value = false; e.preventDefault(); e.stopPropagation() }
    }

    watch(openPopover, (val) => {
      if (val) document.addEventListener('keydown', onPopoverKeydown)
      else document.removeEventListener('keydown', onPopoverKeydown)
    })

    const countdown = ref(0)
    let countdownTimer = null

    watch(
      [() => props.settings.autoReload, () => props.settings.reloadStartedAt, () => props.settings.reloadInterval],
      () => {
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
        if (!props.settings.autoReload || !props.settings.reloadStartedAt) { countdown.value = 0; return }
        const tick = () => {
          const elapsed = Math.floor((Date.now() - props.settings.reloadStartedAt) / 1000)
          countdown.value = Math.max(0, (props.settings.reloadInterval ?? 30) - elapsed)
        }
        tick()
        countdownTimer = setInterval(tick, 500)
      },
      { immediate: true }
    )

    // ── Zoom ─────────────────────────────────────────────────────
    const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0]
    const currentZoom = computed(() => props.win.zoomFactor || 1.0)
    const editingZoom = ref(false)
    const zoomDraft = ref('')
    const zoomInputRef = ref(null)

    function zoomIn() {
      const next = ZOOM_STEPS.find(s => s > currentZoom.value + 0.01)
      if (next !== undefined) emit('set-zoom', next)
    }

    function zoomOut() {
      const next = [...ZOOM_STEPS].reverse().find(s => s < currentZoom.value - 0.01)
      if (next !== undefined) emit('set-zoom', next)
    }

    function startZoomEdit() {
      zoomDraft.value = String(Math.round(currentZoom.value * 100))
      editingZoom.value = true
      nextTick(() => zoomInputRef.value?.select())
    }

    function confirmZoomEdit() {
      const n = parseFloat(zoomDraft.value.replace('%', '').trim())
      if (!isNaN(n) && n >= 10 && n <= 500) {
        emit('set-zoom', Math.round(n) / 100)
      }
      editingZoom.value = false
    }

    function cancelZoomEdit() {
      editingZoom.value = false
    }

    function emitMove(e) {
      const btn = e.currentTarget.getBoundingClientRect()
      const card = e.currentTarget.closest('.card').getBoundingClientRect()
      emit('move', { top: btn.top, bottom: btn.bottom, left: btn.left, right: btn.right, cardLeft: card.left, cardRight: card.right })
    }

    return { editing, editUrl, urlInputRef, startEdit, confirmEdit, cancelEdit, onThumbnailClick, onThumbnailScroll, typing, typeBuffer, typeInputRef, onTypeKeydown,
      openPopover, localCss, localInterval, localIntervalText, cogBtnRef, popoverStyle, countdown,
      togglePopover, toggleCSSEnabled, clearCss, onIntervalBlur, toggleAutoReload, formatDuration,
      labelInputRef, editingLabel, labelDraft, startLabelEdit, saveLabelEdit, cancelLabelEdit,
      currentZoom, zoomIn, zoomOut, editingZoom, zoomDraft, zoomInputRef, startZoomEdit, confirmZoomEdit, cancelZoomEdit,
      emitMove }
  }
}
</script>

<style scoped>
.card {
  container-type: inline-size;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.card:hover {
  border-color: rgba(157, 119, 245, 0.45);
  box-shadow: 0 0 0 1px rgba(157, 119, 245, 0.15);
}

/* Pinned: strong accent glow */
.card-pinned {
  border-color: rgba(157, 119, 245, 0.7);
  box-shadow: 0 0 0 1px rgba(157, 119, 245, 0.35), 0 0 18px rgba(157, 119, 245, 0.22);
}

.card-pinned:hover {
  border-color: rgba(157, 119, 245, 0.95);
  box-shadow: 0 0 0 2px rgba(157, 119, 245, 0.55), 0 0 24px rgba(157, 119, 245, 0.32);
}

/* Hidden: grey border, thumbnail has the overlay */
.card-hidden {
  border-color: rgba(140, 140, 160, 0.45);
  box-shadow: 0 0 0 1px rgba(140, 140, 160, 0.15), 0 0 12px rgba(140, 140, 160, 0.08);
}

.card-hidden:hover {
  border-color: rgba(140, 140, 160, 0.7);
  box-shadow: 0 0 0 1px rgba(140, 140, 160, 0.3), 0 0 16px rgba(140, 140, 160, 0.14);
}

/* Blacked out: red border + outer glow */
.card-blacked-out {
  border-color: rgba(248, 81, 73, 0.5);
  box-shadow: 0 0 0 1px rgba(248, 81, 73, 0.2), 0 0 12px rgba(248, 81, 73, 0.15);
}

.card-blacked-out:hover {
  border-color: rgba(248, 81, 73, 0.8);
  box-shadow: 0 0 0 1px rgba(248, 81, 73, 0.35), 0 0 16px rgba(248, 81, 73, 0.22);
}

/* Interactive: green glow (highest priority) */
.card-interactive {
  border-color: #3fb950;
  box-shadow: 0 0 0 2px rgba(63, 185, 80, 0.4), 0 0 16px rgba(63, 185, 80, 0.25);
}

.card-interactive:hover {
  border-color: #3fb950;
  box-shadow: 0 0 0 2px rgba(63, 185, 80, 0.55), 0 0 20px rgba(63, 185, 80, 0.35);
}

/* Thumbnail */
.thumbnail-interactive {
  /* Custom crosshair: white outline drawn first, black on top — visible on any background */
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cline x1='12' y1='1' x2='12' y2='9' stroke='white' stroke-width='3' stroke-linecap='round'/%3E%3Cline x1='12' y1='15' x2='12' y2='23' stroke='white' stroke-width='3' stroke-linecap='round'/%3E%3Cline x1='1' y1='12' x2='9' y2='12' stroke='white' stroke-width='3' stroke-linecap='round'/%3E%3Cline x1='15' y1='12' x2='23' y2='12' stroke='white' stroke-width='3' stroke-linecap='round'/%3E%3Ccircle cx='12' cy='12' r='3' stroke='white' stroke-width='2.5' fill='none'/%3E%3Cline x1='12' y1='1' x2='12' y2='9' stroke='black' stroke-width='1.5' stroke-linecap='round'/%3E%3Cline x1='12' y1='15' x2='12' y2='23' stroke='black' stroke-width='1.5' stroke-linecap='round'/%3E%3Cline x1='1' y1='12' x2='9' y2='12' stroke='black' stroke-width='1.5' stroke-linecap='round'/%3E%3Cline x1='15' y1='12' x2='23' y2='12' stroke='black' stroke-width='1.5' stroke-linecap='round'/%3E%3Ccircle cx='12' cy='12' r='3' stroke='black' stroke-width='1' fill='none'/%3E%3C/svg%3E") 12 12, crosshair;
}

.type-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 1.5cqw;
  padding: 1.5cqw 2cqw;
  background: rgba(13, 17, 23, 0.92);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(63, 185, 80, 0.35);
}

.type-icon {
  color: #3fb950;
  flex-shrink: 0;
  width: 3.5cqw;
  height: 3.5cqw;
  min-width: 12px;
  min-height: 12px;
}

.type-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e6edf3;
  font-size: 2.5cqw;
  font-family: monospace;
  caret-color: #3fb950;
  min-width: 0;
}

.type-input::placeholder {
  color: #484f58;
}

.type-hint {
  flex-shrink: 0;
  font-size: 1.8cqw;
  color: #484f58;
  white-space: nowrap;
}

.interactive-badge {
  position: absolute;
  top: clamp(4px, 1.5cqw, 10px);
  left: clamp(4px, 1.5cqw, 10px);
  z-index: 10;
  display: flex;
  align-items: center;
  height: clamp(20px, 5.5cqw, 32px);
  gap: min(1cqw, 6px);
  padding: 0 min(1.5cqw, 10px);
  background: rgba(0, 0, 0, 0.65);
  color: #3fb950;
  font-size: clamp(9px, 2cqw, 13px);
  font-weight: 600;
  letter-spacing: 0.04em;
  border-radius: 4px;
  pointer-events: none;
  backdrop-filter: blur(4px);
}

.interactive-dot {
  width: clamp(5px, 1.5cqw, 8px);
  height: clamp(5px, 1.5cqw, 8px);
  border-radius: 50%;
  background: #3fb950;
  flex-shrink: 0;
  animation: live-pulse 1.4s ease-in-out infinite;
}

@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}

/* Hidden overlay */
.hidden-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6em;
  background: rgba(20, 22, 30, 0.72);
  backdrop-filter: grayscale(100%) blur(1px);
  color: rgba(255, 255, 255, 0.35);
  font-size: 2.5cqw;
  font-weight: 500;
  letter-spacing: 0.05em;
}

.hidden-icon {
  width: 5cqw;
  height: 5cqw;
  min-width: 18px;
  min-height: 18px;
}

.hidden-overlay-enter-active,
.hidden-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.hidden-overlay-enter-from,
.hidden-overlay-leave-to {
  opacity: 0;
}

.thumbnail-wrap {
  aspect-ratio: 16 / 9; /* fallback — overridden inline from display bounds */
  background: #090c10;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

.thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumbnail-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  color: var(--text-secondary);
  font-size: 2.5cqw;
}

.placeholder-icon {
  width: 6.7cqw;
  height: 6.7cqw;
}

.blackout-overlay {
  position: absolute;
  inset: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.curtain-left,
.curtain-right {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  background: #000;
}

.curtain-left { left: 0; }
.curtain-right { right: 0; }

.blackout-label {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6em;
  color: rgba(255, 255, 255, 0.3);
  font-size: 2.5cqw;
  font-weight: 500;
  letter-spacing: 0.05em;
}

.blackout-icon {
  width: 5cqw;
  height: 5cqw;
}

/* Enter: curtains sweep in, label fades in once closed */
.blackout-enter-active .curtain-left {
  animation: curtain-from-left 0.4s ease forwards;
}
.blackout-enter-active .curtain-right {
  animation: curtain-from-right 0.4s ease forwards;
}
.blackout-enter-active .blackout-label {
  animation: label-fade-in 0.2s 0.3s ease both;
}

/* Leave: label fades first, then curtains open */
.blackout-leave-active .curtain-left {
  animation: curtain-to-left 0.35s 0.15s ease forwards;
}
.blackout-leave-active .curtain-right {
  animation: curtain-to-right 0.35s 0.15s ease forwards;
}
.blackout-leave-active .blackout-label {
  animation: label-fade-out 0.15s ease forwards;
}

@keyframes curtain-from-left {
  from { transform: translateX(-100%); }
  to   { transform: translateX(0); }
}
@keyframes curtain-from-right {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@keyframes curtain-to-left {
  from { transform: translateX(0); }
  to   { transform: translateX(-100%); }
}
@keyframes curtain-to-right {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}
@keyframes label-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes label-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

/* Card body */
.card-body {
  padding: min(1.5cqw, 10px) min(2.5cqw, 16px);
  flex: 1;
  min-width: 0;
}

.url-row {
  display: flex;
  align-items: center;
  gap: min(1.25cqw, 8px);
}

.url {
  flex: 1;
  font-size: clamp(10px, 2.5cqw, 15px);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  cursor: pointer;
}

.url:hover {
  color: var(--accent);
}

.icon-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(17px, 4.2cqw, 24px);
  height: clamp(17px, 4.2cqw, 24px);
  font-size: clamp(10px, 2.3cqw, 13px);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  transition: background 0.12s, color 0.12s;
}

.nav-btn {
  opacity: 0.5;
  flex-shrink: 0;
}

.nav-btn:not(:disabled):hover {
  opacity: 1;
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-btn:disabled {
  opacity: 0.2;
  cursor: default;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon-btn-confirm:hover {
  background: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.icon-btn-cancel:hover {
  background: rgba(248, 81, 73, 0.12);
  color: var(--danger);
}

.url-edit-input {
  flex: 1;
  padding: min(0.85cqw, 7px) min(1.25cqw, 10px);
  background: var(--bg-dark);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: clamp(10px, 2.5cqw, 13px);
  font-family: monospace;
  outline: none;
  min-width: 0;
}

.display-tag {
  display: flex;
  align-items: center;
  gap: min(1cqw, 6px);
  font-size: clamp(9px, 2.1cqw, 12px);
  color: var(--text-secondary);
}

.dot {
  width: clamp(4px, 1.25cqw, 7px);
  height: clamp(4px, 1.25cqw, 7px);
  border-radius: 50%;
  background: var(--text-secondary);
  flex-shrink: 0;
}

.dot-primary {
  background: var(--accent);
}

.display-tag {
  line-height: 1;
}

.display-label {
  cursor: text;
  border-radius: 2px;
  line-height: 1;
}

.display-label:hover {
  color: var(--text-primary);
}

.display-label-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--accent);
  color: var(--text-primary);
  font-size: inherit;
  font-family: inherit;
  line-height: 1;
  height: 1em;
  padding: 0;
  margin: 0;
  box-sizing: content-box;
  outline: none;
  width: 8em;
  min-width: 4em;
  max-width: 12em;
}

/* Actions */
.card-actions {
  display: flex;
  border-top: 1px solid var(--border);
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: min(0.85cqw, 6px);
  padding: min(1.5cqw, 10px) min(0.85cqw, 7px);
  background: transparent;
  color: var(--text-secondary);
  font-size: clamp(10px, 2.5cqw, 14px);
  font-weight: 500;
  line-height: 1;
  transition: background 0.12s, color 0.12s;
}

.action-btn svg {
  width: 1.3em;
  height: 1.3em;
  flex-shrink: 0;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.action-btn + .action-btn {
  border-left: 1px solid var(--border);
}

.action-btn-active {
  color: var(--danger);
}

.action-btn-active:hover {
  background: rgba(248, 81, 73, 0.1);
  color: var(--danger);
}

.action-btn-danger:hover {
  background: rgba(248, 81, 73, 0.12);
  color: var(--danger);
}

.action-btn-interact.action-btn-active {
  color: #3fb950;
}

.action-btn-interact.action-btn-active:hover {
  background: rgba(63, 185, 80, 0.1);
  color: #3fb950;
}

.action-btn-close {
  flex: none;
  padding: min(1.5cqw, 10px);
}

/* Pin badge */
.pin-badge {
  position: absolute;
  top: clamp(4px, 1.5cqw, 10px);
  right: clamp(4px, 1.5cqw, 10px);
  z-index: 10;
  width: clamp(20px, 5.5cqw, 32px);
  height: clamp(20px, 5.5cqw, 32px);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(10px, 3cqw, 18px);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, box-shadow 0.15s;
}

.pin-badge:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.7);
}

.pin-active {
  color: var(--accent);
  background: rgba(0, 0, 0, 0.65);
  box-shadow: 0 0 0 1px rgba(157, 119, 245, 0.6);
}

.pin-active:hover {
  color: var(--accent);
  background: rgba(0, 0, 0, 0.8);
  box-shadow: 0 0 0 1px rgba(157, 119, 245, 0.9);
}

.action-btn-cog-active {
  color: var(--accent);
}

.action-btn-cog-active:hover {
  background: rgba(157, 119, 245, 0.1);
  color: var(--accent);
}

.action-btn-autoreload {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.action-btn-autoreload:hover {
  background: rgba(157, 119, 245, 0.1);
  color: var(--accent);
}

.action-btn-muted {
  color: var(--danger);
}

.action-btn-muted:hover {
  background: rgba(248, 81, 73, 0.1);
  color: var(--danger);
}
</style>

<style>
/* Popover — global because it's teleported outside this component's scope */
.wc-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
}

.wc-popover {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  min-width: 240px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow-y: auto;
}

.wc-popover-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.wc-popover-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wc-popover-interval {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.wc-popover-duration {
  width: 56px;
  padding: 5px 8px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  outline: none;
  text-align: center;
  -webkit-user-select: text;
  user-select: text;
}

.wc-popover-duration:focus {
  border-color: var(--accent);
}

.wc-switch {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  flex-shrink: 0;
}

.wc-switch-on {
  background: var(--accent);
  border-color: var(--accent);
}

.wc-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-secondary);
  transition: transform 0.2s, background 0.2s;
}

.wc-switch-on .wc-switch-thumb {
  transform: translateX(16px);
  background: #0d1117;
}

.wc-popover-divider {
  height: 1px;
  background: var(--border);
  margin: 2px 0;
}

.wc-css-textarea {
  width: 100%;
  min-width: 240px;
  height: 110px;
  padding: 8px 10px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  -webkit-user-select: text;
  user-select: text;
}

.wc-css-textarea:focus {
  border-color: var(--accent);
}

.wc-css-textarea::placeholder {
  color: var(--text-secondary);
  opacity: 0.5;
}

.wc-popover-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.wc-popover-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}

.wc-popover-clear {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.wc-popover-clear:hover {
  background: rgba(248, 81, 73, 0.1);
  border-color: rgba(248, 81, 73, 0.4);
  color: var(--danger);
}

.wc-audio-select-wrap {
  position: relative;
}

.wc-audio-select-wrap::after {
  content: '';
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--text-secondary);
  pointer-events: none;
  opacity: 0.6;
}

.wc-audio-select {
  width: 100%;
  padding: 6px 28px 6px 10px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
  -webkit-appearance: none;
  appearance: none;
  transition: border-color 0.12s;
}

.wc-audio-select:focus {
  border-color: var(--accent);
}

.wc-audio-select option {
  background: var(--bg-dark);
  color: var(--text-primary);
}

.wc-audio-select option:checked {
  background: linear-gradient(rgba(157, 119, 245, 0.25), rgba(157, 119, 245, 0.25));
  color: var(--accent);
}

.wc-audio-caveat {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.6;
  line-height: 1.4;
}

.wc-zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.wc-zoom-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s;
  font-family: inherit;
}

.wc-zoom-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.wc-zoom-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.wc-zoom-reset {
  color: var(--accent);
  border-color: rgba(157, 119, 245, 0.35);
}

.wc-zoom-reset:hover {
  background: rgba(157, 119, 245, 0.12);
  color: var(--accent);
}

.wc-zoom-value {
  width: 36px;
  text-align: center;
  font-size: 13px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  cursor: text;
}

.wc-zoom-input {
  width: 36px;
  height: 24px;
  box-sizing: border-box;
  text-align: center;
  font-size: 13px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  background: var(--bg-dark);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text-primary);
  outline: none;
  padding: 0 2px;
}
</style>
