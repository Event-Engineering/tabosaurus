<template>
  <div class="overlay" @click.self="$emit('cancel')">
    <div class="picker" :style="pickerStyle">
      <div class="picker-header">
        <h3>{{ title }}</h3>
        <button @click="$emit('cancel')" class="close-btn" title="Cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="picker-body">
        <div v-if="displays.length <= 1" class="single-display-msg">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
            <rect x="2" y="3" width="20" height="14" rx="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          <p>Only one display detected.</p>
          <p class="hint">Connect another monitor and relaunch to move windows between screens.</p>
        </div>

        <template v-else>
          <p class="instruction">{{ instruction }}</p>
          <div class="layout-wrap">
            <div
              class="layout"
              :style="{ width: layout.width + 'px', height: layout.height + 'px' }"
            >
              <div
                v-for="d in layout.displays"
                :key="d.id"
                class="monitor"
                :class="{
                  'is-current': d.id === win.displayId && !allowCurrent,
                  'is-selected': d.id === win.displayId && allowCurrent,
                  'is-target': d.id !== win.displayId || allowCurrent
                }"
                :style="{ left: d.x + 'px', top: d.y + 'px', width: d.width + 'px', height: d.height + 'px' }"
                @click="(allowCurrent || d.id !== win.displayId) && select(d.id)"
              >
                <span v-if="d.isPrimary" class="badge-primary">Primary</span>
                <span class="monitor-name">{{ d.label }}</span>
                <div v-if="d.id === win.displayId && !allowCurrent" class="monitor-indicator">
                  <span>Here</span>
                </div>
                <div v-else class="monitor-indicator action-hint">
                  {{ allowCurrent ? 'Open here' : 'Move here' }}
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'

const LAYOUT_MAX_W = 380
const LAYOUT_MAX_H = 200

export default {
  name: 'MonitorPicker',
  props: {
    win: { type: Object, required: true },
    displays: { type: Array, required: true },
    title: { type: String, default: 'Move to Screen' },
    instruction: { type: String, default: 'Click a screen to move the window there.' },
    allowCurrent: { type: Boolean, default: false },
    anchor: { type: Object, default: null }
  },
  emits: ['move', 'cancel'],
  setup(props, { emit }) {
    const layout = computed(() => {
      if (!props.displays.length) return { width: 0, height: 0, displays: [] }

      // Windows uses primary-DIP units for positive positions (right/below of primary)
      // but each display's own DIP for negative positions (left/above of primary).
      // Sizes always use each display's own scaleFactor.
      const pSF = props.displays.find(d => d.isPrimary)?.scaleFactor || 1
      const physX = d => d.bounds.x >= 0 ? d.bounds.x * pSF : d.bounds.x * d.scaleFactor
      const physY = d => d.bounds.y >= 0 ? d.bounds.y * pSF : d.bounds.y * d.scaleFactor
      const physW = d => d.bounds.width * d.scaleFactor
      const physH = d => d.bounds.height * d.scaleFactor

      const minX = Math.min(...props.displays.map(d => physX(d)))
      const minY = Math.min(...props.displays.map(d => physY(d)))
      const maxX = Math.max(...props.displays.map(d => physX(d) + physW(d)))
      const maxY = Math.max(...props.displays.map(d => physY(d) + physH(d)))

      const totalW = maxX - minX
      const totalH = maxY - minY
      const scale = Math.min(LAYOUT_MAX_W / totalW, LAYOUT_MAX_H / totalH)

      return {
        width: Math.round(totalW * scale),
        height: Math.round(totalH * scale),
        displays: props.displays.map(d => ({
          id: d.id,
          label: d.label,
          isPrimary: d.isPrimary,
          x: Math.round((physX(d) - minX) * scale),
          y: Math.round((physY(d) - minY) * scale),
          width: Math.round(physW(d) * scale),
          height: Math.round(physH(d) * scale)
        }))
      }
    })

    const pickerStyle = computed(() => {
      if (!props.anchor) return {}
      const GAP = 8
      const W = 560
      const a = props.anchor
      const vw = window.innerWidth
      const vh = window.innerHeight

      const nearTop = a.top < vh / 3

      const vertical = nearTop
        ? { top: (a.bottom + GAP) + 'px', bottom: 'auto' }
        : { top: 'auto', bottom: (vh - a.top + GAP) + 'px' }

      const left = nearTop
        ? Math.max(8, a.right - W)
        : Math.min(Math.max(8, (a.left + a.right) / 2 - W / 2), vw - W - 8)

      return { position: 'absolute', ...vertical, left: left + 'px', transform: 'none' }
    })

    function select(displayId) {
      emit('move', { windowId: props.win.id, displayId })
    }

    return { layout, pickerStyle, select }
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.picker {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 560px;
  max-width: 92vw;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3);
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.picker-header h3 {
  font-size: 13px;
  font-weight: 600;
}

.close-btn {
  background: transparent;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.picker-body {
  padding: 16px 20px;
}

.instruction {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 14px;
  text-align: center;
}

.layout-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.layout {
  position: relative;
  flex-shrink: 0;
}

.monitor {
  position: absolute;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: background 0.15s, border-color 0.15s;
  border: 2px solid transparent;
}

.is-current {
  background: rgba(157, 119, 245, 0.12);
  border-color: var(--accent);
  cursor: default;
}

.is-target {
  background: var(--bg-dark);
  border-color: var(--border);
  cursor: pointer;
}

.is-target:hover {
  background: rgba(157, 119, 245, 0.07);
  border-color: rgba(157, 119, 245, 0.5);
}

.is-selected {
  background: rgba(157, 119, 245, 0.12);
  border-color: var(--accent);
}

.is-selected:hover {
  background: rgba(157, 119, 245, 0.18);
  border-color: var(--accent);
}

.badge-primary {
  position: absolute;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 8px;
  font-weight: 600;
  color: var(--accent);
  background: rgba(157, 119, 245, 0.18);
  padding: 1px 5px;
  border-radius: 10px;
  white-space: nowrap;
  pointer-events: none;
}

.monitor-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 8px);
  text-align: center;
}

.monitor-indicator {
  position: absolute;
  bottom: 5px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--text-secondary);
  pointer-events: none;
}


.monitor-indicator.action-hint {
  opacity: 0;
  transition: opacity 0.15s;
}

.is-target:hover .monitor-indicator.action-hint {
  opacity: 1;
}

.single-display-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 0;
  color: var(--text-secondary);
  text-align: center;
}

.hint {
  font-size: 11px;
  max-width: 300px;
  line-height: 1.5;
}
</style>
