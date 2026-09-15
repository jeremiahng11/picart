# JKL Cartridge Webapp

ROM and savegame manager for the JKL Game Boy cartridge (RP2040). It talks to
the cartridge directly from the browser over **WebUSB** — upload ROMs, download
and restore save RAM, and sync RTC data. There is no backend; the app is a
static bundle and all device I/O happens client-side.

This is a rebranded fork of
[shilga/croco-cartridge-webapp](https://github.com/shilga/croco-cartridge-webapp).
The cartridge firmware lives in a separate project,
[shilga/rp2040-gameboy-cartridge-firmware](https://github.com/shilga/rp2040-gameboy-cartridge-firmware).

## Browser requirements

WebUSB only works in a **secure context** and only in Chromium browsers:

- **Chrome / Edge / Opera** — supported.
- **Firefox / Safari** — not supported. The app renders a "browser does not
  support WebUSB" notice.
- The page must be served over **HTTPS**, or from `http://localhost`, which
  browsers treat as secure. Serving over plain HTTP on any other host leaves
  `navigator.usb` undefined and the app will not connect.

## Run locally

```bash
npm install
npm run react-start      # http://localhost:3000
```

Or via Docker, which builds the same image that is deployed:

```bash
docker compose up --build    # http://localhost:8080
```

Both URLs are `localhost`, so WebUSB works without TLS.

## Desktop (Electron)

The Electron shell bypasses the browser permission prompt by matching the USB
device descriptor directly.

```bash
npm run electron-build    # packages into dist/
```

> **Note:** `electron-main.js` matches on `productName === "JKL Cartridge"`.
> Firmware that still reports the upstream product string will not be detected
> by the desktop build. The browser build is unaffected — it filters on
> USB vendor/product ID, not the name.

## Deploy

`npm run build` runs the CRA build **and** `electron-builder`. For a web deploy
use `npm run react-build` alone; the provided `Dockerfile` already does this.

### Coolify

1. **New Resource → Public Repository**, URL `https://github.com/jeremiahng11/picart`.
2. **Build Pack:** `Dockerfile`. **Branch:** `main`.
3. **Port:** `80`.
4. Attach a domain and enable SSL. Coolify provisions a Let's Encrypt
   certificate via its proxy — this is **required**, not optional, because
   WebUSB refuses to run over plain HTTP.
5. Deploy. Health check endpoint is `GET /healthz`.

The build is domain-agnostic: `homepage` resolves to a public path of `/`, so
assets are root-relative and no rebuild is needed when the domain changes.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_VERSION` | `dev` (Docker build arg) | Build identity shown on the connect screen. Pass the deployed commit so it is possible to tell which build is live. |
| `REACT_APP_VERSION` | `$npm_package_version` from `.env`, overridden by `APP_VERSION` in Docker | What the UI actually renders. Outside a tagged release it resolves to `0.0.0`, which is why the Docker build overrides it. |
| `CI` | `false` (set in `Dockerfile`) | `react-scripts` treats lint warnings as build errors when this is truthy. |

No secrets are required. `.env` contains only the version reference and is
committed deliberately.

## License

The application code is **GPLv3** — see [LICENSE](LICENSE). Copyright (C) 2023
Sebastian Quilitz; this fork retains the upstream copyright notices.

The JKL logo and icons (`src/assets/jkl_small.png`, `public/favicon.png`,
`public/apple-touch-icon.png`) are **not** covered by the GPL. They are JKL Family Arcade artwork, all rights reserved, and
are included here for use within this project only.

The upstream Croco artwork, which was licensed from a third party for the
original project only, has been removed from this fork entirely.
