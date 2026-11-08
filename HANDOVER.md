# VORTEX (CreatorVault) — Engineering Handover Document

**Version:** `v0.1.0`  
**Repository:** https://github.com/pranzzzhu/CreatorVault  
**Release Tag:** `v0.1.0`  
**Local Executable:** `D:\CreatorVault\release\win-unpacked\Vortex.exe`  
**Desktop Shortcut:** `C:\Users\HP\Desktop\Vortex.lnk`  
**Specification:** [`creator_vault_product_architecture_specification.md`](./creator_vault_product_architecture_specification.md)  
**Last Audit:** Elephant-Goldfish Method (EGM) Final A-to-Z Review (`0` Blockers, all DoD criteria passed)

---

## 1. Executive Summary

**VORTEX (`CreatorVault`)** is a local-first desktop media utility for video editors, music producers, and motion designers ("Stacher7 meets Raycast"). It wraps command-line and machine-learning engines (`yt-dlp`, `FFmpeg`, `Demucs`, `VTracer`, `U2Net ONNX`, `Real-ESRGAN`) inside a high-contrast dark-mode interface built on Electron, React 19, and Vite.

Outputs (video cuts, isolated audio stems, Premiere Pro XML timelines, Bézier SVG traces, 32-bit transparent PNG alpha mattes) render as draggable pills that drop directly out of the application window onto NLE timelines (Adobe Premiere Pro, After Effects, DaVinci Resolve, FL Studio, Figma).

---

## 2. Technology Stack

- **Shell:** Electron 45 (`webSecurity: true`, custom privileged `vortex-media://local/` streaming protocol, native `webContents.startDrag`)
- **Frontend:** React 19, TypeScript 7, Vite 8
- **Styling:** Tailwind CSS 4, daisyUI 5, Lucide Icons, Antigravity obsidian theme (`#050505` titlebar, `#09090B` base, `#10B981` / `#6366F1` accents)
- **State Management:** Zustand 5 (global settings, active job queue, sequential batch execution queues)
- **Hardware Probing:** NVIDIA CUDA (`nvenc` / `cuda`), Apple Silicon (`mps`), or CPU fallback via `HardwareProbe.ts`
- **Packaging:** `electron-builder` (custom `electronDist` configuration targeting `win-unpacked` and zip archives without external download hangs)

---

## 3. Shipped Modules & Capabilities

### Module 1: Ripper, Clipper & Stem Lab
- **Instant URL Inspection:** Global `Ctrl+V` listener triggers `yt-dlp --dump-single-json` (<1.2s inspection) for YouTube, Instagram, TikTok, X, SoundCloud, Vimeo, and Twitch.
- **Visual Section Clipper:** Dual-handle timeline range slider (`TimeRangeSlider.tsx`) that enforces frame-accurate cutting using `yt-dlp --download-sections "*START-END" --force-keyframes-at-cuts`.
- **Edit-Ready Safe Mode:** Enforces NLE-safe containers using lossless container remuxing (`--remux-video mp4` for `H.264/AAC`) and uncompressed `48kHz 16-bit PCM .wav` via FFmpeg normalization (`extractOrNormalizeWav`).
- **Local AI Stem Separation:** Spawns `Demucs` (`htdemucs`) for **2-Stem** (`Vocals` + `Instrumental`) or **4-Stem** (`Vocals`, `Drums`, `Bass`, `Instrumental`). Uses `gpuMutex` FIFO serialization to prevent CUDA VRAM collisions.
- **Synchronized Stem Audio Mixer:** In-app multi-track `<audio>` player with Solo (S), Mute (M), and automatic `<35ms` phase-drift correction between stems.
- **Cookie Pass-Through:** 1-click `--cookies-from-browser` option (`Chrome`, `Brave`, `Edge`, `Firefox`) to bypass age/member restrictions.

### Module 2: FFmpeg Video Fixer & Proxy Deck
- **Footage Dropzone:** Ingests local camera clips (`.mp4`, `.mov`, `.mkv`, `.mxf`, `.webm`), probes exact streams via `ffprobe` (`r_frame_rate`, `avg_frame_rate`, codecs, dimensions, duration).
- **Preset 1 (LED Deflicker & De-Band):** Filters temporal flicker and banding via `deflicker=mode=pm:size=<5|7|11>,gradfun=strength=1.2:radius=8` using `h264_nvenc` or `libx264`.
- **Preset 2 (Exact Target Size Compressor):** Solves exact target bitrates (`8MB`, `10MB`, `25MB`, `50MB`, `100MB`) with a 6% container safety margin: `(targetMB * 8192 * 0.94) / duration - 128kbps`. Uses NVENC VBR or isolated 2-pass `libx264`.
- **Preset 3 (ProRes 422 Proxy Deck):** Transcodes high-bitrate clips into `1080p Apple ProRes 422 Proxy (.mov)` (`prores_ks -profile:v 0 -pix_fmt yuv422p10le`) with `48kHz PCM` audio. Caps upscaling via `scale=-2:'min(1080,ih)'`.
- **Preset 4 (Silence Chopper → Premiere XML):** Scans audio pauses via `silencedetect`, parses timestamps, emits an Apple Final Cut Pro 7 / Premiere Pro / DaVinci Resolve compatible `xmeml version="5"` `.xml` cut timeline (with NTSC `23.976/29.97/59.94` timebase detection and `file://localhost/` URI formatting), plus a jump-cut preview `.mp4`.
- **Preset 5 (Social Compression Armor & IG Reel Optimizer):** Pre-compensates for aggressive platform re-compression across Instagram Reels, TikTok, and YouTube Shorts. Applies 1080×1920 9:16 Lanczos scaling, temporal grain denoising (`hqdn3d`), unsharp pre-emphasis (`unsharp=3:3:0.5|0.85`), CFR lock (`fps=30|60`), broadcast master `libx264` encoding (slow preset, CRF 18, 12M maxrate, tuned AQ mode and GOP keyint lock), Rec.709 color space lock (`bt709 tv`), and EBU R128 audio normalization (`loudnorm=I=-14:TP=-1.0`). Includes an automated constrained platform upload simulator computing VMAF / SSIM perceptual retention lift.

### Module 3: Vectorizer, Background & Upscale Dock
- **Asset Dropzone:** Ingests raster assets (`.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`).
- **Tool 1 (Raster-to-SVG Vectorizer):** Converts bitmaps to Bézier spline SVGs via `vtracer 0.6.15` Rust engine (supports `color` and `binary`/`bw` modes with speckle filtering) with built-in FFmpeg RGBA contour fallback.
- **Tool 2 (Studio Background Remover):** Direct `onnxruntime` inference against `~/.u2net/u2net.onnx` (`CPUExecutionProvider`) with PIL and NumPy. Bypasses `rembg` pooch/numba/cuDNN hangs and executes in ~1.5 seconds. Includes an automatic FFmpeg perimeter studio `colorkey` fallback.
- **Tool 3 (Super-Resolution Upscaler):** 2x and 4x neural upscaling using `RealESRGAN_x4plus.pth` via PyTorch `spandrel` with `384×384` tiling to prevent GPU VRAM spikes, or via `realesrgan-ncnn-vulkan`, with FFmpeg Lanczos+CAS edge fallback.
- **Before / After Inspector:** Side-by-side comparison view with transparent alpha checkerboard (`.bg-checkerboard`) and native OS drag-out to desktop or editor.

---

## 4. Sidecar Engine Management (`BinaryManager.ts`)

The application provisions and checks 7 distinct sidecar binaries across `./bin`, WinGet links, and system `PATH`. Missing engines can be installed in 1 click from the in-app **Settings $\rightarrow$ Sidecar Binaries** panel:

| Engine | Primary Check | Fallback / 1-Click Source |
| :--- | :--- | :--- |
| `yt-dlp` | `./bin/yt-dlp.exe` or `where yt-dlp` | `python -m pip install -U yt-dlp` |
| `ffmpeg` | `where ffmpeg` or WinGet links | `winget install Gyan.FFmpeg` (Win) / `brew install ffmpeg` (macOS) |
| `ffprobe` | `where ffprobe` or WinGet links | `winget install Gyan.FFmpeg` (Win) / `brew install ffmpeg` (macOS) |
| `demucs` | `importlib.util.find_spec('demucs')` | `python -m pip install -U demucs` |
| `rembg` | `~/.u2net/u2net.onnx` + `onnxruntime` | PyPI packages + Hugging Face CDN (`tomjackson2023/rembg/u2net.onnx`) |
| `vtracer` | `where vtracer` or `find_spec('vtracer')` | `python -m pip install -U vtracer` |
| `realesrgan` | `where realesrgan-ncnn-vulkan` or `RealESRGAN_x4plus.pth` + `spandrel` | PyPI (`spandrel`, `torchvision`) + Hugging Face CDN (`lllyasviel/Annotators`) |

---

## 5. Directory & File Guide

```text
D:\CreatorVault\
├── .gitignore                                   # Excludes bin/, weights (*.onnx, *.pth), node_modules, release/
├── LICENSE                                      # MIT License
├── README.md                                    # GitHub repository documentation with architecture diagrams
├── THIRD_PARTY_LICENSES.md                      # Licenses for yt-dlp, FFmpeg (GPLv3), Demucs, VTracer, Rembg, ESRGAN
├── creator_vault_product_architecture_specification.md # Source-of-truth PRD and technical specification
├── package.json                                 # Scripts, dependencies, electron-builder build config
├── tsconfig.json                                # TypeScript configuration
├── vite.config.ts                               # Vite 8 + React 19 + Electron plugins
│
├── electron/
│   ├── main.ts                                  # App lifecycle, vortex-media:// handler, IPC channels, startDrag
│   ├── preload.ts                               # ContextBridge exposing vortexApi & webUtils.getPathForFile
│   └── services/
│       ├── BinaryManager.ts                     # Binary resolution, killProcessTree, 1-Click Installer
│       ├── HardwareProbe.ts                     # Probes CUDA, NVENC, and Apple Silicon MPS
│       ├── YtDlpRunner.ts                       # YouTube/VOD downloader, sub-clipper & JSON parser
│       ├── FfmpegRunner.ts                      # WAV normalizer, ffprobe inspector, Fixer deck & Premiere XML
│       ├── StemRunner.ts                        # Demucs AI separation runner with serial gpuMutex
│       └── VectorRunner.ts                      # VTracer SVG, U2Net ONNX segmentation & Real-ESRGAN upscaler
│
├── src/
│   ├── App.tsx                                  # Root shell, window drag strip, module switcher
│   ├── main.tsx                                 # React entry point
│   ├── index.css                                # Tailwind CSS 4 + daisyUI 5 Antigravity theme & checkerboard
│   ├── types/
│   │   └── media.ts                             # Shared TypeScript interfaces for IPC, jobs, presets, diagnostics
│   ├── store/
│   │   └── useJobStore.ts                       # Zustand state store with sequential batch queues
│   └── components/
│       ├── layout/
│       │   ├── SidebarRail.tsx                  # Left navigation, telemetry badge, sidecar count, zoom controls
│       │   └── DiagnosticsPanel.tsx             # Settings modal, 1-Click Sidecar Installer, theme selector
│       ├── ripper/
│       │   ├── UrlCommandBar.tsx                # Auto-paste listener & URL input bar
│       │   ├── StagingCard.tsx                  # Video details, stream picker, trim toggle, stem mode selector
│       │   ├── TimeRangeSlider.tsx              # Dual-handle In/Out range slider with millisecond inputs
│       │   └── JobQueueList.tsx                 # Queue cards, draggable pills, HTML5 stem audition mixer
│       ├── fixer/
│       │   └── FixerModuleView.tsx              # Local video dropzone, 4 preset cards, parameter controls
│       └── vectorizer/
│       │   └── VectorizerModuleView.tsx         # Image dropzone, 3 tool cards, Before/After inspector
│
└── release/
    ├── win-unpacked/                            # Portable standalone Windows distribution
    │   └── Vortex.exe                           # Main executable (249 MB)
    └── Vortex-v0.1.0-win-x64.zip                # Packed zip release asset (154 MB)
```

---

## 6. Critical Architectural Solutions & Invariants

Maintain these patterns during future work:

1. **Child Process Concurrency Control:**
   - Consumer NVIDIA GPUs enforce a hard limit of 3–5 concurrent NVENC sessions. Batch operations in [`useJobStore.ts`](./src/store/useJobStore.ts) use sequential `for...of` loops rather than `Promise.all`.
   - `StemRunner.ts` enforces a strict FIFO mutex (`gpuMutex`) so multiple Demucs runs never execute concurrently.
2. **Process Lifecycle & Tree Cleanup:**
   - Killing an Electron child process does not automatically kill descendant workers (`ffmpeg.exe`, PyTorch CUDA workers). All terminations call `killProcessTree` in [`BinaryManager.ts`](./electron/services/BinaryManager.ts), which invokes `spawnSync('taskkill', ['/pid', pid, '/T', '/F'])` on Windows.
3. **Child Process Pipe Draining:**
   - All spawned long-running processes call `proc.stdout?.resume();` immediately after spawning. Failing to drain stdout causes child processes to lock up when output exceeds 64KB (e.g. `pip install` or verbose model loads).
4. **File Path Sanitization in Python Calls:**
   - Filesystem paths are passed as positional arguments (`sys.argv[1..n]`), never interpolated directly into `python -c` strings, avoiding syntax breaks on usernames with apostrophes or spaces.
5. **Renderer Security & Media Streaming:**
   - Renderer runs with `webSecurity: true` and `contextIsolation: true`. Local media playback routes through the custom privileged scheme `vortex-media://local/<encoded-path>`, with query parameters stripped before disk resolution.
6. **Native OS Drag-and-Drop:**
   - Pill dragging triggers `window.vortexApi.startNativeDrag(filePath)` via `ipcRenderer.send('ondragstart')`. Main process verifies existence with `fs.existsSync` (or synthesizes a simulated valid fallback) and resolves an absolute normalized path before invoking `webContents.startDrag({ file, icon })`.

---

## 7. Developer Operations

### Running in Development
```bash
cd D:\CreatorVault
npm install
npm run dev
```

### Type Checking & Code Verification
```bash
npx tsc --noEmit
```

### Packaging Windows Executable
```bash
# Builds dist/, dist-electron/, and populates release/win-unpacked/Vortex.exe
npx electron-builder --win --x64
```

### Updating GitHub Releases
```bash
git add .
git commit -m "your commit message"
git push origin main
```
To attach a new build zip to a release, use the GitHub REST API or upload `release/Vortex-v0.1.0-win-x64.zip` directly via the GitHub Releases web interface.

---

## 8. Open Roadmap & Expansion Hooks

1. **Phase 4 Multi-Image Scraper (`gallery-dl`):** Hook exists in UI and PRD Section 2.2; needs runner implementation in `electron/services/GalleryRunner.ts`.
2. **macOS Packaging:** Tested and path-safe for macOS (`~/Library/Application Support`, `brew install ffmpeg`), needs macOS code signing credentials and `.dmg` target configuration in `package.json`.
3. **Hardware Accelerators:** AMD ROCm / Intel oneAPI / Apple Silicon MPS profiles can be added to `HardwareProbe.ts`.
