# Intermediate Zoom Out Architectural Audit Report: CreatorVault v0.1.2

**Auditor:** Skeptical Architect (EGM Stage 8 Intermediate Zoom Out)  
**Target Document:** `docs/specs/v0.1.2_patch_spec.md`  
**Prior Context:** `zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`  
**Verdict:** 🔴 CONDITIONAL REJECT (4 Blockers, 5 Majors, 4 Nits)

---

## 1. Executive Assessment

Aggregated findings show v0.1.2 patch spec has systemic architectural defects. Spec swaps architectural contracts for superficial code diffs. Core product promises fail under real-world creator workflows.

### Systemic Conflicts Identified:
1. **Broken Edit-Ready Core Value Proposition:** Spec uses `--remux-video mp4` for YouTube 4K. Remuxing does not transcode VP9/AV1. Files crash Premiere Pro and DaVinci Resolve on Windows. The UI badge falsely claims `H.264 / MP4`.
2. **Over-Engineered yet Defective AI Upscaling:** Ad-hoc Python script implements manual tile slicing without feathering. Result: permanent grid lines on all images >640×640, GPU VRAM allocation spikes, and Lanczos alpha halos.
3. **Process Locking & Thread-Blocking I/O:** `BinaryManager` buffers 60MB executable in RAM, writes synchronously, and crashes Windows with `EBUSY` when files are locked.
4. **Specification Altitude Collapse:** Spec acts like an unvalidated patch script instead of an architectural specification. It specifies code diffs with broken targets, missing hooks, and omitted IPC implementations.

---

## 2. Findings Matrix

| ID | Severity | Category | Affected Scope | Root Cause & Impact |
|---|---|---|---|---|
| **B1** | 🔴 Blocker | Architectural Contract | Fix 1 (`YtDlpRunner.ts`) | `--remux-video mp4` does not transcode VP9/AV1. NLE timeline drop broken. |
| **B2** | 🔴 Blocker | Visual / Memory Bug | Fix 5 (`VectorRunner.ts`) | Direct slice tile assignment causes grid seams. 4x GPU canvas causes CUDA OOM. |
| **B3** | 🔴 Blocker | Concurrency & OS Fault | Fix 4 (`BinaryManager.ts`) | Unbuffered 60MB heap buffer, synchronous write, Windows `EBUSY` crash. |
| **B4** | 🔴 Blocker | Spec Incompleteness | Fix 6B (`main.ts`) | Spec re-inserts dark titlebar color; actual dynamic theme IPC omitted. |
| **M1** | 🟡 Major | Fault Tolerance | Fix 2 (`YtDlpRunner.ts`) | Broad `Permission denied` catch triggers silent auth disable on disk write errors. |
| **M2** | 🟡 Major | Audio Architecture | Fix 6A (`JobQueueList.tsx`) | `audioPills` includes master track; simultaneous play causes +6dB clipping. |
| **M3** | 🟡 Major | Extraction Throttle | Fix 3 (`YtDlpRunner.ts`) | Dropping `--js-runtimes` risks YouTube n-sig throttling (30-50 KB/s). |
| **M4** | 🟡 Major | Spec Altitude / Accuracy | Fix 1 (`YtDlpRunner.ts`) | Points reader to `defaultQualities` to edit `executeDownload()`. |
| **M5** | 🟡 Major | Model Assumptions | Fix 5 (`VectorRunner.ts`) | Hardcoded 4x math crashes if 2x model is loaded. |
| **N1** | 🟢 Nit | Portability | `BinaryManager` / `VectorRunner` | Hardcoded `D:\CreatorVault\...` development path. |
| **N2** | 🟢 Nit | Spec Typo | Fix 5 | References `rmbg` instead of `rembg`. |
| **N3** | 🟢 Nit | UI Polish | Fix 6B (`main.ts`) | Titlebar cold-start flash before renderer theme syncs. |
| **N4** | 🟢 Nit | React Hygiene | Fix 6A (`JobQueueList.tsx`) | Ambiguous early return placement relative to React hooks. |

---

## 3. Detailed Architectural Findings

### 🔴 B1: Broken Edit-Ready Guarantee (`--remux-video` Never Transcodes VP9/AV1)
- **Scope:** `docs/specs/v0.1.2_patch_spec.md` (Lines 7–56), `YtDlpRunner.ts` (Lines 322–351)
- **Problem:** YouTube provides 1440p and 4K in VP9 or AV1 codecs. `--remux-video mp4` only repackages the container via `-c copy`. It does not transcode video or Opus audio. Windows Premiere Pro and DaVinci Resolve Free reject VP9/AV1 in MP4 containers.
- **Architectural Fix:** In Edit-Ready mode at $\ge 1440$p, invoke `--recode-video mp4` (or post-process via CreatorVault's existing hardware-accelerated `FfmpegRunner`). If Raw mode is selected, keep source container (MKV/WebM) and label badge accurately as `VP9 / MKV`.

### 🔴 B2: Real-ESRGAN Tile Boundary Seams, Alpha Halos & VRAM Spikes
- **Scope:** `docs/specs/v0.1.2_patch_spec.md` (Lines 164–220), `VectorRunner.ts` (Lines 560–615)
- **Problem:**
  1. Stride is $384 - 16 = 368$, but code overwrites destination directly without feathering:
     `sr[:, :, y0*4:y1*4, x0*4:x1*4] = sr_patch`
     Boundary convolution artifacts produce square grid seams across all cutouts >640×640.
  2. Allocating `torch.zeros((1, 3, out_h, out_w), device=device)` creates a multi-gigabyte canvas directly in GPU VRAM, causing out-of-memory crashes on consumer 4GB/6GB GPUs.
  3. Sharp neural RGB combined with blurred Lanczos alpha creates edge halos around cutout borders.
- **Architectural Fix (Minimalist / YAGNI):**
  - Allocate canvas on CPU memory: `device='cpu'`. Only transfer 384×384 patches to GPU.
  - Apply linear feathering or cosine windowing on overlapping margins.
  - Cutout assets do not require unlimited scaling: enforce maximum input dimension clamp (e.g., 1024×1024) before tiling.

### 🔴 B3: Non-Atomic Binary Download & File Lock Crashes
- **Scope:** `docs/specs/v0.1.2_patch_spec.md` (Lines 136–162), `BinaryManager.ts` (Lines 439–453)
- **Problem:**
  - Buffers 60MB binary into Node heap with `res.arrayBuffer()`, then blocks Electron event loop with `fs.writeFileSync()`.
  - If `yt-dlp.exe` is running or probed, Windows throws an unhandled `EBUSY` exception, corrupting disk state.
  - macOS unsigned downloads receive `com.apple.quarantine` and fail execution.
- **Architectural Fix:** Stream download to a temporary file (`yt-dlp.exe.tmp`) using `stream.pipeline` with timeout. Atomically replace binary via `fs.renameSync()`. On macOS, strip quarantine via `xattr -d com.apple.quarantine`.

### 🔴 B4: Fix 6B Titlebar Code Snippet Incomplete in Spec
- **Scope:** `docs/specs/v0.1.2_patch_spec.md` (Lines 236–248)
- **Problem:** Replacement snippet in spec re-inserts `#050505` hardcoded value. The dynamic IPC theme listener is relegated to an unwritten parenthetical note. Naive implementers cannot execute the fix from the spec.
- **Architectural Fix:** Document the complete, concrete IPC contract across `main.ts`, `preload.ts`, and `useJobStore.ts`.

### 🟡 M1: Broad Permission Catch & Caller State Mutation
- **Scope:** `docs/specs/v0.1.2_patch_spec.md` (Lines 98–112), `YtDlpRunner.ts`
- **Problem:** `fullErr.includes('Permission denied')` catches OS file write errors (disk full, read-only folder, antivirus). Triggers useless anonymous download retry. Also mutates `config.browserCookies` by reference.
- **Architectural Fix:** Restrict error matching to cookie lock patterns (`/(cookie.*locked|cannot access.*cookie|Could not copy Chrome cookie)/i`). Pass a shallow clone: `{ ...config, browserCookies: 'none' }`.

### 🟡 M2: Multi-Stem Audio Summation Collision
- **Scope:** `JobQueueList.tsx` (Lines 56–115)
- **Problem:** `audioPills` includes `Full_Audio.wav` alongside Demucs stems (`Vocals.wav`, `Bass.wav`). `togglePlayAll` plays master and stems together, causing phase distortion and +6dB clipping.
- **Architectural Fix:** Filter out master audio before multi-stem playback: `const stemPills = audioPills.filter(p => p.id !== 'master');`.

### 🟡 M3: YouTube Signature Throttling Risk
- **Scope:** `YtDlpRunner.ts` (Lines 128–133)
- **Problem:** Removing `--js-runtimes node` prevents crashes when Node is missing from `PATH`, but leaves yt-dlp subject to YouTube n-sig speed throttling.
- **Architectural Fix:** Pass Electron's bundled Node binary path (`process.execPath`) when invoking yt-dlp, or document expected throttle limits.

### 🟡 M4 & M5: Spec Misdirection and Scale Hardcoding
- **Scope:** `v0.1.2_patch_spec.md` (Lines 12–14, 174–219)
- **Problem:** Spec directs implementers to static `defaultQualities` to patch instance method `executeDownload()`. Python script hardcodes 4x multiplier, crashing on 2x models.
- **Architectural Fix:** Correct method targets and make scale dynamic: `scale_factor = target_scale`.

---

## 4. Lazy Senior Dev (Ponytail) Recommendations

1. **Delete Dead-End Tiling:** Cutouts rarely need 4x neural super-resolution above 2048px. If asset is already high-resolution, skip Real-ESRGAN or clamp to direct inference. Avoid complex hand-rolled tiling engines inside Python `-c` strings.
2. **Reuse Existing FFmpeg Infrastructure:** `FfmpegRunner.ts` already has hardware-accelerated NVENC and libx264 encoding pipelines. Do not rely on yt-dlp's fragile remux flags to fulfill NLE Edit-Ready contracts. Use CreatorVault's internal FFmpeg worker when transcoding is required.
3. **Atomic File Replace:** Replace all direct binary file writes with write-to-temp + rename pattern.

---

## 5. Next Steps
1. Write this audit report to `D:\CreatorVault\docs\reviews\intermediate_zoom_out_report.md`.
2. Update `v0.1.2_patch_spec.md` to resolve Blockers B1–B4 and Majors M1–M5 before implementation.
