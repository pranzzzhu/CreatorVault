# EGM Consolidated Review Report: Social Compression Armor (`reel-optimizer`)

**Target Document:** `D:\CreatorVault\docs\specs\social_compression_armor_spec.md`  
**Protocol:** Elephant-Goldfish Model (EGM) Full Flow  
**Date:** 2026-11-08  
**Overall Verdict:** 🔴 CONDITIONAL REJECT (4 Blockers, 7 Majors, 7 Nits Identified across 7 Review Personas)

---

## 1. Executive Summary

The **Social Compression Armor & IG Reel Optimizer** (`reel-optimizer`) provides a mathematically sound pre-conditioning pipeline (Lanczos scaling, `hqdn3d` temporal denoising, unsharp pre-emphasis, and Rec.709 color space tagging) that mitigates mobile platform re-compression degradation.

However, an independent multi-persona Goldfish audit spanning Stages 5 through 9 revealed 4 critical blockers:
1. **Chroma Subsampling Coordinates**: Scaling non-square aspect ratios (e.g. 16:9 $\rightarrow$ 9:16) produces odd vertical offsets (`(1920-606)/2 = 657`), causing fractional chroma coordinate mapping in YUV420p and triggering encoder crashes or color bleeding.
2. **Audio Track Absence Crash**: The FFmpeg pipeline injects `-af loudnorm` and `-c:a aac` unconditionally. On silent video inputs (camera B-roll, timelapses, drone clips), FFmpeg aborts with `no audio stream found`.
3. **Leaked Cancellation in `measureQualityScore`**: While `executeFixerJob` catches cancellations, inner `catch` blocks in `measureQualityScore` swallow cancellation errors, causing aborted simulation runs to register as completed jobs with synthetic fallback scores.
4. **Perceptual Metric Vanity Lab & Ground-Truth Asymmetry**: The dual-stream simulation compares smoothed video to itself while comparing raw video to noisy reference, producing artificially inflated metrics further exaggerated by hardcoded score offsets (`expectedLift`).

---

## 2. Consolidated Action Items by Priority

### 🔴 Blockers (Must Remediate Before Production)

*   **[B1] Enforce Even Pad Offsets for YUV420p Chroma Subsampling**:
    *   *Sources:* `egm-design` (Blocker 1), `egm-intermediate-zoom-out` (Blocker 1).
    *   *Problem:* While scaled video dimensions are truncated to even integers (`trunc(.../2)*2`), vertical pad centering `(oh-ih)/2` evaluates to odd integers on 16:9 inputs (`ih = 606`, offset = `657`). Under YUV420p 2×2 chroma subsampling, odd pixel offsets place chroma at fractional coordinates (`328.5`), violating container specs and causing aborts on strict decoders.
    *   *Required Fix:* Enforce even offsets in filter expression:
        `pad=1080:1920:'trunc((ow-iw)/4)*2':'trunc((oh-ih)/4)*2':black`.

*   **[B2] Guard Audio Normalization Against Silent Video Streams**:
    *   *Sources:* `egm-design` (Blocker 2).
    *   *Problem:* Unconditional injection of `-af loudnorm=... -c:a aac -b:a 320k` causes FFmpeg to exit with fatal error `no audio stream found` when processing B-roll, drone, or timelapse footage lacking audio tracks.
    *   *Required Fix:* Inspect audio stream presence before assembling audio arguments. If audio stream is absent, omit `-af loudnorm` and `-c:a aac` (pass `-an` or generate silent sync track if container requires audio).

*   **[B3] Re-Throw Job Cancellation in `measureQualityScore`**:
    *   *Sources:* `egm-codebase-details` (Blocker 1).
    *   *Problem:* `measureQualityScore` in `FfmpegRunner.ts` wraps VMAF/SSIM execution in bare `catch` blocks. If user clicks Abort during simulation, `runProcessAsync` rejects with cancellation, but `measureQualityScore` catches and swallows the error, returning `null`. The runner injects fallback scores (`76.4`, `92.1`) and marks the job as `completed` instead of `cancelled`.
    *   *Required Fix:* In `measureQualityScore`:
        ```typescript
        catch (err) {
          if ((err as Error).message?.toLowerCase().includes('cancel')) throw err;
          // Fall back to SSIM or null
        }
        ```

*   **[B4] Decouple Simulation from Primary Deliverable & Eliminate Synthetic Metric Offsets**:
    *   *Sources:* `egm-intermediate-zoom-out` (Blocker 2), `egm-design` (Major 1), `egm-comprehension` (Blocker 1).
    *   *Problem:* Dual-stream metric measurement compares compressed preview against smoothed intermediate master rather than original source, skewing metrics. Hardcoded `grainBonus + sharpenBonus` offsets inject synthetic "vanity lift" scores.
    *   *Required Fix:* Frame simulation as an optional visual preview deliverable (`Simulated_IG_Constrained.mp4`). If numerical metrics are reported, measure both distorted streams against the original reference, remove arbitrary score offset addition, or present simulation solely as a qualitative visual preview pill.

---

### 🟡 Majors (Architecture, Ergonomics & Quality)

*   **[M1] Fix Inverted Hardware Acceleration Hierarchy**:
    *   *Sources:* `egm-zoom-out` (Major 4), `egm-codebase-details` (Major 5), `egm-intermediate-zoom-out` (Major 6).
    *   *Problem:* Spec titles NVENC an "automatic hardware fallback" from `libx264`. Software `libx264` is universal baseline/fallback; NVENC is optional speed acceleration.
    *   *Required Fix:* Calibrate text to: "Master export defaults to software `libx264`; optional GPU acceleration is selectable via Hardware toggle (`h264_nvenc`)."

*   **[M2] Clarify Platform Selector Semantics**:
    *   *Sources:* `egm-zoom-out` (Major 2), `egm-comprehension` (Major 2), `egm-intermediate-zoom-out` (Major 4).
    *   *Problem:* `reelPlatform` exposes 3 platform options (`ig-reels`, `tiktok`, `yt-shorts`) that execute identical 1080×1920 CRF 18 encoding settings, differing only in output filename prefix.
    *   *Required Fix:* Clarify in spec that platform choices apply targeted metadata tags and naming prefixes, or collapse to single unified vertical preset if divergent profiles are not required.

*   **[M3] Enforce Constant Frame Rate (CFR) on `targetFps: 'keep'`**:
    *   *Sources:* `egm-design` (Major 3).
    *   *Problem:* Problem statement promises elimination of VFR stutter, but filter chain injects `fps` filter only when 30 or 60 is selected. Setting `targetFps: 'keep'` leaves mobile VFR streams untouched.
    *   *Required Fix:* Force CFR container timing on `'keep'` using `-fps_mode cfr` (or `-vsync cfr`) or probe input FPS and set `fps=${probedFps}`.

*   **[M4] Restrict Rec.709 Color Lock to SDR Inputs in Non-Goals**:
    *   *Sources:* `egm-design` (Major 2), `egm-intermediate-zoom-out` (Major 3).
    *   *Problem:* Injecting `-colorspace bt709 -color_primaries bt709 -color_trc bt709` tags metadata without tone-mapping HDR transfer curves, causing blown-out contrast on 10-bit HLG/PQ footage.
    *   *Required Fix:* Explicitly scope Rec.709 lock to SDR inputs in Non-Goals; note that HDR tone-mapping is NLE domain.

*   **[M5] Structure Implementation Plan into Incremental Phases with Test Checkpoints**:
    *   *Sources:* `egm-implementation-readiness` (Major 1, Major 3).
    *   *Problem:* Plan is a flat file list lacking progressive phases and automated verification assertions.
    *   *Required Fix:* Partition Detailed Implementation Plan into Phases 1–4 with automated verification checkpoints.

*   **[M6] Document State Defaults and Zero-Decision Contracts**:
    *   *Sources:* `egm-implementation-readiness` (Blocker 1), `egm-codebase-details` (Blocker 2).
    *   *Problem:* Plan specifies "explicit defaults" without documenting default values, and omits exact NVENC CLI arrays.
    *   *Required Fix:* Provide verbatim initial state values and exact NVENC argument arrays in Section 4.

*   **[M7] Correct Mermaid IPC Architecture Boundary**:
    *   *Sources:* `egm-zoom-out` (Major 1), `egm-intermediate-zoom-out` (Nit 7).
    *   *Problem:* Diagram shows `Sim` worker returning directly to Renderer `QueueState`, violating Electron context isolation.
    *   *Required Fix:* Route return path through `IpcHandler` and `VortexApi`.

---

### 🟢 Nits (Clarity, Style & Hygiene)

*   **[N1] Calibrate Style and Tone**:
    *   *Sources:* `egm-style` (Findings 1, 2, 3), `egm-structural` (Finding 1).
    *   *Fix:* Remove first-person voice ("We probe..."), personification ("Social armor prioritizes..."), and consumer branding ("Sony A7IV", "Netflix VMAF"). Replace "macroblock banding" with "macroblocking and gradient banding".
*   **[N2] Sanitize Combat Metaphor in `HANDOVER.md`**:
    *   *Sources:* `egm-codebase-details` (Nit 2).
    *   *Fix:* Replace "hostile platform upload simulator" with "constrained platform upload simulator" in `HANDOVER.md#L48`.
*   **[N3] Escape Comparison Operators in Markdown**:
    *   *Sources:* `egm-structural` (Finding 3).
    *   *Fix:* Wrap `(<3s)` in code span `(< 3s)` to prevent XML/MDX parser warnings.
*   **[N4] Scrub Internal Review Shorthand**:
    *   *Sources:* `egm-comprehension` (Nit 1), `egm-intermediate-zoom-out` (Nit 8).
    *   *Fix:* Replace `(CB-1)` and `(MJ-1)` with explicit descriptive statements (sequential FIFO queue, immediate staging clear).
*   **[N5] Drain Stdout on Legacy Methods**:
    *   *Sources:* `egm-codebase-details` (Nit 1).
    *   *Fix:* Add `proc.stdout?.resume()` to `extractOrNormalizeWav` and `detectSpeechSegments` in `FfmpegRunner.ts`.
*   **[N6] Unify List Indentation**:
    *   *Sources:* `egm-structural` (Finding 4).
    *   *Fix:* Standardize numbered lists to single-space indentation (`1. `).
*   **[N7] Add Cancellation Edge to Mermaid Diagram**:
    *   *Sources:* `egm-design` (Nit 3).
    *   *Fix:* Illustrate user abort event path from Queue UI to Engine child process.

---

## 3. Traceability Matrix

| Raw Finding ID | Reviewer Persona | Review Stage | Consolidated Action Item | Priority |
| :--- | :--- | :--- | :--- | :--- |
| `Design B-1` | `egm-design` | Stage 7 (Critic) | **[B1]** YUV420p Even Pad Offsets | 🔴 Blocker |
| `Int Zoom B-1` | `egm-intermediate-zoom-out` | Stage 8 (Int Zoom) | **[B1]** YUV420p Even Pad Offsets | 🔴 Blocker |
| `Design B-2` | `egm-design` | Stage 7 (Critic) | **[B2]** Silent Video Audio Crash | 🔴 Blocker |
| `Codebase B-1` | `egm-codebase-details` | Stage 9 (Readiness) | **[B3]** Swallowed Cancellation in `measureQualityScore` | 🔴 Blocker |
| `Comprehension B-1` | `egm-comprehension` | Stage 6 (Comprehension) | **[B4]** Simulation Decoupling & Ground Truth | 🔴 Blocker |
| `Int Zoom B-2` | `egm-intermediate-zoom-out` | Stage 8 (Int Zoom) | **[B4]** Simulation Decoupling & Ground Truth | 🔴 Blocker |
| `Design M-1` | `egm-design` | Stage 7 (Critic) | **[B4]** Simulation Decoupling & Ground Truth | 🔴 Blocker |
| `Zoom Out M-4` | `egm-zoom-out` | Stage 5 (Zoom Out) | **[M1]** Inverted Hardware Hierarchy | 🟡 Major |
| `Codebase M-5` | `egm-codebase-details` | Stage 9 (Readiness) | **[M1]** Inverted Hardware Hierarchy | 🟡 Major |
| `Zoom Out M-2` | `egm-zoom-out` | Stage 5 (Zoom Out) | **[M2]** Clarify Platform Selector Semantics | 🟡 Major |
| `Comprehension M-2` | `egm-comprehension` | Stage 6 (Comprehension) | **[M2]** Clarify Platform Selector Semantics | 🟡 Major |
| `Design M-3` | `egm-design` | Stage 7 (Critic) | **[M3]** Enforce CFR on Keep FPS | 🟡 Major |
| `Design M-2` | `egm-design` | Stage 7 (Critic) | **[M4]** Restrict Rec.709 to SDR in Non-Goals | 🟡 Major |
| `Int Zoom M-3` | `egm-intermediate-zoom-out` | Stage 8 (Int Zoom) | **[M4]** Restrict Rec.709 to SDR in Non-Goals | 🟡 Major |
| `Readiness M-1` | `egm-implementation-readiness` | Stage 9 (Readiness) | **[M5]** Incremental Phasing & Test Spec | 🟡 Major |
| `Readiness B-1` | `egm-implementation-readiness` | Stage 9 (Readiness) | **[M6]** Document State Defaults & CLI Arrays | 🟡 Major |
| `Codebase B-2` | `egm-codebase-details` | Stage 9 (Readiness) | **[M6]** Document State Defaults & CLI Arrays | 🟡 Major |
| `Zoom Out M-1` | `egm-zoom-out` | Stage 5 (Zoom Out) | **[M7]** Mermaid IPC Architecture Boundary | 🟡 Major |
| `Style M-1..3` | `egm-style` | Stage 7 (Critic) | **[N1]** Style & Tone Calibration | 🟢 Nit |
| `Codebase N-2` | `egm-codebase-details` | Stage 9 (Readiness) | **[N2]** Sanitize Metaphor in `HANDOVER.md` | 🟢 Nit |
| `Structural N-3` | `egm-structural` | Stage 7 (Critic) | **[N3]** Escape `<` in Markdown | 🟢 Nit |
| `Comprehension N-1` | `egm-comprehension` | Stage 6 (Comprehension) | **[N4]** Scrub Internal Audit Shorthand | 🟢 Nit |
| `Codebase N-1` | `egm-codebase-details` | Stage 9 (Readiness) | **[N5]** Drain Stdout on Legacy Methods | 🟢 Nit |
| `Structural N-4` | `egm-structural` | Stage 7 (Critic) | **[N6]** Unify List Indentation | 🟢 Nit |
| `Design N-3` | `egm-design` | Stage 7 (Critic) | **[N7]** Add Cancellation Edge to Mermaid | 🟢 Nit |

---

*Report compiled via Elephant-Goldfish Model (EGM) Full Flow.*
