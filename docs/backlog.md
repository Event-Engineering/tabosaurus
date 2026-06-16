# Backlog & Design Decisions

Deferred features and the reasoning behind them. Captures decisions already made so they don't get
re-litigated. (v1 itself is gated by [mac-review-v1.md](mac-review-v1.md).)

---

## 🎬 Next-release theme: show control

These hang together and are considered one chapter *after* the current polish release:

- **App settings screen** *(prerequisite — build first)*
  The app has no home for *app-level* settings (everything is per-window via the cog popover, or
  per-display via labels). A modal (same pattern as MonitorPicker — no routing) opened from a gear
  icon in the header.
  - **v1 contents:** scenes folder location (path + Change… picker + Reveal); control-window
    always-on-top (migrate the header pin in, but keep the header button as a quick toggle).
  - **Out of v1 (easy later):** thumbnail refresh rate (hardcoded 2500 ms), default display for new
    windows (hardcoded "first non-primary").
  - **Candidate:** card **packing preference** (prefer columns / rows / square). Today it's fully
    automatic — on add `cols = round(sqrt(count))`; on resize aspect-aware
    `round(sqrt(n·(W/H)·C))` shrunk while card < 410px. A preference would bias these.

- **Scenes / presets**
  Save the current set of windows (URLs, displays, per-window settings) as a named layout, recall
  in one click.
  - **Recall = replace** (confirmed): close all current windows, open the scene's fresh. No
    layering/diffing. Missing-display windows open hidden, as launch-restore already does.
  - **Storage = files, not an in-app DB** (key decision): scenes live as individual `.json` files in
    a **scenes folder**. Rationale — portability/backup is the real point for an events tool on
    venue/loaner machines. Files give backup (copy folder), handover (send one file), import (drop
    a file in), and no drift.
  - **Folder location configurable** so it can point at a synced folder (OneDrive/Dropbox) →
    automatic cross-machine sync + backup for free. This is what *requires the settings screen*.
  - A scene is essentially a named snapshot of `saveState().windows`.
  - Export/import to an arbitrary file via dialog is a later nice-to-have.

- **OSC remote-control API** *(the longer-term vision)*
  Make Tabosaurus controllable from show-control systems (QLab, lighting desks, TouchOSC) over OSC,
  so browser walls respond on cue with the rest of a show. Pairs specifically with **scenes** — a
  named scene is the ideal addressable thing, e.g. `/scene/recall "lobby"`, `/blackout/all 1`,
  `/window/3/reload`, `/window/3/navigate "https://…"`, pin/hide/show. Consider OSC-out feedback for
  state mirroring back to the controller. Not yet scoped beyond this.

---

## Tests (targeted, when we get to it)

**Not** a broad suite — the bug-prone parts (z-order, fullscreen, the taskbar/menu-bar dance) are
platform behaviour and stay manual on real hardware. But two pieces of pure, deterministic maths are
worth unit-testing with **Vitest** (Vite-native, near-zero config):

1. **Card-height layout model** — `computeCols`, `calcGridH`, `maxCardWForH` and the regime
   breakpoints in `App.vue`. Pure arithmetic, fragile, has broken before.
2. **MonitorPicker coordinate transforms** — `physX`/`physY`. Directly relevant to the Mac work:
   write a test pinning current Windows behaviour, then add the expected macOS case as a spec
   *before* implementing the fix.

Step one is extracting both out of Vue `setup()` into plain `.js` modules (good structure anyway).
Best timing: right before the MonitorPicker Mac work, not as a standalone task.

> ⚠️ **The owner has no testing experience yet** — walk through setup and concepts step by step
> (installing Vitest, what a test file looks like, how to run it), don't assume familiarity.

## Other deferred features

- **Bulk actions** — reload all, blackout all / unblackout all in the header. Low priority; user
  indifferent. Use two explicit buttons (e.g. hide-all / show-all), each disabled when it'd be a
  no-op, rather than one ambiguous toggle.
- **Hide all / show all windows** — header eye-icon toggle for all browser windows at once. Possibly
  a per-display group header row with its own hide toggle for finer control.
- **Per-card advanced-mode review** — revisit what belongs in the cog popover vs the card face.

---

## 🛑 Deliberately *not* building (for now)

- **Page title in card** — every placement is a compromise: title-as-primary breaks the URL bar's
  click-to-edit role; a second line adds height to a compact card; tooltip/hover/overlay variants
  hide the info or add logic. Largely redundant with custom names anyway, and titles can be junk
  ("Just a moment…"). Revisit only if custom names land and titles still feel needed.
- **Per-window custom name** — weaker than it first appears. A card is already identified by its
  display name (where), URL (what's loaded) and live thumbnail (what it looks like). A name only
  adds value for multiple same-site, similar-looking windows on one display. The one unique thing —
  describing a window's *purpose* across moves/navigations — usually maps to the display anyway in
  the events use case. Prefer **scenes**. Revisit only if a concrete multi-window-per-display
  workflow emerges.

---

## ✅ Shipped highlights

Per-window: auto-reload, zoom, mute, audio-output routing, CSS injection (with pop-out modal),
interaction lock, always-on-top pin, status badges, loading indicator. App: MonitorPicker display
picker, editable display labels, URL favourites + history, control-window auto-sizing & reset,
stegosaurus icon.
