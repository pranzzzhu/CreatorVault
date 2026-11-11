# VORTEX (CreatorVault) v0.1.2 — Zoom Out Architectural Audit Report

**Auditor:** Skeptical Architect (EGM Zoom-Out Goldfish)  
**Target:** `docs/specs/v0.1.2_patch_spec.md`  
**Focus:** Simplicity, YAGNI, Cross-Platform Robustness, Concurrency, Failure Modes

---

## Executive Summary

The patch specification delivers targeted bug fixes for 6 launch blockers, but suffers from **implementation weed-traps**, **broken codec assumptions**, and **GPU tile boundary bugs**. Most critically:
1. **Fix 1 (`--remux-video mp4`) does not transcode VP9/AV1.** It places raw VP9/AV1 inside an MP4 container, breaking the NLE "Edit-Ready" promise in Premiere Pro and DaVinci Resolve.
2. **Fix 5 (Real-ESRGAN)** introduces hard grid boundary seams on all images >640x640 due to unfeathered tile assignment, creates alpha halo fringing by mixing neural RGB with Lanczos alpha, and risks GPU VRAM OOM by allocating 4x canvases on device.
3. **Fix 4 (BinaryManager)** downloads 60MB binaries unbuffered into RAM, uses blocking synchronous writes, lacks atomic file replacement, and breaks on macOS Gatekeeper quarantine.

---

## Findings Matrix

| ID | Scope | Severity | Category | Description |
|---|---|---|---|---|
| **F-01** | Fix 5 (VectorRunner.ts) | 🔴 Blocker | Algorithm / Visual Defect | Real-ESRGAN unfeathered tile seams & Lanczos alpha fringe halos |
| **F-02** | Fix 1 (YtDlpRunner.ts) | 🔴 Blocker | Architectural Contract | `--remux-video mp4` fails to transcode VP9/AV1, breaking Edit-Ready NLE pledge |
| **F-03** | Fix 4 (BinaryManager.ts) | 🟡 Major | Robustness & OS Deadlock | In-memory 60MB buffer, synchronous write, Windows EBUSY locking, missing macOS Gatekeeper de-quarantine |
| **F-04** | Fix 2 (YtDlpRunner.ts) | 🟡 Major | Fault Recovery / State Mutation | Caller config mutation; silent fallback masks authentication failures as private-video errors |
| **F-05** | Entire Spec | 🟡 Major | Specification Altitude | Drops directly into raw code diffs without architectural contracts, limits, or verification specs |
| **F-06** | Fix 6B (main.ts / store) | 🟢 Nit | Cross-Platform / Lifecycle | Windows-only API call; titlebar theme desync on cold boot |
| **F-07** | BinaryManager / VectorRunner | 🟢 Nit | Codebase Hygiene | Hardcoded Windows developer drive paths (`D:\CreatorVault\...`) |

---

## Detailed Findings

### 🔴 Finding F-01: Real-ESRGAN Tile Boundary Seams, Alpha Halos & VRAM Hazard
- **Affected Scope:** `docs/specs/v0.1.2_patch_spec.md` (Lines 164–220), `electron/services/VectorRunner.ts` (Lines 581–604)
- **Simplicity & Architectural Rationale:**
  1. **Tile Overlap Seam Bug:** The tiling loop uses `tile = 384, overlap = 16`, stepping `x` and `y` by `368`. Line 207 executes a direct slice replacement:
     ```python
     sr[:, :, y0*4:y1*4, x0*4:x1*4] = sr_patch
     ```
     Real-ESRGAN convolutions have edge boundary padding effects. Directly overwriting overlap zones without linear feathering or cosine-window blending creates visible square grid seams across every upscaled image larger than 640x640.
  2. **Alpha Edge Haloing:** RGB is upscaled via deep super-resolution (sharp, hallucinated edges), while alpha is upscaled using basic mathematical Lanczos (`upscaled_alpha = a_img.resize((w * 4, h * 4), Image.Resampling.LANCZOS)`). The blurry Lanczos alpha boundary does not match the GAN-synthesized silhouette, causing noticeable background color bleed and halo fringes around cutouts.
  3. **VRAM OOM Hazard:** Line 198 allocates `sr = torch.zeros((1, 3, out_h, out_w), device=device)`. For a 12MP photo (4000x3000), the 4x canvas is 16000x12000 (192 megapixels). In FP32 on CUDA, this tensor alone demands 2.3 GB of contiguous GPU VRAM, risking instant `CUDA out of memory` during tile stitching.
- **Architectural Remedy:**
  - Allocate the full `sr` canvas on CPU RAM (`device='cpu'`), transferring only 384x384 patches to the GPU device.
  - Implement linear feathering in overlap margins, or process images on CPU/GPU without tiling when VRAM permits.
  - Threshold the alpha channel or apply guided filter edge-alignment to prevent halos.

---

### 🔴 Finding F-02: Broken Edit-Ready Guarantee (`--remux-video` Never Transcodes VP9/AV1)
- **Affected Scope:** `docs/specs/v0.1.2_patch_spec.md` (Lines 7–56), `electron/services/YtDlpRunner.ts` (Lines 325–332)
- **Simplicity & Architectural Rationale:**
  - The spec states: *"For 4K/1440p, allow WebM/MKV bestvideo streams and let ffmpeg remux/transcode to H.264 MP4"*.
  - `yt-dlp`'s `--remux-video mp4` only remuxes (copies the existing bitstream via FFmpeg `-c copy`). It **does not transcode**.
  - YouTube provides 1440p and 4K almost exclusively in VP9 or AV1 codecs. Remuxing VP9/AV1 into an `.mp4` container outputs a stream that Premiere Pro, DaVinci Resolve, and QuickTime Player on Windows/macOS cannot natively decode or import without third-party extensions.
  - This violates the core design pledge of "Edit-Ready Safe Mode" (zero-transcode instant timeline drop).
- **Architectural Remedy:**
  - In Edit-Ready mode at $\ge 1440$p, use `--recode-video mp4` (which forces FFmpeg H.264/AAC re-encoding), or pipe through CreatorVault's internal FFmpeg worker for ProRes/H.264 master creation.
  - If retaining native VP9/AV1, surface an explicit UI pill warning that the clip requires AV1/VP9 hardware support in the NLE.

---

### 🟡 Finding F-03: Sidecar Installer Memory Hog & Windows Lock Crash
- **Affected Scope:** `docs/specs/v0.1.2_patch_spec.md` (Lines 136–162), `electron/services/BinaryManager.ts` (Lines 439–452)
- **Simplicity & Architectural Rationale:**
  - **Memory Buffering & Event Loop Blocking:** Line 155 does `Buffer.from(await res.arrayBuffer())` followed by `fs.writeFileSync(targetPath, buffer)`. Buffering a 60MB `.exe` in Node heap and synchronously writing it locks the Electron UI thread.
  - **Windows EBUSY File Lock:** If updating or replacing an existing `yt-dlp.exe` while another probe or process holds a handle, `fs.writeFileSync` throws an unhandled `EBUSY` exception.
  - **macOS Gatekeeper Quarantine:** Unsigned binaries pulled from GitHub on macOS are flagged with `com.apple.quarantine`. Executing them triggers OS security blocks unless `xattr -d com.apple.quarantine` is invoked.
- **Architectural Remedy:**
  - Stream the response directly to disk (`stream.pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tempPath))`).
  - Write to a `.tmp` file and perform an atomic `fs.renameSync`.
  - On macOS, execute `chmod +x` and clear quarantine attributes.

---

### 🟡 Finding F-04: In-Place Config Mutation & Silent Auth Downgrade
- **Affected Scope:** `docs/specs/v0.1.2_patch_spec.md` (Lines 60–115), `electron/services/YtDlpRunner.ts` (Lines 485–496)
- **Simplicity & Architectural Rationale:**
  - `config.browserCookies = 'none'` mutates the caller's configuration object by reference.
  - Silent anonymous retry masks authentication errors. When a user intentionally provides cookies to download subscriber-only, private, or age-gated media, a database lock silently disables auth and retries. The user then sees a misleading "Video is private" or "Login required" error rather than "Close your browser to unlock cookie database".
- **Architectural Remedy:**
  - Create a shallow clone for retry: `const retryConfig = { ...config, browserCookies: 'none' }`.
  - Provide an explicit notification/progress event indicating that cookie access was blocked and anonymous fallback is being attempted.

---

### 🟡 Finding F-05: Specification Altitude Drop (Weeds)
- **Affected Scope:** `docs/specs/v0.1.2_patch_spec.md` (Entire file)
- **Simplicity & Architectural Rationale:**
  - The document acts as an ad-hoc code patch rather than an architectural specification. It specifies raw replacement strings and loop variables while missing interface definitions, cross-platform requirements, failure boundaries, and testing acceptance criteria.
- **Architectural Remedy:**
  - Document high-level invariants, data flows, and failure modes rather than embedding raw source code lines.

---

### 🟢 Finding F-06: Windows-Coupled Theme IPC & Cold Boot Desync
- **Affected Scope:** `electron/main.ts` (Lines 210–222), `src/store/useJobStore.ts` (Lines 197–203)
- **Simplicity & Architectural Rationale:**
  - `setTitleBarOverlay` is Windows-only. Calling it on macOS/Linux does nothing.
  - On cold launch, `createWindow()` hardcodes `#050505`. If the user saved a light theme, the window controls remain dark until the renderer bundle finishes loading and executes IPC.
- **Architectural Remedy:**
  - Read persisted theme settings before `createWindow()` or let the titlebar remain adaptive.

---

### 🟢 Finding F-07: Hardcoded Developer Machine Paths
- **Affected Scope:** `electron/services/BinaryManager.ts` (Line 304), `electron/services/VectorRunner.ts` (Line 549)
- **Simplicity & Architectural Rationale:**
  - Code references `D:\CreatorVault\bin\models\RealESRGAN_x4plus.pth`.
  - Breaks portability across standard client environments (C: drive, macOS `/Applications`, Linux).
- **Architectural Remedy:**
  - Resolve model paths strictly relative to `app.getPath('userData')` or `process.resourcesPath`.
