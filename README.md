# Browserator

> Because someone has to be in charge of the screens.

An Electron app for opening and controlling fullscreen browser windows across multiple displays, with a floating control panel that stays smugly on top of everything.

---

## Features

- 🖥️ Open fullscreen browser windows on any connected display
- 🔍 Live thumbnail previews so you know what chaos is happening on the other screens
- 🖱️ **Interactive mode** — click, scroll, and type directly via the thumbnail, like a tiny remote control for a browser that didn't ask to be remote-controlled
- ⬛ Blackout / hide individual windows (for when the presenter walks away and leaves slides on screen)
- ↔️ Move windows between displays without breaking a sweat
- 📌 Always-on-top control panel, because it knows it's more important than whatever you were doing
- 💾 State persistence — windows reopen on next launch, whether you wanted them to or not

---

## Development

```bash
npm install
npm run dev
```

Launches the Vite dev server and Electron together. Try not to open too many windows.

## Building

```bash
npm run package:mac   # macOS DMG (x64 + arm64)
npm run package:win   # Windows NSIS installer (x64)
```

Output lands in `release/`. Signing is optional — unsigned builds work fine for internal use.

## Releases

Tagged pushes trigger GitHub Actions builds for macOS and Windows. Installers are attached to the release automatically.

```bash
git tag v1.0.0
git push origin v1.0.0
```

That's it. Go control some screens.
