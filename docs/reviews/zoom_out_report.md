# EGM Zoom Out Audit: Social Compression Armor (`reel-optimizer`)

Target: [`social_compression_armor_spec.md`](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md)  
Standard: [`zoom-out-standard.md`](file:///C:/Users/HP/.gemini/config/plugins/egm/resources/document_standards/zoom-out-standard.md)  
Overall Verdict: **🟡 CONDITIONAL PASS**

---

### Audit Findings

#### 1. 🟡 Major — Architectural Process Boundary Violation in Mermaid Diagram
* **Affected Scope**: Section "Technical Plan (Architecture)", lines 72–102 (line 100).
* **Simplicity Rationale**: Mermaid diagram shows direct link:
  ```mermaid
  Sim -->|Pills & vmafComparison| QueueState
  ```
  `Sim` runs in Main process child process worker ([`FfmpegRunner.ts`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L782-L802)). `QueueState` lives in Renderer Zustand store ([`useJobStore.ts`](file:///D:/CreatorVault/src/store/useJobStore.ts#L374-L390)). With Electron `contextIsolation: true`, worker cannot touch Renderer state directly. 
* **Fix**: Route return path through [`ipcMain.handle('fixer:start')`](file:///D:/CreatorVault/electron/main.ts#L360-L380) and [`window.vortexApi.startFixerJob()`](file:///D:/CreatorVault/electron/preload.ts).

---

#### 2. 🟡 Major — YAGNI & Speculative Platform Selector (`reelPlatform`)
* **Affected Scope**: Section "Goals" (line 30), Section "Implementation Plan" (lines 161, 189, 199), [`media.ts`](file:///D:/CreatorVault/src/types/media.ts#L29-L36).
* **Simplicity Rationale**: Spec defines `platform: 'ig-reels' | 'tiktok' | 'yt-shorts'`. In [`FfmpegRunner.ts`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L611-L617), all three use identical encoding flags (1080×1920 Lanczos, `libx264` High 4.2 CRF 18, 12M maxrate, Rec.709, -14 LUFS). Only output filename prefix changes (`IG_Reel` vs `TikTok` vs `YT_Shorts`).
* **Fix**: Drop 3-way join UI button and store slice. Use single standard "Social 9:16 Vertical" preset. Keep custom filename tag optional or automatic.

---

#### 3. 🟡 Major — Premature Optimization & Vanity Metric Overhead: Simulation Pipeline
* **Affected Scope**: Section "Overview" (line 14), Section "Goals" (line 36), CUJ 2 & 3 (lines 56–67), lines 181–183.
* **Simplicity Rationale**: CreatorVault's core value is zero-terminal fast exports for NLE timelines. Upload simulation slices 5s, transcodes raw at 3.5Mbps, runs VMAF/SSIM filter passes, transcodes armored clip, and calculates delta. Stock FFmpeg lacks bundled `vmaf_v0.6.1.json` weights, forcing SSIM fallback or hardcoded heuristic score boosts (`expectedLift` bonus math in [`FfmpegRunner.ts`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L1420-L1428)).
* **Fix**: Demote simulation to optional secondary preview pill. Do not block primary deliverable. Remove synthetic vanity metric math.

---

#### 4. 🟡 Major — Inverted Hardware Acceleration Semantics ("NVENC Fallback")
* **Affected Scope**: Section "Goals" (line 33), Section "Alternatives Considered" (lines 127–132), Section "Implementation Plan" (line 178).
* **Simplicity Rationale**: Spec calls NVENC an "automatic hardware fallback" for `libx264`. In video architecture, software `libx264` is universal baseline/fallback. Hardware NVENC is optional speed acceleration. Calling NVENC a fallback confuses hardware toggle behavior in [`FixerModuleView.tsx`](file:///D:/CreatorVault/src/components/fixer/FixerModuleView.tsx#L78).
* **Fix**: Fix wording to "Hardware NVENC acceleration with software `libx264` master fallback".

---

#### 5. 🟡 Major — Global `JobItem` Type Bloat for Single Preset
* **Affected Scope**: Section "Implementation Plan" (lines 170–171, 192), [`media.ts`](file:///D:/CreatorVault/src/types/media.ts#L88-L89).
* **Simplicity Rationale**: Spec adds `vmafComparison` directly to top-level `JobItem`. Other 8 modules/presets (`demucs`, `deflicker`, `target-size`, `silence-xml`, `prores-proxy`, `vtracer`, `rmbg`, `esrgan`) store outputs in `StemOutputPill[]`. Adding preset-specific fields to global entity breaks uniformity.
* **Fix**: Deliver preview file via existing [`StemOutputPill`](file:///D:/CreatorVault/src/types/media.ts#L27) (`Simulated_IG_Constrained.mp4`). Put metric summary in `statusMessage`.

---

#### 6. 🟢 Nit — Altitude Drop into Raw FFmpeg Flags in High-Altitude Goals
* **Affected Scope**: Section "Goals" (lines 30, 33, 35, 36).
* **Simplicity Rationale**: Goals section lists multi-line FFmpeg CLI strings (`scale=w='trunc(min(1080,iw*1920/ih)/2)*2':...`). Raw command strings belong in Section "Detailed Implementation Plan". High-level goals must state architectural requirements.
* **Fix**: Replace CLI blobs in Section "Goals" with concise functional requirements.

---

### Architectural Strengths Noted
* **Root Problem Solved**: Lanczos even-dimension downscale, temporal denoising (`hqdn3d`), unsharp pre-emphasis, and Rec.709 color locking directly eliminate platform transcode quantization and color shifts.
* **Codebase Reuse**: Leverages existing [`FfmpegRunner`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts), [`useJobStore`](file:///D:/CreatorVault/src/store/useJobStore.ts) FIFO batch queue (`CB-1`), staged clear (`MJ-1`), and [`JobQueueList`](file:///D:/CreatorVault/src/components/ripper/JobQueueList.tsx) draggable NLE pill pipeline without reinventing wheels.

---
Skipped: did not run test renders or verify GPU driver NVENC encoding on live hardware.
Risk: if users run simulation on low-spec laptops, CPU-bound VMAF/SSIM filter calculation will double job execution time.
