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

## Tests

```bash
npm run react-test -- --watchAll=false
```

`communication.test.js` drives the device layer against a fake WebUSB device, so
the wire format, the short-response guards and the error paths are covered
without hardware. What still needs a real cartridge is anything past the
protocol: transfer timing, firmware quirks, and the RTC round trip.

`stringview` ships ESM only, which Jest does not transform inside `node_modules`
by default. The `jest.transformIgnorePatterns` override in `package.json` exempts
it; without that, any suite importing the device layer fails at import.

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
5. Leave `APP_VERSION` unset so the version comes from `package.json`, which CI
   bumps automatically. Set it only to pin a build to a specific label, and mark
   it as a **build variable** if you do: the bundle is compiled during
   `docker build`, so a runtime-only variable arrives too late to be seen.
6. Deploy. Health check endpoint is `GET /healthz`.

The build is domain-agnostic: `homepage` resolves to a public path of `/`, so
assets are root-relative and no rebuild is needed when the domain changes.

`nginx.conf` returns a real 404 for unknown paths rather than falling back to
`index.html`. This app has no client-side router, so a fallback would only serve
the page with a 200 status for missing assets and hide broken links.

## Versioning

The patch version is bumped automatically. Once a push to `main` builds green,
the `version` job in `ci.yml` computes the next version, commits the result, and
pushes it back, so the connect screen shows a number that increases with every
change that lands.

Each component rolls over at nine rather than growing without bound, so the
sequence runs `1.0.8`, `1.0.9`, `1.1.0`, and `1.9.9` is followed by `2.0.0`.
`npm version patch` cannot express that, so `scripts/bump-version.js` computes
it. Its rules are covered by `npm run test-version`, a plain Node test: Jest
cannot see `scripts/` because react-scripts pins its roots to `src/` and does
not allow overriding that.

Two details make that safe. The bump runs only after `build` succeeds, so a
failing change does not consume a version. And the push uses `GITHUB_TOKEN`,
which by design does not trigger workflows, so the bump commit cannot start
another run.

The bump commit lands after the build that triggered it, so artifacts from that
run still carry the previous version. Tagged releases are unaffected:
`release.yml` sets the version from the tag name instead.

## Assets

The cartridge shell is a WebP. WebUSB restricts this app to Chromium browsers,
which all support WebP, so there is no fallback to maintain and the shell costs
31KB instead of the 264KB the PNG did. Both it and the logo live in `src/assets`
so webpack content-hashes them, which puts them under the immutable caching rule
and means replacing one can never serve stale.

The label uses Press Start 2P for headings, names and counts. It is bundled as a
latin-only subset (4.7KB) under the SIL Open Font License rather than loaded from
a CDN, so the Electron build keeps working offline. Prose stays in the system
stack: an 8px bitmap face is charming on a title and painful on a sentence.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_VERSION` | unset | Optional Docker build arg. Overrides the version shown on the connect screen. Leave it unset to use the `package.json` version. |
| `REACT_APP_VERSION` | `$npm_package_version` from `.env` | What the UI renders. Resolves to the `package.json` version unless `APP_VERSION` overrides it. |
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
