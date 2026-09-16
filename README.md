# sleepAid

A calm, installable noise machine for ADHD, autistic, and AuDHD listeners who need steady sound to mask the room.

Mobile-first Progressive Web App — no accounts, no API keys, works offline after install.

## Features

- Procedural white / pink / brown noise plus fan and rain layers (Web Audio API)
- Presets: **Focus**, **Sleep**, **Block chatter**
- Per-layer mix + master volume
- Sleep timer with gentle fade-out
- Preferences saved in `localStorage`
- Installable PWA (home screen on phone)

## Stack

Vite + React + TypeScript + `vite-plugin-pwa`. Chosen for a small mobile-friendly SPA with offline caching and install prompts — no native store required for the demo.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`). Tap **Play** once — browsers require a user gesture before audio starts.

```bash
npm run build
npm run preview
```

Use preview (or any static host) over HTTPS to test install / service worker behavior.

## Install on a phone

- **Android Chrome:** menu → Install app / Add to Home screen
- **iPhone Safari:** Share → Add to Home Screen

On iOS, keep the app in the foreground for continuous playback; background audio for PWAs is limited by the OS.

## Notes

- Audio is generated in-browser — no sound files to download
- Mixes and timer preference persist on the device only
- Reduced-motion preference disables the play-state ripple animation
