# Stage 8: Intermediate Zoom Out Review Report
**Module 4: Universal Format Converter (`converter`)**
**Target Document:** [`converter_module_spec.md`](file:///D:/CreatorVault/docs/specs/converter_module_spec.md)
**Synthesized Reviews:** Stage 5 (Zoom Out), Stage 6 (Comprehension), Stage 7 (Design + Style Critic)

---

## 1. Executive Synthesis & Triage Summary

Stage 8 synthesizes 25 raw findings across Stages 5, 6, and 7.
Architecture delivers solid 4-way media conversion matrix.
Core engine aligns with Electron sidecar pattern and native OS drag-to-timeline pills.

Review identifies 5 critical process crashes, 4 lifecycle bugs, and 4 over-engineered distractions.
False alarms filtered: HDR tonemapping pipelines, dynamic surround sound matrixing, and global type renames.
True risks validated: Audio-to-GIF crashes, silent video failures, slate video truncation, uncapped GIF RAM exhaustion, and concurrent batch race conditions.

---

## 2. False Alarms & Scope Creep Filter (Dismissed or Demoted)

| Purported Issue | Source | Triage Decision | Rationale |
|---|---|---|---|
| **10-bit HDR / Wide Gamut Tonemapping** | Stage 7 Critic (Major 6) | **DISMISSED** (Scope Creep) | Converter is lightweight format utility, not color grading suite. Injecting `zscale`/lut filters adds massive CPU overhead, unstable FFmpeg dependencies, and transcode failures. Standard `-pix_fmt yuv420p` suffices. |
| **Dynamic Multi-Channel Audio Matrixing (5.1/7.1)** | Stage 7 Critic (Major 4, Blocker 2) | **DISMISSED** (Over-engineering) | Downmixing to stereo (`-ac 2`) is standard creator invariant for MP3/AAC/Web exports. Dynamic 5.1/7.1 layout matrixing is speculative flexibility nobody asked for. Document `-ac 2` invariant in spec; keep code minimal. |
| **Global `StemOutputPill` Refactor** | Stage 6 (Finding 3), Stage 7 (Major 1) | **DEMOTED to NIT** | Renaming across all modules creates churn across callers. UI already treats `StemOutputPill` as generic draggable pill. Resolve via documentation and type alias `export type OutputPill = StemOutputPill` in [`media.ts`](file:///D:/CreatorVault/src/types/media.ts). |
| **Missing Binary Simulation Mode** | Stage 6 (Finding 6) | **DISMISSED** (False Alarm) | Video transcode and remuxing require actual media containers. Simulation mode produces dummy files that break NLE drag-and-drop. Missing FFmpeg binary must fail fast. |

---

## 3. Validated Architectural Risks & Root-Cause Analysis

### 🔴 VR-01: Audio → GIF Pipeline Routing Crash
- **Location:** [`FfmpegRunner.ts:605-644`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L605-L644), [`ConverterModuleView.tsx:252-268`](file:///D:/CreatorVault/src/components/converter/ConverterModuleView.tsx#L252-L268)
- **Root Cause:** Staging audio with `.gif` target satisfies `sourceIsAudio && !targetIsAudio`. Case 4 synthesizes video via `h264_nvenc`/`libx264` and `aac` audio into `.gif`. FFmpeg rejects H.264/AAC in GIF container and crashes instantly.
- **Minimal Fix:**
  1. In [`ConverterModuleView.tsx`](file:///D:/CreatorVault/src/components/converter/ConverterModuleView.tsx): Disable `.GIF` target button when staged items contain audio (`hasStagedAudio`).
  2. In [`FfmpegRunner.ts`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts): Throw error if `sourceIsAudio && targetExt === 'gif'`.

### 🔴 VR-02: Silent Video Crashes Audio Extraction & Video Transcoding
- **Location:** [`FfmpegRunner.ts:382, 538-556, 778-808`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L382)
- **Root Cause:**
  1. `probeLocalMedia` defaults `audioCodec` to `'aac'` even when no audio stream exists.
  2. Video → Audio runs `-vn ... -c:a ...`. Without audio track, FFmpeg fails: `Output file does not contain any stream`.
  3. Video → Video transcode attaches `-af loudnorm=...` and `-c:a aac`. Without audio track, filtergraph crashes.
- **Minimal Fix:**
  1. In `probeLocalMedia`: Set `audioCodec = 'none'` and `sampleRate = 0` when `!aStream`.
  2. In `executeConverterJob`: If `!hasAudioStream(config.inputPath)`:
     - For `targetIsAudio`: Throw error `Input video has no audio track to extract`.
     - For video transcode: Omit `aEncoderArgs` and pass `-an`.

### 🔴 VR-03: Studio Slate Synthetic Video Truncates Audio
- **Location:** [`FfmpegRunner.ts:651-664`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L651-L664)
- **Root Cause:** Color video filter sets `:d=${safeDur}`. For VBR audio or duration fallback (15s/30s), synthetic video terminates prematurely. `-shortest` cuts off audio stream at `safeDur`, losing remaining audio.
- **Minimal Fix:** Remove `:d=${safeDur}` from `lavfi color` filter: `color=c=0x09090B:s=1280x720:r=30`. `-shortest` naturally ends video when audio ends.

### 🔴 VR-04: Uncapped GIF Conversion Triggers Memory & Process Exhaustion
- **Location:** [`FfmpegRunner.ts:573-603`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L573-L603)
- **Root Cause:** 2-pass palette generation runs over entire video without length cap. Converting 5+ minute video renders thousands of frames, consuming gigabytes of RAM/disk and hanging UI.
- **Minimal Fix:** Clamp GIF duration to maximum 30 seconds (`-t 30`) and show UI duration badge.

### 🔴 VR-05: Unbounded Concurrent Batch Execution & Broken Cancellation Loop
- **Location:** [`useJobStore.ts:643-742`](file:///D:/CreatorVault/src/store/useJobStore.ts#L643-L742)
- **Root Cause:**
  1. `enqueueAndRunConverterJobs` lacks re-entrancy lock. Re-triggering creates concurrent loops that saturate GPU NVENC limits (3–5 sessions max).
  2. Aborting job via `cancelJob(jobId)` throws, but `catch` block continues to next file in loop instead of halting batch.
- **Minimal Fix:**
  1. Add `isConvertingBatch: boolean` lock to store. Disable Convert button while active.
  2. In `catch` block: If `isCancelled`, `break;` out of loop.

### 🟡 VR-06: Smart Copy Remux Exclusions & Missing Transcode Fallback
- **Location:** [`FfmpegRunner.ts:696-748`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L696-L748)
- **Root Cause:** MOV remux disallows `pcm_s16le`/`pcm_s24le` audio and `prores` video. Subtitle or data streams trigger remux failures. Code lacks automatic fallback to transcode on remux failure.
- **Minimal Fix:**
  1. Include `prores` in `vOk` and PCM codecs in `aOk` for MOV.
  2. Add `-map 0:v:0 -map 0:a? -sn -dn` for remux safety.
  3. Wrap remux in try/catch; if remux fails, log warning and run transcode path.

### 🟡 VR-07: Stale Zustand State Sabotages Smart Copy
- **Location:** [`useJobStore.ts:222`](file:///D:/CreatorVault/src/store/useJobStore.ts#L222), [`ConverterModuleView.tsx:368-381`](file:///D:/CreatorVault/src/components/converter/ConverterModuleView.tsx#L368-L381)
- **Root Cause:** Enabling `-14 LUFS` on audio export leaves `converterNormalizeLoudness: true` in store. When user selects MP4/MOV, `canSmartRemux` checks `config.normalizeLoudness` and returns `false`, forcing unintended slow transcode.
- **Minimal Fix:** In `setConverterTargetFormat`, if target is video, reset `converterNormalizeLoudness` to `false` or ignore it in `canSmartRemux` when target is video.

### 🟡 VR-08: Unchecked NVENC Hardware Encoder Availability
- **Location:** [`FfmpegRunner.ts:508, 754`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L508)
- **Root Cause:** `useNvenc` checks OS GPU vendor (`hasNvenc`), but does not verify binary support via `this.hasEncoder('h264_nvenc')`. If FFmpeg build lacks NVENC, transcode aborts immediately.
- **Minimal Fix:** Check `hasNvenc && config.useHardwareEncoder && this.hasEncoder('h264_nvenc')`. Fall back to `libx264` on failure.

---

## 4. Unified Action Items Matrix

| ID | Severity | Area | Affected File(s) | Architectural Action |
|---|---|---|---|---|
| **ACT-01** | 🔴 Blocker | Bug / Crash | [`FfmpegRunner.ts`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts), [`ConverterModuleView.tsx`](file:///D:/CreatorVault/src/components/converter/ConverterModuleView.tsx) | Disable `.GIF` in UI when audio staged; reject `sourceIsAudio && targetExt === 'gif'` in runner. |
| **ACT-02** | 🔴 Blocker | Failure Mode | [`FfmpegRunner.ts`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts) | Fix `probeLocalMedia` audio defaults (`'none'`, `0`). Guard silent videos: error on audio extract, pass `-an` on transcode. |
| **ACT-03** | 🔴 Blocker | Data Loss | [`FfmpegRunner.ts:651`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L651) | Remove `:d=${safeDur}` from `lavfi color` filter in Studio Slate mode. Rely on `-shortest`. |
| **ACT-04** | 🔴 Blocker | Crash / OOM | [`FfmpegRunner.ts:573`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L573) | Clamp GIF generation to 30s (`-t 30`). Prevent multi-gigabyte frame explosions. |
| **ACT-05** | 🔴 Blocker | Process / State | [`useJobStore.ts:643`](file:///D:/CreatorVault/src/store/useJobStore.ts#L643) | Add `isConvertingBatch` mutex. Break batch loop immediately on job cancellation. |
| **ACT-06** | 🟡 Major | Architecture | [`FfmpegRunner.ts:696`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L696) | Add PCM/ProRes to MOV remux. Map streams safely (`-sn -dn`). Fallback to transcode on remux error. |
| **ACT-07** | 🟡 Major | State / UX | [`useJobStore.ts`](file:///D:/CreatorVault/src/store/useJobStore.ts), [`ConverterModuleView.tsx`](file:///D:/CreatorVault/src/components/converter/ConverterModuleView.tsx) | Scope `converterNormalizeLoudness` strictly to audio targets. Ignore or reset on video targets. |
| **ACT-08** | 🟡 Major | Crash Risk | [`FfmpegRunner.ts:508`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L508) | Add `this.hasEncoder('h264_nvenc')` check. Gracefully fall back to `libx264`. |
| **ACT-09** | 🟡 Major | Spec Contract | [`converter_module_spec.md`](file:///D:/CreatorVault/docs/specs/converter_module_spec.md) | Document invariants: `-ac 2` stereo downmix, `safeDur >= 3` for LUFS, and single-pass palette GIF filtergraph. |
| **ACT-10** | 🟢 Nit | Performance | [`FfmpegRunner.ts:609, 753`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L609) | Add `-row-mt 1 -cpu-used 4` to `libvpx-vp9` to prevent single-threaded CPU stalls. |
| **ACT-11** | 🟢 Nit | Code Reuse | [`FfmpegRunner.ts:271`](file:///D:/CreatorVault/electron/services/FfmpegRunner.ts#L271) | Deprecate redundant `probeLocalVideo`. Route all probing through `probeLocalMedia`. |
| **ACT-12** | 🟢 Nit | Types | [`media.ts`](file:///D:/CreatorVault/src/types/media.ts) | Export type alias `export type OutputPill = StemOutputPill` to eliminate domain misnomer confusion. |

---

## 5. Required Specification Contract Diffs ([`converter_module_spec.md`](file:///D:/CreatorVault/docs/specs/converter_module_spec.md))

1. **Section 1 (Line 5):**
   - *Current:* `1. Video ↔ Video (.mp4, .mov, .mkv, .webm, .gif) with Smart Copy (-c copy) zero-loss fast path.`
   - *Fix:* Remove `.gif` from smart copy list. Add dedicated category: `5. Video → Animated GIF (.gif) with 256-color palette filtergraph.`
2. **Section 2 (`VortexApi` & Types):**
   - Add invariant: `audioToVideoMode` is only valid when `sourceIsAudio` and `targetFormat` is video (`mp4`, `mov`, `mkv`, `webm`). GIF target is prohibited for audio inputs.
   - Clarify `StemOutputPill` represents draggable OS output pill.
3. **Section 3.2 (Conversion Matrix Execution):**
   - Document remux fallback: Remux is opportunistic; failure falls back to full transcode automatically.
   - Document audio stream handling: Video transcode on silent input omits audio tracks (`-an`).
   - Document -14 LUFS requirement: Requires source duration >= 3.0s (FFmpeg loudnorm filter requirement).
   - Document audio channel downmix: All transcoded audio downmixes to 2-channel stereo (`-ac 2`).
