# PRODUCT & ARCHITECTURE SPECIFICATION (PRD)
**Project Code Name:** VORTEX (The Local-First Creator Media Engine)  
**Target Platform:** Desktop (Windows 10/11 & macOS)  
**Architecture Paradigm:** Local-First, Modular Sidecar Binary Runner, High-Contrast Dark UI  

---

## 1. EXECUTIVE SUMMARY & VISION
**VORTEX** is an obsessive, ultra-sleek desktop media utility ("Stacher7 meets Raycast for Video Editors, Producers, and Designers"). It takes the world's most powerful command-line media and AI engines (`yt-dlp`, `FFmpeg`, `Demucs`, `gallery-dl`, `VTracer`, and `ONNX`) and wraps them in a frictionless, zero-terminal, outcome-driven dark-mode interface.

The application is designed around a **3-Module Unified Architecture**, shipped in sequential phases:
* **MODULE 1 (PHASE 1 — PRIMARY BUILD TARGET):** **The Ripper, Clipper & Stem Lab.** Paste any URL $\rightarrow$ preview and trim exact timestamp sections before downloading $\rightarrow$ enforce Premiere/AE-safe codecs (`H.264`/`ProRes`/`.wav`) $\rightarrow$ locally split audio into isolated AI stems (`Vocals`, `Instrumental`, `Drums`, `Bass`) via GPU $\rightarrow$ drag and drop directly onto an editing timeline.
* **MODULE 2 (PHASE 2 — PLUG-IN EXPANSION):** **The FFmpeg Video Fixer & Proxy Deck.** Drag-and-drop local camera footage to kill LED rolling-shutter flicker, generate instant ProRes/DNxHR proxies, compress to exact Discord/WhatsApp file sizes (10MB/25MB), and chop dead-air silence into Premiere XML timelines.
* **MODULE 3 (PHASE 3 — PLUG-IN EXPANSION):** **The Vectorizer, Background & Upscale Dock.** Local GPU batch background removal (`RMBG-2.0`), 4x image upscaling (`Real-ESRGAN`), and raster-to-SVG vectorization (`VTracer`).

---

## 2. SYSTEM ARCHITECTURE & TECH STACK

To ensure a tiny installer footprint, instant startup, native OS drag-and-drop support, and effortless expansion to Modules 2 and 3, the application uses a **Modular Sidecar Architecture**.

### 2.1 Core Stack
* **Desktop Shell:** **Electron (with Vite + Electron-Builder)** for Node.js `child_process` stream control, `vortex-media://local/` privileged local media streaming, and native `webContents.startDrag` out-of-window file dragging into Premiere Pro, DaVinci Resolve, and FL Studio.
* **Frontend Framework:** **React 19 (TypeScript)** + **Vite 8**.
* **Styling & Aesthetic:** **Tailwind CSS 4** + **daisyUI 5** + **Lucide Icons**.
  * *Visual Aesthetic:* Deep obsidian dark mode (`#09090B` background, `#121215` elevated cards, `#27272A` 1px crisp borders, high-contrast `#FAFAFA` editorial typography, monospace telemetry badges, and `#10B981` / `#6366F1` accent glows).
* **State Management:** **Zustand 5** (managing the active job queue, 7-binary sidecar installation states, real-time stdout/stderr progress streams, and global settings).
* **Audio Audition Engine:** **Synchronized HTML5 Multi-Track Stem Mixer** (with `<35ms` phase-drift lock, Solo/Mute toggles, and visual timestamp range trimming).

### 2.2 Local Binary & Sidecar Management (`/bin` Directory & 1-Click Installer)
`BinaryManager.ts` discovers binaries across `./bin`, system `PATH`, and WinGet packages, and provides a **1-Click Sidecar Installer** inside the Settings modal (using PyPI + Hugging Face CDN):
* **7 Managed Sidecar Engines:**
  1. `yt-dlp` (Universal web video/audio extractor and section clipper).
  2. `ffmpeg` & `ffprobe` (Full build with `libx264`, `prores_ks`, `h264_nvenc`, `deflicker`, `silencedetect`, and audio filters).
  3. `demucs` (`htdemucs` PyTorch GPU/CPU stem separator).
  4. `rembg` (`U2Net` ONNX Runtime neural subject segmentation via `~/.u2net/u2net.onnx`).
  5. `vtracer` (`vtracer 0.6.15` Rust spline raster-to-SVG vectorizer).
  6. `realesrgan` (`RealESRGAN_x4plus.pth` neural 2x/4x super-resolution via PyTorch `spandrel` or `realesrgan-ncnn-vulkan`).
* *Deferred Phase 4 Target:* `gallery-dl` (for multi-image album dumps).
* **Hardware Telemetry Probe (`HardwareProbe.ts`):**
  * Probes `nvidia-smi` and `ffmpeg -encoders` on launch to detect **NVIDIA CUDA (`nvenc` / `cuda`)**, **Apple Silicon (`mps`)**, or **CPU fallback**.

---

## 3. DEEP-DIVE SPECIFICATION: MODULE 1 (PHASE 1 BUILD TARGET)
**Module Name:** *Universal Clipper, Ripper & Stem Lab*

### 3.1 Feature 1: Instant URL Probe & Smart Paste
* **Trigger:** User presses `Ctrl+V` anywhere in the window or pastes a URL into the top Command Bar.
* **Execution:** Spawns a background non-blocking child process:
  ```bash
  yt-dlp --dump-single-json --no-playlist --flat-playlist "<URL>"
  ```
* **UI Response (Under 1.2s):**
  * Renders an interactive **Media Staging Card** displaying: High-res Thumbnail, Video Title, Channel/Uploader, Duration, Source Badge (YouTube, Instagram, TikTok, X, SoundCloud, Twitch), and available Video/Audio stream options (4K, 1440p, 1080p, Audio-Only WAV/MP3).

### 3.2 Feature 2: Visual Section Clipper (Download Only What You Need)
* **Problem Solved:** Downloading a 3-hour 4K stream just to extract an 18-second reaction clip.
* **UI Component:** A dual-handle range slider + `MM:SS.ms` input boxes (`Start Time` and `End Time`) with quick `+1s / -1s` nudge buttons.
* **Execution:** When the user enables the **"Trim Section"** toggle and sets `01:14:20` to `01:14:38`, the command builder constructs:
  ```bash
  yt-dlp -f "<format_selector>" \
    --download-sections "*01:14:20-01:14:38" \
    --force-keyframes-at-cuts \
    --ffmpeg-location "./bin/ffmpeg.exe" \
    --newline \
    --progress-template "download:{\"percent\":\"%(progress._percent_str)s\",\"speed\":\"%(progress._speed_str)s\",\"eta\":\"%(progress._eta_str)s\"}" \
    -o "<output_path>" "<URL>"
  ```
* **Stream Parser:** The backend reads `stdout` line-by-line, parses the JSON progress template, and emits IPC events (`job:progress`) at 60fps to update the React UI progress bar smoothly.

### 3.3 Feature 3: "NLE Edit-Ready" Safe Mode vs. Raw Mode
* **Problem Solved:** `yt-dlp` defaults to `.webm` (VP9/AV1 + Opus) and `.webp` thumbnails, which fail to import or cause severe timeline lag in Adobe Premiere Pro, After Effects, and DaVinci Resolve.
* **UI Component:** Global pill switch in the top header: **`[ ⚡ Edit-Ready (MP4/WAV) ]`** vs **`[ Raw Stream ]`**.
* **Execution:**
  * **If Video + Edit-Ready is active:** Forces `H.264` (`avc1`) + `AAC` inside a standard `.mp4` container (or automatically transcodes via `h264_nvenc` if only VP9/AV1 exists for 4K):
    ```bash
    -f "bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo+bestaudio" --merge-output-format mp4 --recode-video mp4
    ```
  * **If Audio-Only + Edit-Ready is active:** Extracts uncompressed `48kHz 16-bit PCM .wav` (instead of variable-bitrate `.mp3` which causes Premiere timeline drift):
    ```bash
    -x --audio-format wav --postprocessor-args "ffmpeg:-ar 48000 -ac 2"
    ```
  * **Thumbnails:** Automatically converts downloaded `.webp` thumbnails to `.png` via `--convert-thumbnails png`.

### 3.4 Feature 4: 1-Click Local AI Stem Separation (`Demucs`)
* **Problem Solved:** Content creators and video editors need to remove copyrighted background music while keeping spoken dialogue/SFX intact, or music producers want to isolate the beat/vocals from a reference track.
* **UI Component:** A toggle switch inside the Staging Card: **`[ 🎛️ Split Audio Stems (AI) ]`** with sub-options:
  * **2-Stem Fast Mode (`--two-stems=vocals`):** Outputs `Vocals / Speech.wav` + `Instrumental / BGM.wav`. (Ideal for video editors).
  * **4-Stem Studio Mode (`htdemucs`):** Outputs `Vocals.wav`, `Drums.wav`, `Bass.wav`, `Other.wav`. (Ideal for producers/remixers).
* **Execution Pipeline:**
  1. Job Stage 1 (`0% -> 50%`): `yt-dlp` downloads and extracts the target clip/audio.
  2. Job Stage 2 (`50% -> 100%`): Immediately pipes the output file into the local Demucs worker:
     ```bash
     python -m demucs.separate -n htdemucs -d cuda --out "<output_dir>/stems" "<downloaded_audio_file>"
     ```
  3. Parses Demucs `stderr` progress (`%|████| 45/100`) and updates the UI status badge to `"Separating Stems on GPU (45%)..."`.

### 3.5 Feature 5: In-App Stem Mixer & Native Drag-to-Timeline
* **UI Component:** Once a job completes, the Job Card expands to show **draggable stem pills**:
  * `[ 🎤 Vocals.wav ]` `[ 🎹 Instrumental.wav ]` `[ 🥁 Drums.wav ]` `[ 🎸 Bass.wav ]` `[ 🎬 Full_Clip.mp4 ]`
* **Interactive Preview:** Clicking the Play button on a completed card plays the synchronized stems using `WaveSurfer.js`, allowing the user to **Solo (S)** or **Mute (M)** individual stems right inside the app to verify cleanliness.
* **Native OS Drag-and-Drop:** Users can click and drag any stem pill `[ 🎤 Vocals.wav ]` directly out of the app window and drop it straight onto an open **Adobe Premiere Pro, After Effects, DaVinci Resolve, or FL Studio** timeline using Electron's native `ipcRenderer.send('ondragstart', filePath)` API.

### 3.6 Feature 6: Browser Cookie Bypass (Zero Login Errors)
* **Problem Solved:** Age-restricted YouTube videos, Instagram Reels, or private lectures failing with `403 Forbidden` or `Sign in to confirm your age`.
* **UI Component:** Settings dropdown allowing the user to select their primary browser (`Chrome`, `Brave`, `Edge`, `Firefox`).
* **Execution:** Appends `--cookies-from-browser <browser_name>` to `yt-dlp` and `gallery-dl` commands automatically.

---

## 4. MODULAR PLUG-IN ARCHITECTURE FOR PHASES 2 & 3

The UI left-hand navigation rail must be built from Day 1 with three distinct workspace icons so Modules 2 and 3 can be dropped in without refactoring the core app:

```text
+-------------------------------------------------------------------------+
| [VORTEX]   [⚡ Edit-Ready Mode: ON]    [🟢 GPU Turbo: RTX]   [_][□][X] |
+----+--------------------------------------------------------------------+
|    |  +--------------------------------------------------------------+  |
| 📥 |  | 🔗 Paste YouTube, Reel, TikTok, Pinterest or SoundCloud URL  |  |
| RIP|  +--------------------------------------------------------------+  |
|    |                                                                    |
| 🎞️ |  +--------------------------------------------------------------+  |
| FIX|  | [Thumbnail]  Video Title Here                     [4K MP4 v] |  |
|    |  | 00:00 [=======|==========|================] 14:20            |  |
| ✒️ |  |        In: 02:10.00   Out: 02:28.50 (18.5s Clip)             |  |
| VEC|  |                                                              |  |
|    |  | [x] Split Audio Stems (2-Stem: Speech + BGM)  [🚀 Download]  |  |
| ⚙️ |  +--------------------------------------------------------------+  |
| SET|                                                                    |
|    |  ACTIVE & COMPLETED QUEUE                                          |
|    |  +--------------------------------------------------------------+  |
|    |  | ✅ DSCF_Interview_Clip.mp4                          100%     |  |
|    |  | Drag to Timeline: [🎬 Video] [🎤 Dialogue.wav] [🎹 BGM.wav]  |  |
|    |  +--------------------------------------------------------------+  |
+----+--------------------------------------------------------------------+
```

### How All Three Modules Plug Into the Unified Engine:
1. **`[ 📥 RIP ]` (Module 1 — Shipped):** Uses `YtDlpRunner.ts` and `StemRunner.ts` (serialized via `gpuMutex`) with `FfmpegRunner.extractOrNormalizeWav`.
2. **`[ 🎞️ FIX ]` (Module 2 — Shipped in `FfmpegRunner.ts` & `FixerModuleView.tsx`):** Probes local footage via `ffprobe` (`r_frame_rate` / `avg_frame_rate`) and runs sequential batch jobs across 4 presets:
   * **LED Deflicker & De-Band:** `ffmpeg -i input.mov -vf "deflicker=mode=pm:size=<5|7|11>,gradfun=strength=1.2:radius=8"` with `h264_nvenc` or `libx264`.
   * **Target Size Compressor (8MB–100MB):** Solves `videoKbps = floor((targetMB * 8192 * 0.94) / duration - 128)` using `h264_nvenc` VBR or isolated 2-pass `libx264`.
   * **Instant ProRes 422 Proxy Deck:** `ffmpeg -i input.mp4 -vf "scale=-2:'min(1080,ih)'" -c:v prores_ks -profile:v 0 -pix_fmt yuv422p10le -c:a pcm_s16le -ar 48000 output.mov`.
   * **Silence Chopper to Premiere XML:** Runs `silencedetect`, exports a Final Cut Pro 7 / Premiere Pro `xmeml version="5"` `.xml` cut list (`file://localhost/` URI + NTSC timebase detection), and renders a jump-cut preview `.mp4`.
3. **`[ ✒️ VEC ]` (Module 3 — Shipped in `VectorRunner.ts` & `VectorizerModuleView.tsx`):** Pipes local `.png`/`.jpg`/`.webp` assets sequentially through:
   * **Raster-to-SVG Vectorizer:** `vtracer` spline engine (`color` / `binary` mode) with FFmpeg RGBA contour fallback.
   * **Studio Background Remover:** Direct `onnxruntime` inference on `~/.u2net/u2net.onnx` (`CPUExecutionProvider`) with FFmpeg perimeter `colorkey` fallback.
   * **Super-Resolution Asset Upscaler:** 2x/4x neural upscaling via `realesrgan-ncnn-vulkan` or PyTorch `spandrel` (`RealESRGAN_x4plus.pth` with 384×384 tiling) and FFmpeg Lanczos+CAS fallback.

---

## 5. TARGET FOLDER STRUCTURE

```text
vortex-media-engine/
├── electron/
│   ├── main.ts                      # Window creation, IPC handlers, vortex-media:// protocol, Native File Drag
│   ├── preload.ts                   # ContextBridge exposing safe IPC APIs & webUtils.getPathForFile
│   └── services/
│       ├── BinaryManager.ts         # Discovers & 1-click installs all 7 sidecar binaries/models
│       ├── HardwareProbe.ts         # Detects NVIDIA CUDA / NVENC / Apple Silicon
│       ├── YtDlpRunner.ts           # Metadata fetching, section clipping, stdout parser
│       ├── FfmpegRunner.ts          # WAV normalization, local video probe, Phase 2 Fixer & XML presets
│       ├── StemRunner.ts            # Spawns Demucs AI separation with GPU mutex & progress parser
│       └── VectorRunner.ts          # Phase 3 VTracer SVG, U2Net ONNX background removal & Real-ESRGAN upscaling
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── SidebarRail.tsx      # Navigation between Module 1 (Rip), 2 (Fix), 3 (Vec) + telemetry
│   │   │   ├── TopStatusBar.tsx     # Edit-Ready Toggle, GPU status badge, Cookie selector
│   │   │   └── DiagnosticsPanel.tsx # Settings modal with 1-Click Sidecar Installer & theme/output config
│   │   ├── ripper/
│   │   │   ├── UrlCommandBar.tsx    # Auto-paste detector & URL input
│   │   │   ├── StagingCard.tsx      # Thumbnail, quality picker, trim slider, stem toggle
│   │   │   ├── TimeRangeSlider.tsx  # Dual-handle visual clipper (In/Out points)
│   │   │   └── JobQueueList.tsx     # Live progress cards + Draggable Pills + Synchronized Stem Mixer
│   │   ├── fixer/
│   │   │   └── FixerModuleView.tsx  # Phase 2 dropzone, 4 preset cards, parameter controls & queue
│   │   └── vectorizer/
│   │       └── VectorizerModuleView.tsx # Phase 3 dropzone, 3 tool cards, Before/After inspector & queue
│   ├── store/
│   │   └── useJobStore.ts           # Zustand store for all 3 modules, sequential batch queues & settings
│   ├── types/
│   │   └── media.ts                 # TypeScript interfaces for metadata, jobs, presets & diagnostics
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── tsconfig.json
```

---

## 6. DEFINITION OF DONE (ACCEPTANCE CRITERIA ACROSS PHASES 1, 2 & 3)
1. **Zero-Terminal Experience:** User pastes a URL $\rightarrow$ metadata loads in `<1.5s` with thumbnail and duration; missing sidecars can be installed in 1 click from Settings.
2. **Accurate Sub-Clipping:** User drags the In/Out timeline sliders to a 15-second window $\rightarrow$ downloaded video is *only* 15 seconds long with frame-accurate cuts and synced audio.
3. **NLE Compatibility:** With "Edit-Ready Mode" enabled, all video outputs are guaranteed `.mp4 (H.264/AAC)` and all audio outputs are `.wav (48kHz PCM)`.
4. **Local AI Stem Split:** Toggling "Split Stems" outputs isolated `Vocals.wav` and `Instrumental.wav` (or 4 stems) into the job folder and displays them as interactive pills in the UI.
5. **Phase 2 Video Fixer & Proxy Deck:** Dropping local video files accurately probes metadata and executes Deflicker, Target Size Compression (within cap), 1080p ProRes 422 Proxy `.mov`, and Silence Chopper (`xmeml v5` `.xml` + jump-cut `.mp4`).
6. **Phase 3 Vectorizer, Background & Upscale Dock:** Dropping local images executes VTracer SVG spline tracing, U2Net ONNX 32-bit transparent PNG background removal, and 2x/4x Real-ESRGAN upscaling with in-app Before/After preview.
7. **Drag-Out to Editor:** Dragging any output pill (`[🎤 Vocals.wav]`, `[🎬 Clip.mp4]`, `[📄 Premiere_Timeline.xml]`, `[✒️ Vector_Trace.svg]`, or `[🖼️ Alpha_Matte.png]`) from the app window into Windows Explorer, Premiere Pro, or Figma natively drops the normalized file path onto the target application.