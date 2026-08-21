# Architecture

How Tabosaurus is wired, the platform model, and the two pieces of non-obvious maths.

## Process model

```
┌─ Control window (src/, Vue 3) ──────────────┐
│  Renders the UI. Owns NO web content.        │
│  Talks to main via window.api (preload.js).  │
└───────────────┬──────────────────────────────┘
                │  IPC (invoke / handle + events)
┌───────────────▼──────────────────────────────┐
│  Main process (electron/main.js)             │
│  • owns every browser BrowserWindow          │
│  • screen polling, persistence, z-order      │
│  • capturePage() thumbnails                  │
│  pushes state back via 'windows:updated'     │
└───────────────┬──────────────────────────────┘
                │  preload (browser-preload.js)
┌───────────────▼──────────────────────────────┐
│  Browser windows (fullscreen, frameless)     │
│  Real web content. Receive blackout via IPC. │
└───────────────────────────────────────────────┘
```

`main.js` keeps a `browserWindows` Map (`id → { win, url, displayId, … }`). `buildWindowList()`
serialises it to the renderer. `notifyControlWindow()` both pushes the event and saves state.

## IPC surface (`window.api`, see `preload.js`)

- **Lifecycle:** `openWindow`, `closeWindow`, `refreshWindow`, `navigateWindow`, `goBack`, `goForward`
- **State:** `blackoutWindow`, `setWindowVisibility`, `moveWindow`, `setWindowAlwaysOnTop`,
  `setWindowLocked`, `injectCSS`, `setZoom`, `setMuted`, `setAudioOutput`
- **Interaction (thumbnail remote-control):** `getThumbnail`, `sendClick`, `sendScroll`, `sendKey`,
  `getActiveInputValue`
- **Control window:** `setContentSize`, `setMinimumSize`, `setAlwaysOnTop`
- **Events (main → renderer):** `onWindowsUpdated`, `onDisplaysUpdated`, `onMaximized`

## Persistence

- `state.json` (in `userData`): open windows `{ url, displayId, alwaysOnTop, locked, customCSS,
  zoomFactor, muted, audioOutputDeviceId }` + `controlBounds`. Restored on launch; windows whose
  display is gone open hidden.
- `localStorage` (renderer): `displayLabels`, `recentUrls`, `favouriteUrls`, `reload:<displayId>`.

## Platform model ⚠️

Windows and macOS diverge hard on fullscreen and z-order. **Any change here must be tested on
both** — the Windows behaviour was hard-won (see below) and is easy to regress.

### Windows — z-order is binary (TOPMOST vs normal)

- Browser windows are set `setAlwaysOnTop(true)` **once at creation and never toggled off.**
  The taskbar lives in the TOPMOST band; calling `setAlwaysOnTop(false)` even momentarily lets the
  taskbar climb above us and causes DWM artifacts (taskbar flash, windows hiding). So:
  - **"Pinned" = `moveTop()`** to assert order *within* the TOPMOST band — never an alwaysOnTop toggle.
  - **"Unpinned" = still TOPMOST**, just not explicitly raised.
- **No `setFullScreen` on Windows.** It resets the TOPMOST flag mid-transition (esp. on the primary
  display) and permanently breaks `moveTop()`. Instead: `frame: false` + `setBounds(display.bounds)`.
  `enterFullscreen` is a **no-op** on Windows.
- `lastActiveBrowserPerDisplay` (Map) tracks the topmost browser per display, used to raise the
  right window on control-window focus without flashing. Control-focus uses a 50 ms delay + two-pass
  raise (non-pinned, then pinned, then control on top). Pin asserts twice (50 ms + 250 ms) because
  the primary-display taskbar reasserts aggressively.
- Moving a window between displays asserts z-order **before** `setBounds` (4 scenarios in
  `window:move`) so the window arrives already correctly ordered.

### macOS — different tools (and the v1 risk)

- Fullscreen uses **`setSimpleFullScreen`**, *not* native `setFullScreen` (native fullscreen forces
  each window into its own Space, which would break multi-window + the floating control window).
- Always-on-top uses `setAlwaysOnTop(true, 'floating')` for pinned browser windows;
  the control window uses `'screen-saver'` level.
- The Windows `moveTop`/`lastActiveBrowserPerDisplay` machinery is mostly skipped on darwin.
- **Open questions blocking v1** (timeouts, wrong-display-on-open, menu-bar-over-focused-window,
  kiosk vs simpleFullScreen): see **[mac-review-v1.md](mac-review-v1.md)**.

## Card-height layout maths (`src/App.vue`)

The grid sizes cards to fill the window without scrolling. Card height is **not** linear in width —
it has three regimes because the card's controls scale with container-query units (`cqw`) up to caps:

1. **Proportional** (`cardW < ~573px`): padding, icons and fonts all scale with width.
2. **Transition** (`~573–669px`): icons/fonts hit their cap; only padding still scales.
3. **Fully capped** (`> ~669px`): everything is at max; height grows only with the thumbnail.

`calcGridH` / `maxCardWForH` switch between the three via the `W_ICONS_CAP` / `W_PAD_CAP`
breakpoints and the `C_*` / `K_*` constants derived from `WindowCard.vue`'s CSS. If you change card
CSS (padding, icon sizes, border), these constants must be re-derived or the window will size wrong.

### Derivation

The card has `border: 1px solid` with `box-sizing: border-box`, so content width is `cardW - 2` and
container queries resolve as `cqw = (cardW - 2) / 100`.

```
card_h      = thumbnail_h + body_h + 2          (2 = card borders)
thumbnail_h = aspect x (cardW - 2)              (thumbnail fills card content width)
body_h      = card-body + card-actions
```

Reading the two body sections straight off `WindowCard.vue`'s CSS:

- **card-body** — `padding: min(1.5cqw, 10px) min(2.5cqw, 16px)`, content is the url-row whose
  height is set by the icon button at `clamp(17px, 4.2cqw, 24px)`.
- **card-actions** — `border-top: 1px`, `padding: min(1.5cqw, 10px)`, content is the action-button
  svg at `1.3em` where `em = clamp(10px, 2.5cqw, 14px)`.

```
body_h = 4 x min(1.5cqw, 10) + clamp(17, 4.2cqw, 24) + 1.3 x clamp(10, 2.5cqw, 14) + 1
```

Each `min`/`clamp` caps at a different width, which is where the three regimes come from:

| Cap | Reached at | Width |
|---|---|---|
| Font | `cqw = 14 / 2.5 = 5.6` | ~562px |
| Icons | `cqw = 24 / 4.2 = 5.714` | **~573px** (`W_ICONS_CAP`) |
| Padding | `cqw = 10 / 1.5 = 6.667` | **~669px** (`W_PAD_CAP`) |

Font and icon caps are close enough to treat as one boundary. Per regime:

```
Proportional  body_h = C_PROP x (cardW - 2) + K_PROP
              C_PROP = (4 x 1.5 + 4.2 + 1.3 x 2.5) / 100 = 0.1345
              K_PROP = 3                                  (body constant 1 + card border 2)

Transition    body_h = C_PAD x (cardW - 2) + K_TRANS
              C_PAD   = 4 x 1.5 / 100 = 0.06              (only padding still scales)
              K_TRANS = 24 + 1.3 x 14 + 1 = 43.2          (capped icon + capped svg + border)

Fully capped  body_h = 4 x 10 + K_TRANS = 83.2
              K_CAP  = 4 x 10 + K_TRANS + 2 = 85.2        (+ card border)
```

Grid height and its inverse, per regime (transition shown — the most common case):

```
gridH     = (sumAspect + rows x C_PAD) x (cardW - 2) + rows x (K_TRANS + 2) + (rows-1) x GAP
maxCardW  = (H - rows x (K_TRANS + 2) - (rows-1) x GAP) / (sumAspect + rows x C_PAD) + 2
```

`calcGridH` / `maxCardWForH` dispatch to `propGridH`/`transGridH`/`capGridH` (and their inverses)
by comparing `cardW` against the two breakpoints. `sumAspect` comes from `rowMaxAspects(cols)` —
the tallest aspect in each row, summed.

### Why the earlier two-model version was wrong

The original code had only a proportional and a fully-capped model and picked between them:

- **`Math.max`** chose the proportional model, which overestimates `cardW` at large widths → the
  grid overflowed the window.
- **`Math.min` with an 85px body cap** predicted `body_h = 85` at `cardW = 587`, where the real
  value was ~78 because padding hadn't capped yet. `maxCardW` came out 9.7px too conservative →
  22.8px of dead side-gap and no trim button.

Neither model is accurate anywhere in the 573–669px transition zone, and that zone covers common
window sizes. The transition model above is derived from the CSS rather than calibrated, and
matches measured card heights to under 1px.

### Verified against measured layouts

| Case | Prediction | Actual |
|---|---|---|
| 650x1024 window, 2 cards, 5:8 display (aspect 0.625), containerH 924 | `transMaxCardW` = 595.87, `transGridH` at that width = 924.0 | 924.0 ✓ |
| 450x1084 window, 3 cards, cardW 410, rows 3 | `propGridH(1.875, 410, 3, 20)` = 978.6 | 978.4 ✓ (<0.2px) |
| 2512x745 window, 3 cards, cardW 810.67, rows 1 | `capGridH(0.625, 810.67, 1, 20)` = 590.6 | 590.6 ✓ (<0.1px) |

In the last two cases the pre-fix formulas made trim either a no-op (tall/narrow) or unable to ever
converge (short/wide); both now clear their excess in a single trim click.

The `oversized` threshold is **2px**. The original 24px was far too coarse to catch these.

**Column count** (the only place `C_BODY = 0.663 - 9/16` is used — a rough body-height
allowance for the heuristic, *not* part of the height model above)**:**
- On *add*: `cols = round(sqrt(count))` — square-ish.
- On *resize*: aspect-aware, `cols = round(sqrt(n · (W/H) · C))`, then shrink while a card would be
  narrower than 410px.
- On *remove*: previous column count is preserved (don't collapse the layout unexpectedly).

## Gotchas — load-bearing weirdness (don't "fix" these)

These look odd but are deliberate. Removing them re-introduces a bug.

- **Windows browser windows stay `setAlwaysOnTop(true)` forever; no `setFullScreen`.** Toggling
  alwaysOnTop off (even briefly) or using setFullScreen breaks Windows z-order. See the platform
  model above. This is the single most-likely thing to get "simplified" and regressed.
- **Display detection both polls *and* listens to events.** `screen.on('display-added'/...)` is
  unreliable on Windows, so there's a 2 s `pollDisplays` diff alongside the event listeners. Keep
  both — don't delete the poll thinking the events cover it.
- **Any `executeJavaScript` must end in a serializable value** (e.g. `void 0`, a string, a bool).
  Returning a DOM element makes the promise reject silently and downstream work never runs — this
  bit us before. (Blackout was moved into `browser-preload.js` partly to avoid this.)
- **CSS is injected on `dom-ready`, not `did-finish-load`** — earlier = less flash on reload. A
  brief flash before injection is *inherent* (the DOM must exist first); it's not a bug to chase.
- **Audio routing (`setSinkId`) only affects `HTMLMediaElement`** (audio/video tags), not the Web
  Audio API. A `MutationObserver` re-applies the sink to elements added later. Don't expect it to
  reroute WebAudio-based players.
- **The `loading.html` → `loadURL` chain on open is intentional** — Chromium keeps the loading page
  up until the real navigation commits, so windows are never blank during DNS/connect. Don't
  collapse it to a bare `loadURL`.
- **User-agent has `Electron/x.y` stripped** (in `app.whenReady`) for site compatibility — some
  sites behave differently if they detect Electron.
