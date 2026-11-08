# Comprehension Review: Social Compression Armor Spec

Review of [social_compression_armor_spec.md](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md).

## High-Level Objective Paraphrase
Document specifies pre-conditioning pipeline (`reel-optimizer`) in Video Fixer module for vertical social platforms. Target platforms aggressively re-encode uploads around 3.5 Mbps VBV limits, causing grain noise to consume bitrate and soften edges. Feature scales inputs to 1080×1920 with even padding, strips high-frequency grain with `hqdn3d`, sharpens contrast edges, tags Rec.709 color metadata, and normalizes audio to -14 LUFS. System renders intermediate H.264 master and simulates 5-second platform transcode to report quality retention lift.

## Execution Architecture Paraphrase
Renderer UI ([`FixerModuleView.tsx`](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L75)) captures user preset options and passes them to Zustand store ([`useJobStore.ts`](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L79)). Store pushes configuration across context-isolated IPC to Electron main process. Backend runner ([`FfmpegRunner.ts`](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L88)) builds FFmpeg filter graph with Lanczos scaling, temporal denoising, unsharp masking, and clamped CPU threads. Runner exports master file, extracts 5-second slice for constrained re-encode simulation, computes VMAF or SSIM score, and returns paths for draggable UI pills.

---

## Findings

### 🔴 Blocker: VMAF Reference Graph and Metric Calculation Undefined
* **Affected Scope**: [Lines 36, 54, 170, 181](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L36-L37)
* **Discrepancy Description & Rationale**: Document promises quality lift comparison (`Raw Upload: 76.4 -> Armored: 92.1 (+15.7 Lift)`) and type `vmafComparison: { rawScore, optimizedScore, simulatedPreviewPath }`. FFmpeg `libvmaf` requires identical resolution and frame alignment between reference and distorted streams. Spec never defines how `rawScore` is computed from unconditioned input (such as 4K landscape clip) against 1080×1920 simulation. Spec omits reference stream source, scaling normalization, and exact filter graph for both passes. Engineer cannot implement calculation without guessing pipeline architecture.

### 🟡 Major: Contradictory Preset Numbering (Preset 1 vs Preset 5)
* **Affected Scope**: [Line 75](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L75) (`Preset 1: Social Armor`) vs [Line 213](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L213) (`Module 2 Preset 5 ('reel-optimizer')`)
* **Discrepancy Description & Rationale**: Mermaid diagram names card `Preset 1: Social Armor`. Handover documentation plan calls it `Module 2 Preset 5`. Implementer cannot determine whether this replaces Preset 1 or appends as Preset 5.

### 🟡 Major: Platform Parameter Semantics Undefined
* **Affected Scope**: [Lines 161, 172-184](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L161)
* **Discrepancy Description & Rationale**: TypeScript contract exposes `platform: 'ig-reels' | 'tiktok' | 'yt-shorts'`. Pipeline logic, bitrates (3.5 Mbps), and simulation helper (`runIgCompressionSimulation`) only define Instagram Reels behavior. Spec never states if TikTok or YouTube Shorts change bitrates, scale parameters, or simulation profiles, or if backend treats them identically.

### 🟡 Major: Undefined SSIM Fallback Calibration Formula
* **Affected Scope**: [Lines 66, 118, 221](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L66)
* **Discrepancy Description & Rationale**: When `libvmaf` is missing, spec requires mapping raw SSIM (0.0–1.0) to 0–100 perceptual retention score. No formula or mapping table is provided. Linear scaling (`ssim * 100`) does not match perceptual HVS curves. Formula must be explicit.

### 🟢 Nit: Undefined Review Identifiers (`CB-1`, `MJ-1`)
* **Affected Scope**: [Lines 80, 106](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L80)
* **Discrepancy Description & Rationale**: Text references `(CB-1)` and `(MJ-1)` without definitions. These appear to be unscrubbed audit or ticket IDs from internal review notes.

### 🟢 Nit: Missing Frame Rate and Duration Probe Strategy for Dynamic Parameters
* **Affected Scope**: [Lines 33, 178, 180](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L33)
* **Discrepancy Description & Rationale**: Dynamic keyint (`Math.round(fps * 2)`) and audio loudnorm short-clip bypass (`<3s`) require input frame rate and duration. Spec does not specify whether runner inspects ffprobe metadata before execution or infers fps from UI options when `targetFps === 'keep'`.

### 🟢 Nit: UI Terminology Ambiguity ("Draggable Pill" / "NLE Pill")
* **Affected Scope**: [Lines 42, 54, 60, 76, 108](file:///D:/CreatorVault/docs/specs/social_compression_armor_spec.md#L42)
* **Discrepancy Description & Rationale**: Term "pill" commonly denotes visual badge. Here it represents Electron native drag-and-drop file proxy card (`webContents.startDrag`). Brief inline clarification prevents frontend confusion.

---

## Overall Verdict
**CONDITIONAL PASS** (Remediation Required for Blocker before build)
* High-level concept and single-pass FFmpeg arguments are clear.
* Dual-score VMAF comparison graph, platform variations, and SSIM mapping formula require explicit specification.
