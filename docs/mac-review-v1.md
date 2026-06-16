# macOS Review — v1 Release Blockers

> **This is the active task list gating v1.** Development has been Windows-only; the Windows build
> is solid and recent churn left little debris — but the macOS paths below are largely untested and
> need validation on **real Mac hardware** before shipping. Last reviewed June 2026.

---

## ✅ Already fixed

### macOS clipboard / menu
`Menu.setApplicationMenu(null)` — a Windows-motivated change — also stripped the standard **Edit
menu** on macOS, which is what enables `Cmd+C/V/X/A` in text fields, plus `Cmd+Q`. Net effect: you
couldn't paste a URL into the URL bar or typing overlay on a Mac.

- **Fix:** on darwin, install a minimal role-based menu (`appMenu` / `editMenu` / `windowMenu`);
  Windows keeps the `null` menu.

### Mute never persisted *(cross-platform)*
`window:setMuted` didn't call `saveState()`, `saveState()` didn't serialise `muted`, and restore
ignored it — mute was lost on relaunch. Now saved, threaded through `openBrowserWindow`, and restored.

---

## 🚫 Open — v1 blockers (need a Mac)

### Fullscreen approach — `electron/main.js` (`enterFullscreen`/`exitFullscreen` ~L157, open ~L274)
`setSimpleFullScreen` is the **right** choice (native `setFullScreen` would force each window into
its own Space and break multi-window + control overlay). Two smells:

- **Arbitrary timeouts** (400 ms / 200 ms) race on slow/fast Macs. Simple-fullscreen emits no
  enter/leave events, so we can't cleanly await one.
- **Wrong-display risk on open:** `setSimpleFullScreen(true)` runs synchronously right after
  `new BrowserWindow`, which on multi-display Macs can fullscreen the *current* display instead of
  the target. (The move path handles this via exit → setBounds → enter; initial open may not.)

### Menu bar over a focused fullscreen window
macOS shows the menu bar on whichever display has keyboard focus, and `setSimpleFullScreen` doesn't
suppress it as hard as native fullscreen — so a focused browser window can get the menu bar drawn
over its top edge. Symptom depends on **System Settings → "Displays have separate Spaces"** (ON =
per-display menu bar, follows focus; OFF = only primary shows a menu bar).

- ⚠️ The app menu we added does **not** cause this — macOS always shows a menu bar regardless.
- **Likely fix:** evaluate `win.setKiosk(true)` vs `setSimpleFullScreen`. Kiosk is built to cover
  the menu bar + Dock and not return them on focus/hover, but has its own quirks (input capture,
  escape). **Test both, under both separate-Spaces settings.**

### MonitorPicker layout math is Windows-empirical — `src/components/MonitorPicker.vue` (L69–76)
The physX/physY DIP handling ("positive position → primary DIP, negative → display's own DIP") was
reverse-engineered for Windows. macOS uses a single global logical coordinate space; on a
Retina + external combo (scaleFactor 2 vs 1) the diagram will likely misplace/missize monitors.
Needs a Mac test, probably a platform branch.

### `capturePage` blank on macOS — `electron/main.js` (~L566)
Capturing a window on another Space or fully occluded often returns blank/stale frames on macOS
(Windows captures occluded windows fine). Expect stale thumbnails in some Mac arrangements.

---

## 🧹 Non-blocker nits (cross-platform, fix anytime)

- **Runtime window icon not packaged** — `BrowserWindow({ icon: '../build/icon.*' })`
  (`electron/main.js` L266) points at a path missing from electron-builder's `build.files`
  (`build/**` isn't listed), so it's broken inside the packaged asar. Win/Mac show the bundled
  exe/app icon anyway so it's invisible — but the option points at nothing. Add `build/**` to
  `files`, or drop the runtime `icon:`.
- **Blackout fade asymmetric** — fades in, but `blackout:off` removes the div instantly (renderer
  curtain animates separately, so probably fine).
- **Audio output labels can be empty** without media permission (worse on macOS).
- **`setPermissionCheckHandler` returns `null`** — falsy = deny, so it works; `false` is clearer.

---

**TL;DR:** Windows is in good shape. The v1 gate is macOS validation — fullscreen, the
menu-bar-over-window behaviour (incl. kiosk evaluation), and the monitor-picker diagram — all of
which need a real Mac in front of you.
