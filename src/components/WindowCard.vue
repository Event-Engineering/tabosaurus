<template>
  <div class="card" :class="{ 'card-blacked-out': win.blackout }">
    <!-- Thumbnail -->
    <div class="thumbnail-wrap">
      <img v-if="thumbnail" :src="thumbnail" class="thumbnail" :alt="win.url" />
      <div v-else class="thumbnail-placeholder">
        <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span>Loading preview…</span>
      </div>
      <!-- Blackout overlay on thumbnail -->
      <div v-if="win.blackout" class="blackout-overlay">
        <svg class="blackout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
        <span>Blacked Out</span>
      </div>
    </div>

    <!-- Info + URL edit -->
    <div class="card-body">
      <template v-if="!editing">
        <div class="url-row">
          <div class="url" :title="win.url">{{ win.url }}</div>
          <button @click="startEdit" class="icon-btn" title="Change URL">
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        </div>
      </template>
      <template v-else>
        <div class="url-edit-row">
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
        </div>
      </template>

      <div class="display-tag" v-if="display">
        <span class="dot" :class="{ 'dot-primary': display.isPrimary }"></span>
        {{ display.label }}{{ display.isPrimary ? ' · Primary' : '' }}
      </div>
    </div>

    <!-- Actions -->
    <div class="card-actions">
      <button @click="$emit('refresh')" class="action-btn" title="Refresh page">
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        Refresh
      </button>
      <button @click="$emit('move')" class="action-btn" title="Move to another screen">
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
import { ref, nextTick } from 'vue'

export default {
  name: 'WindowCard',
  props: {
    win: { type: Object, required: true },
    thumbnail: { type: String, default: null },
    display: { type: Object, default: null }
  },
  emits: ['refresh', 'move', 'close', 'navigate', 'blackout', 'visibility'],
  setup(props, { emit }) {
    const editing = ref(false)
    const editUrl = ref('')
    const urlInputRef = ref(null)

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

    return { editing, editUrl, urlInputRef, startEdit, confirmEdit, cancelEdit }
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

.card-blacked-out {
  border-color: rgba(248, 81, 73, 0.4);
}

.card-blacked-out:hover {
  border-color: rgba(248, 81, 73, 0.7);
  box-shadow: 0 0 0 1px rgba(248, 81, 73, 0.15);
}

/* Thumbnail */
.thumbnail-wrap {
  aspect-ratio: 16 / 9;
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
  background: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

/* Card body */
.card-body {
  padding: 2.1cqw 2.5cqw;
  flex: 1;
  min-width: 0;
}

.url-row {
  display: flex;
  align-items: center;
  gap: 1.25cqw;
  margin-bottom: 0.85cqw;
}

.url {
  flex: 1;
  font-size: clamp(10px, 2.5cqw, 15px);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.icon-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.2cqw;
  height: 4.2cqw;
  min-width: 17px;
  min-height: 17px;
  font-size: clamp(10px, 2.3cqw, 13px);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}

.card-body:hover .icon-btn {
  opacity: 1;
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

.url-edit-row {
  display: flex;
  align-items: center;
  gap: 0.85cqw;
  margin-bottom: 0.85cqw;
}

.url-edit-input {
  flex: 1;
  padding: 0.85cqw 1.25cqw;
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
  gap: 1cqw;
  font-size: clamp(9px, 2.1cqw, 12px);
  color: var(--text-secondary);
}

.dot {
  width: 1.25cqw;
  height: 1.25cqw;
  min-width: 4px;
  min-height: 4px;
  border-radius: 50%;
  background: var(--text-secondary);
  flex-shrink: 0;
}

.dot-primary {
  background: var(--accent);
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
  gap: 0.85cqw;
  padding: 2.1cqw 0.85cqw;
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

.action-btn-close {
  flex: none;
  padding: 2.1cqw;
}
</style>
