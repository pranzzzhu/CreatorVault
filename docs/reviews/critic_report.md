# EGM Stage 7: Hostile Critic Review & Style Audit Report

**Target Document:** `D:\CreatorVault\docs\specs\v0.1.2_patch_spec.md`  
**Reviewers:** `egm-design` (Hostile Design Critic) & `egm-style` (Technical Copy Editor)  
**Date:** 2026-11-10  
**Audit Verdict:** 🔴 CONDITIONAL REJECT (4 Blockers, 5 Majors, 4 Nits Identified)

---

## Executive Summary

The v0.1.2 patch specification addresses 6 critical launch blockers from v0.1.1, but suffers from fatal codec misunderstandings, tiling border seam corruption in neural upscaling, process lifecycle race conditions, and unbuffered/non-atomic file I/O. 

Most critically:
1. **Fix 1 (`--remux-video mp4`) fails the NLE "Edit-Ready" promise:** Remuxing copies existing VP9/AV1 bitstreams without transcoding. Putting VP9/AV1 into an MP4 container causes Premiere Pro and DaVinci Resolve Free on Windows to fail import or crash, while the UI badge (`H.264 / MP4`) falsely claims H.264.
2. **Fix 5 (Real-ESRGAN upscaler) produces hard grid seams & alpha halos:** The sliding tile loop overwrites overlapping slices without linear feathering or cosine blending, resulting in visible grid line artifacts on every cutout >640×640. Allocating the full 4× canvas on the GPU device risks CUDA OOM on 4GB/6GB cards, and Lanczos alpha upscaling does not match GAN-hallucinated RGB contours.
3. **Fix 4 (`BinaryManager.installBinary`) lacks atomic writes and buffering:** Downloading the 60MB binary directly into `yt-dlp.exe` via `res.arrayBuffer()` and synchronous `fs.writeFileSync()` locks the Electron thread and crashes with `EBUSY` if another process holds the binary handle.
4. **Fix 6B titlebar code snippet is non-functional in the spec:** The specification replacement code merely re-inserts the identical hardcoded dark colors (`color: '#050505'`), relegating the actual IPC implementation to an unwritten parenthetical note.

---

## Detailed Findings

### 🔴 Blockers

#### 1. [B1] YouTube 4K Remuxing Does Not Transcode VP9/AV1 (Broken Edit-Ready Guarantee)
- **Sources:** `egm-design` (Item 1), `egm-style` (Item 4)
- **Problem:**
  - YouTube serves 1440p and 4K video exclusively in VP9 (`vp09`) or AV1 (`av01`), paired with Opus audio.
  - `--remux-video mp4` instructs FFmpeg to copy bitstreams (`-c copy`) into an MP4 container. It **does not transcode**.
  - Premiere Pro (Windows) and DaVinci Resolve Free (Windows) reject or fail to decode VP9/AV1 inside MP4 containers.
  - The UI badge in `defaultQualities` displays `'H.264 / MP4'`, misleading editors.
- **Remediation:**
  - For Edit-Ready 4K/1440p downloads, invoke FFmpeg transcoding (`-c:v h264_nvenc` or `libx264`, `-c:a aac -b:a 320k`) after download or via `--recode-video mp4`.
  - In Raw mode, keep source MKV/WebM intact and label the UI badge accurately as `'VP9 / MKV'`.

#### 2. [B2] Real-ESRGAN Tile Seams, VRAM Over-Allocation & Edge Halos
- **Sources:** `egm-design` (Item 5), `egm-zoom-out` (F-01)
- **Problem:**
  - The tiling loop steps by `tile - overlap` (stride = 368), but assigns the unweighted 384×384 output tile directly:
    `sr[:, :, y0*4:y1*4, x0*4:x1*4] = sr_patch`
    Boundary convolution artifacts clobber previous tiles, creating visible square grid seams across all images >640×640.
  - Allocating `sr = torch.zeros((1, 3, out_h, out_w), device=device)` creates the entire upscaled canvas in GPU VRAM. For high-resolution assets, this tensor triggers `torch.cuda.OutOfMemoryError` on 4GB/6GB consumer GPUs.
  - Dilating RGB with neural upscaling while resizing the alpha mask with linear Lanczos creates a 2–5 pixel boundary mismatch, causing noticeable edge fringing/halos around transparent cutouts.
- **Remediation:**
  - Implement linear feathering across tile overlap margins before accumulation.
  - Allocate the full `sr` canvas in CPU RAM (`device='cpu'`), streaming only 384×384 patches through GPU VRAM.
  - Match alpha silhouette edges to neural boundaries using guided filtering or bilateral smoothing.

#### 3. [B3] Non-Atomic, Unbuffered Binary Download & File Lock Crashes
- **Sources:** `egm-design` (Item 4), `egm-style` (Item 3), `egm-zoom-out` (F-03)
- **Problem:**
  - Direct synchronous write to `path.join(this.binDir, 'yt-dlp.exe')` while an existing process holds the handle causes fatal Windows `EBUSY`/`EPERM` errors, corrupting the executable.
  - Loading the entire executable into memory with `res.arrayBuffer()` consumes 60MB in V8 heap, and `fs.writeFileSync()` blocks the main Electron thread.
  - Lacks download timeout or abort handling; network stalls hang the installer indefinitely.
- **Remediation:**
  - Stream the binary to a temporary file (`yt-dlp.exe.tmp`) using `stream.pipeline` with an explicit `AbortSignal.timeout(60000)`.
  - Atomically replace the target binary via `fs.renameSync` after verifying size and integrity.

#### 4. [B4] Fix 6B Replacement Code Incomplete in Specification
- **Sources:** `egm-style` (Item 1), `egm-comprehension` (Item 1)
- **Problem:**
  - Fix 6B replacement code block in `v0.1.2_patch_spec.md` hardcodes `color: '#050505'`, identical to existing code.
  - The dynamic theme IPC handler was omitted from the specification and left as an informal parenthetical remark.
- **Remediation:**
  - Provide complete, concrete IPC listener implementation in `main.ts`, `preload.ts`, and `useJobStore.ts`.

---

### 🟡 Majors

#### 5. [M1] Overly Broad Cookie Error Matching & Silent Retry Loop
- **Sources:** `egm-design` (Item 2), `egm-comprehension` (Item 3)
- **Problem:**
  - `fullErr.includes('Permission denied')` matches any OS file write or access error (e.g. read-only disk, antivirus scan). A failed 2GB download will trigger an unwarranted anonymous retry, re-downloading the entire video before failing again.
  - `config.browserCookies = 'none'` mutates caller configuration in place.
- **Remediation:**
  - Restrict error regex to cookie database locks: `/(cookie.*locked|cannot access.*cookie|Could not copy Chrome cookie)/i`.
  - Pass a cloned config object (`{ ...config, browserCookies: 'none' }`).

#### 6. [M2] Audio Stems Summed with Full Master Track in Playback
- **Sources:** `egm-design` (Item 6)
- **Problem:**
  - In `JobQueueList.tsx`, `audioPills` includes both isolated stems (`Vocals.wav`, `Bass.wav`) and the full master rip (`Full_Audio.wav`).
  - `togglePlayAll` plays all tracks simultaneously, summing the master rip on top of the stems (+6dB clipping and comb filtering).
- **Remediation:**
  - Exclude master audio pills from multi-stem playback:
    `const stemPills = audioPills.filter(p => p.id !== 'master');`

#### 7. [M3] YouTube Signature Throttling Risk without JS Runtime
- **Sources:** `egm-design` (Item 3)
- **Problem:**
  - Removing `--js-runtimes node` prevents crashes on systems without Node in `PATH`, but leaves yt-dlp vulnerable to YouTube n-sig/n-token challenges, risking download speed throttles (30–50 KB/s).
- **Remediation:**
  - Pass the absolute path to Electron's bundled Node binary (`process.execPath`) when executing yt-dlp, or bundle a lightweight standalone JS engine in `./bin`.

#### 8. [M4] Ambiguous Hook Placement in `JobQueueList.tsx`
- **Sources:** `egm-style` (Item 7), `egm-comprehension` (Item 7)
- **Problem:**
  - The single-line guard replacement `if (audioPills.length <= 1) return null;` lacked location context; placing it before React hooks violates the Rules of Hooks.
- **Remediation:**
  - Ensure guard is placed strictly after all hook declarations (`useState`, `useEffect`, `useRef`).

#### 9. [M5] Spec Conflates Remuxing with Transcoding
- **Sources:** `egm-style` (Item 4), `egm-zoom-out` (F-02)
- **Problem:**
  - Text claims `--remux-video mp4` "remuxes/transcodes to H.264". Remuxing only changes containers; it never transcodes codecs.
- **Remediation:**
  - Correct specification language to distinguish container remuxing from video transcoding.

---

### 🟢 Nits

#### 10. [N1] Hardcoded Developer Drive Paths
- **Sources:** `egm-zoom-out` (F-07)
- **Problem:** `D:\CreatorVault\bin\models` is hardcoded as fallback in `BinaryManager.ts` and `VectorRunner.ts`.
- **Remediation:** Use paths relative to `app.getPath('userData')` or `process.resourcesPath`.

#### 11. [N2] Typo in Specification (`rmbg`)
- **Sources:** `egm-style` (Item 10)
- **Problem:** Spec references `rmbg` instead of `rembg`.
- **Remediation:** Correct typo in specification.

#### 12. [N3] Titlebar Cold-Start Dark Flash
- **Sources:** `egm-design` (Item 6), `egm-zoom-out` (F-06)
- **Problem:** Window initializes with `#050505` until renderer dispatches theme IPC after DOM mount.
- **Remediation:** Sync theme state prior to `createWindow()`.

#### 13. [N4] Spec Target Directive Contradiction in Fix 1
- **Sources:** `egm-style` (Item 5), `egm-comprehension` (Item 2)
- **Problem:** Spec directed reader to `defaultQualities` to patch `executeDownload()`.
- **Remediation:** Update directive to refer directly to `executeDownload()`.
