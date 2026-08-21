# Tabosaurus — project guide for Claude

Tabosaurus is an **Electron + Vue 3** app: a single floating **control window** opens and
manages **fullscreen, frameless browser windows** across multiple displays. Built for events
("someone has to be in charge of the screens").

> **Heads-up — current status:** the Windows build is solid. **v1 is gated on macOS validation.**
> Development has been Windows-only and several macOS paths are untested. Before touching the
> fullscreen / z-order / display code, read **[docs/mac-review-v1.md](docs/mac-review-v1.md)** —
> it's the active task list.

## Stack

- **Electron** `^42` (main process: `electron/`)
- **Vue 3** Composition API + **Vite** (renderer: `src/`)
- Plain **JavaScript**, no TypeScript
- Accent colour: `#9d77f5` (electric violet). Full palette in `src/style.css`.

## Commands

```bash
npm run dev          # Vite dev server (:8080) + Electron together — use this to develop
npm start            # vite build && electron .  (production-like local run)
npm run package:mac  # DMG (x64 + arm64)
npm run package:win  # NSIS installer (x64)
npm run build:icon   # regenerate build/icon.{png,ico,icns} from build/icon-source.png (or icon.svg)
```

## Testing

There is **no automated test suite**. Verify changes by running `npm run dev` and observing the real
app — especially anything touching windows, displays, or fullscreen, which can't be reasoned out
from the code alone. Ask the user for dev-tools output / screenshots when a diagnosis depends on
runtime behaviour.

When a suite does arrive it will be **Vitest** (Vite-native, near-zero config), scoped to the two
pure-maths pieces only — the card-height layout model and the MonitorPicker coordinate transforms.
Rationale and sequencing in [docs/backlog.md](docs/backlog.md).

## Key files

| File | Responsibility |
|------|----------------|
| `electron/main.js` | All IPC handlers, `BrowserWindow` lifecycle, screen polling, persistence, z-order |
| `electron/preload.js` | `contextBridge` → `window.api` for the control window |
| `electron/browser-preload.js` | Blackout overlay injected into each browser window via IPC |
| `electron/loading.html` / `error.html` | Interstitial pages shown while loading / on load failure |
| `src/App.vue` | Control UI: grid layout math, thumbnail polling, window + display state |
| `src/components/WindowCard.vue` | Per-window card: thumbnail, cog popover, status badges, CSS modal |
| `src/components/MonitorPicker.vue` | Display-layout picker modal (open-on / move-to display) |
| `scripts/build-icon.js` | Generates icon formats from a source image |

## How it's wired (orientation)

- The **control window** (Vue app) never renders web content itself — it sends IPC to `main.js`,
  which owns every browser `BrowserWindow`. State flows back via the `windows:updated` event.
- **Persistence:** `state.json` in `userData` holds open windows (url, display, per-window
  settings) + control-window bounds, restored on launch. `localStorage` holds display labels,
  recent/favourite URLs, and per-display auto-reload settings.
- **Thumbnails:** `main.js` `capturePage()` on a 2.5 s poll (faster while a card is in interactive
  mode). Returned as data URLs.
- **Platform model is significant** — Windows and macOS take very different paths for
  fullscreen and z-order. This is the crux of the remaining v1 work. See
  **[docs/architecture.md](docs/architecture.md)** for the full model and the Windows quirks that
  any cross-platform change must not regress.

## More docs

- **[docs/architecture.md](docs/architecture.md)** — process model, IPC surface, the Windows
  z-order/fullscreen rules, and the card-height layout math.
- **[docs/mac-review-v1.md](docs/mac-review-v1.md)** — the v1-blocking macOS review (active task).
- **[docs/backlog.md](docs/backlog.md)** — deferred features + design decisions already reached
  (settings screen, scenes, OSC remote control, and features deliberately *not* being built).

## Conventions

Only project-specific conventions live here — general working style, commit policy and output
conventions are in `~/.claude/CLAUDE.md`.

- **Windows/macOS platform behaviour in this app can't be reasoned out from the code.** For any
  diagnosis that turns on it, ask for the real data (dev-tools console output, error text, a
  screenshot) rather than speculating. This overrides the usual assume-and-state default.
- Windows-specific Electron platform facts this app depends on are written up in
  `~/.claude/rules/electron-windows.md` — read it before touching z-order, fullscreen or the
  display maths.
