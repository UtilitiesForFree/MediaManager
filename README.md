<div align="center">

# MediaManager

**A fast, privacy-first desktop media manager for photographers and power users.**

Browse, organize, and sync local photo and video archives — without proprietary catalogs or cloud lock-in.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.x-blueviolet?logo=tauri)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange?logo=rust)](https://www.rust-lang.org)
[![React 18](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)

</div>

---

## Overview

MediaManager is a cross-platform desktop application built with **Tauri 2** (Rust backend) and **React 18** (TypeScript frontend). It gives you a fast, three-pane browser for local photos and videos with library management, thumbnail generation, EXIF inspection, drag-and-drop file operations, and optional sync to a self-hosted [Immich](https://immich.app) server.

**Key principles:**
- **Files first.** No proprietary database. Your files stay where they are, readable by any tool.
- **Local only by default.** No telemetry, no accounts, no cloud services required.
- **Cross-platform.** Identical UX on macOS, Windows, and Linux.
- **Fast.** Handles 50,000-item folders at 60 fps using a virtualized grid.
- **Privacy-conscious.** All metadata stays on your machine.

---

## Screenshots

> _Screenshots coming soon. Run the app with `npm run tauri dev` to see it in action._

---

## Features

| Feature | Description |
|---|---|
| **Folder navigation** | Lazy filesystem tree starting from home and mounted drives |
| **Library management** | Create, rename, delete, color-code, and icon-tag named libraries (real folders on disk) |
| **Virtualized thumbnail grid** | Images, videos, RAW, GIF, HEIC — WebP thumbnails generated asynchronously |
| **Video thumbnails** | First-frame previews via `qlmanage` (macOS) |
| **Drag & drop** | Drag items between folders and library rows; Move or Copy with conflict resolution |
| **Multi-select** | Click, Shift+click, Ctrl+click, Cmd+A, or marquee-drag |
| **Context menu** | Right-click for Move to Library, Copy to Library, Select All, Reveal in Finder, Trash |
| **Inspector panel** | EXIF data, dimensions, duration, GPS coordinates for the selected item |
| **File watching** | Auto-refresh when the filesystem changes (using `notify`) |
| **Search & filter** | Full-text search by name; filter by kind, date range, file size, GPS presence |
| **Trash** | All deletes go to the OS trash — nothing is permanently removed without warning |
| **Immich sync** | Upload library contents to a self-hosted Immich instance; albums created automatically |
| **Themes** | Light, Dark, and System-follow modes |
| **i18n** | English, Greek (`el`), and Albanian (`sq`) |
| **Settings** | Library root, theme, thumbnail cache cap, worker count, Immich credentials |

---

## Architecture

```
┌───────────────────────────────────────┐
│  Frontend  (renderer process)         │
│  React 18 + TypeScript + Vite         │
│  Tailwind CSS + shadcn/ui             │
│  Zustand · TanStack Query · Virtual   │
│  react-arborist · react-dnd · i18next │
└──────────────┬────────────────────────┘
               │  Tauri IPC (typed commands + events)
               ▼
┌───────────────────────────────────────┐
│  Backend  (main process — Rust)        │
│  Tauri 2 · Tokio async runtime        │
│  ┌──────────┬──────────┬────────────┐ │
│  │ mm-core  │ mm-fs    │ mm-thumbs  │ │
│  │ mm-exif  │ mm-cache │ mm-libs    │ │
│  └──────────┴──────────┴────────────┘ │
│  mm-app  (Tauri command handlers)     │
└───────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────┐
│  On-disk artifacts                    │
│  ~/.medialib/config.json              │
│  ~/.medialib/cache/cache.db           │
│  ~/.medialib/cache/thumbs/  (WebP)    │
│  ~/.medialib/logs/          (daily)   │
│  <librariesRoot>/<library>/           │
│    .medialib.json  (marker)           │
└───────────────────────────────────────┘
```

### Rust crate structure

| Crate | Responsibility |
|---|---|
| `mm-core` | Domain types, errors — no I/O |
| `mm-fs` | Filesystem listing, moves, copies, trash, watching |
| `mm-thumbs` | WebP thumbnail generation (image / video / RAW dispatch) |
| `mm-exif` | EXIF / metadata extraction |
| `mm-cache` | SQLite-backed thumbnail cache with LRU eviction |
| `mm-libraries` | Library CRUD, marker file management |
| `mm-app` | Tauri command handlers — the only crate that depends on Tauri |

---

## Prerequisites

### Rust toolchain

Install Rust 1.75 or later via [rustup](https://rustup.rs):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Node.js

Node.js 18+ and npm 9+ are required. Install via [nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org).

### Platform dependencies

<details>
<summary><strong>macOS</strong></summary>

```bash
xcode-select --install
```

macOS 12 (Monterey) or later is required. No additional system libraries are needed — `qlmanage` (part of macOS) handles video thumbnail generation.

</details>

<details>
<summary><strong>Windows</strong></summary>

1. Install [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with the **Desktop development with C++** workload.
2. Install the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 11).
3. Ensure `rustup` target `x86_64-pc-windows-msvc` is active:
   ```powershell
   rustup default stable-msvc
   ```

</details>

<details>
<summary><strong>Linux (Ubuntu 22.04 / Debian-based)</strong></summary>

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl wget file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

For video thumbnail support:
```bash
sudo apt install -y ffmpeg
```

</details>

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/UtilitiesForFree/MediaManager.git
cd MediaManager
```

### 2. Install JavaScript dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and launches the Tauri window. Hot-reload is active for the frontend; Rust changes trigger a full recompile.

---

## Building for Production

```bash
npm run tauri build
```

The compiled application and platform-native installer are written to:

```
src-tauri/target/release/bundle/
  macos/     → MediaManager.app  +  MediaManager_x.y.z_aarch64.dmg
  windows/   → MediaManager_x.y.z_x64-setup.exe  (NSIS installer)
  linux/     → mediamanager_x.y.z_amd64.deb  +  .AppImage
```

### Debug build

```bash
npm run tauri build -- --debug
```

Produces an unoptimized binary in `src-tauri/target/debug/` for faster iteration.

### Cross-compilation

Use [tauri-action](https://github.com/tauri-apps/tauri-action) in GitHub Actions for multi-platform builds from a single push. See `.github/workflows/build.yml`.

---

## Configuration

MediaManager stores its configuration at `~/.medialib/config.json`. The file is created on first launch with sensible defaults and can be edited by hand or through **Settings → General / Performance / Integrations**.

```json
{
  "librariesRoot": "~/MediaManager/Libraries",
  "language": "en",
  "theme": "dark",
  "thumbCacheSizeMb": 2048,
  "thumbWorkers": "auto",
  "checkUpdatesOnLaunch": true,
  "immichUrl": "",
  "immichApiKey": ""
}
```

| Key | Description | Default |
|---|---|---|
| `librariesRoot` | Root directory where libraries are created | `~/MediaManager/Libraries` |
| `language` | UI language (`en`, `el`, `sq`) | `en` |
| `theme` | Color theme (`dark`, `light`, `system`) | `dark` |
| `thumbCacheSizeMb` | Maximum thumbnail cache size in MB | `2048` (2 GB) |
| `thumbWorkers` | Thumbnail worker threads (`auto` or a number) | `auto` |
| `immichUrl` | Base URL of your Immich server | _(empty)_ |
| `immichApiKey` | API key from Immich → Account Settings | _(empty)_ |

---

## Libraries

A **library** is a regular directory on disk under `librariesRoot`, marked with a `.medialib.json` metadata file. There is no proprietary catalog — moving the folder elsewhere keeps it intact.

```
~/MediaManager/Libraries/
  Vacations/
    .medialib.json      ← library metadata (name, id, icon, color)
    IMG_0001.jpg
    IMG_0002.jpg
  Work Projects/
    .medialib.json
    ...
```

### Creating a library

Click the **+** button in the Libraries panel. Choose a name, optional icon, and color. The folder is created immediately under `librariesRoot`.

### Moving files into a library

- **Drag and drop** items from the grid onto a library row in the sidebar.
- **Right-click → Move to Library** or **Copy to Library** from the thumbnail context menu.
- **Inspector panel** action buttons.

All operations support three conflict policies: **Skip** (default), **Overwrite**, and **Rename** (appends `_1`, `_2`, …).

---

## Immich Integration

MediaManager can sync a library's contents to a self-hosted [Immich](https://immich.app) server.

### Setup

1. Open **Settings → Sync**.
2. Enter your **Server URL** (e.g., `https://immich.yourdomain.com`).
3. Paste your **API Key** from Immich → Account Settings → API Keys.
4. Click **Test Connection** to verify.
5. Click **Save**.

### Syncing a library

Hover over any library in the sidebar and click the **upload cloud** icon (↑☁). MediaManager will:

1. Find or create an album named `mm-<LibraryName>` on Immich.
2. Upload every supported media file in the library recursively.
3. Add all uploaded assets to the album.
4. Show a toast summary: _"Synced 'mm-Vacations' · 47 uploaded, 12 already on Immich"_.

Files already present on Immich (matched by device asset ID) are skipped automatically — re-syncing is always safe.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + F` | Focus search |
| `Cmd/Ctrl + A` | Select all items |
| `Cmd/Ctrl + Click` | Toggle item in selection |
| `Shift + Click` | Range select from anchor |
| `Esc` | Clear selection |
| `Delete` | Move selected items to trash |
| `Enter` / `Space` | Open selected item in default app |
| Arrow keys | Move selection within grid |

---

## Project Structure

```
MediaManager/
├── src/                        # React + TypeScript frontend
│   ├── components/
│   │   ├── layout/             # AppShell, Toolbar, panels
│   │   ├── folders/            # FolderTree
│   │   ├── libraries/          # LibraryList, NewLibraryDialog
│   │   ├── grid/               # MediaGrid, Thumbnail
│   │   ├── inspector/          # Inspector, ExifPanel
│   │   └── dialogs/            # Settings, MoveCopy, Confirm
│   ├── hooks/                  # useThumbnail, useLibraries, …
│   ├── ipc/                    # Typed Tauri command wrappers
│   ├── stores/                 # Zustand stores (UI, selection, thumbs)
│   ├── i18n/                   # i18next locales (en / el / sq)
│   └── lib/                    # Shared utilities
├── src-tauri/
│   ├── Cargo.toml              # Workspace manifest
│   ├── tauri.conf.json         # App config, capabilities
│   ├── src/main.rs             # Entry point, state setup
│   └── crates/
│       ├── mm-core/            # Domain types + AppError
│       ├── mm-fs/              # Filesystem operations + watcher
│       ├── mm-thumbs/          # Thumbnail generation pipeline
│       ├── mm-exif/            # EXIF / metadata reading
│       ├── mm-cache/           # SQLite thumbnail cache
│       ├── mm-libraries/       # Library CRUD
│       └── mm-app/             # Tauri IPC command surface
├── public/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Development Notes

### Thumbnail cache

Generated thumbnails are stored as WebP at `~/.medialib/cache/thumbs/` and indexed in a SQLite database at `~/.medialib/cache/cache.db`. The cache is LRU-evicted when it exceeds `thumbCacheSizeMb`. Previously-failed thumbnails are retried on every fresh app launch.

### File format detection

Thumbnails and media kind detection use **magic bytes** (not file extensions) for format identification. A PNG file named `.jpg` will be decoded correctly.

### Thumbnail pipeline

```
Viewport scroll → useThumbnail hook
                → IPC generate_thumbnails_batch
                → Rust: cache lookup (blake3 key)
                → miss: decode image/video → resize (Lanczos3) → encode WebP
                → emit "thumbnail-ready" { path, data_url }
                → Zustand thumb store → React re-render
```

### Adding a new IPC command

1. Define the handler in `src-tauri/crates/mm-app/src/lib.rs`.
2. Register it in `register_handlers()`.
3. Add a typed wrapper in `src/ipc/commands.ts`.
4. Add any new return types to `src/ipc/types.ts`.

---

## Supported File Formats

### Images
`JPEG` · `PNG` · `GIF` · `BMP` · `TIFF` · `WebP` · `HEIC` / `HEIF`

### RAW (read-only)
`CR2` · `CR3` · `NEF` · `ARW` · `DNG` · `RAF` · `RW2` · `ORF` · `SRW` · `PEF`

### Video
`MP4` · `MOV` · `MKV` · `AVI` · `WebM` · `M4V` · `MTS` / `M2TS`

---

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request for significant changes.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Commit your changes with a clear message.
4. Push to your fork and open a pull request against `main`.

---

## License

[MIT](LICENSE) © 2026 MediaManager Contributors
