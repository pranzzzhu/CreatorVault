# Zoom Out Review Report — Module 4: Universal Format Converter

Stage 5 (Initial Zoom Out Review) audit complete for Module 4.
Target Document: `docs/specs/converter_module_spec.md`
Context & Codebase Scope:
- `electron/services/FfmpegRunner.ts`
- `electron/preload.ts` & `electron/main.ts`
- `src/store/useJobStore.ts`
- `src/components/converter/ConverterModuleView.tsx`
- `src/components/layout/SidebarRail.tsx` & `src/App.tsx`

---

# Zoom Out Review: Module 4 Universal Format Converter

## Executive Summary
Module 4 delivers a cohesive 4-way conversion matrix (Video↔Video, Video→Audio, Audio↔Audio, Audio→Video) directly into CreatorVault. Architecture aligns well with existing sidecar patterns and native OS drag-to-timeline pills. 

However, critical edge cases break FFmpeg:
1. Converting staged Audio to GIF crashes FFmpeg because audio stream is mapped into GIF muxer with H.264/AAC.
2. Converting silent videos (drone footage, screen recordings) to Audio or transcoding with `-af loudnorm` fails fatally with unmapped audio streams.
3. Batch loops ignore job cancellation (aborting file 1 still processes remaining 19 queued items).
4. Unchecked NVENC encoder crashes if FFmpeg binary lacks NVENC support.

---

## Findings Matrix

| ID | Severity | Category | Affected Scope | Problem Summary |
|---|---|---|---|---|
| **F-01** | 🔴 Blocker | Bug / Crash | `FfmpegRunner.ts:574-633`, `ConverterModuleView.tsx:74` | Audio to GIF target invokes H.264/AAC video encoding into `.gif`, crashing FFmpeg. |
| **F-02** | 🔴 Blocker | Failure Mode | `FfmpegRunner.ts:538-556, 778-808` | Audio extraction (`-vn`) & video transcode (`-af loudnorm`) crash fatally on audio-less input videos. |
| **F-03** | 🟡 Major | Data Loss / Bug | `FfmpegRunner.ts:646-675` | Audio-to-Video Slate mode hardcodes `:d=${safeDur}`, truncating audio longer than probed duration. |
| **F-04** | 🟡 Major | Crash Risk | `FfmpegRunner.ts:508, 754`, `main.ts:479` | NVENC hardware toggle lacks `hasEncoder('h264_nvenc')` check; crashes if FFmpeg build lacks NVENC. |
| **F-05** | 🟡 Major | Architecture / Loss | `FfmpegRunner.ts:696-735` | Smart Copy blocks PCM audio and ProRes in MOV, drops multi-track audio (`-map 0` missing), and lacks transcode fallback. |
| **F-06** | 🟡 Major | Concurrency / UX | `useJobStore.ts:643-742` | Batch execution loop does not abort on job cancellation; lacks re-entrancy lock against concurrent batch loops. |
| **F-07** | 🟡 Major | Resource Contention | `FfmpegRunner.ts:573-602` | Uncapped GIF generation on long inputs (10m+) creates massive frame explosions and OOM risks. |
| **F-08** | 🟢 Nit | Code Minimization | `FfmpegRunner.ts:271-468` | Duplicate probing: `probeLocalVideo` and `probeLocalMedia` do identical ffprobe parsing. |
| **F-09** | 🟢 Nit | UX / Filesystem | `FfmpegRunner.ts:500-503` | Single converted files are wrapped in dedicated hash subfolders, cluttering export directory. |
| **F-10** | 🟢 Nit | Performance | `FfmpegRunner.ts:609, 753` | VP9 WEBM encoding lacks CPU threading flags (`-cpu-used 4`, `-row-mt 1`), causing severe encode stalls. |

---

## Detailed Technical Findings

### 🔴 F-01: Audio to GIF target crashes FFmpeg & generates invalid stream
- **Affected Scope**: `electron/services/FfmpegRunner.ts:574-633`, `src/components/converter/ConverterModuleView.tsx:74`
- **Technical Rationale**:
  - Case 3 (`executeConverterJob`) only executes if `!sourceIsAudio && targetExt === 'gif'`.
  - When an audio file is staged (`sourceIsAudio === true`) and `.gif` is chosen, `targetIsAudio` is false (since target is GIF).
  - The job falls directly into Case 4 (Audio -> Video).
  - Case 4 maps `[v]` and `0:a` with `vEncoderArgs` (`libx264` or `h264_nvenc`) and `-c:a aac` into `outPath` ending with `.gif`.
  - FFmpeg's `gif` muxer rejects H.264 video and audio streams, exiting with code 1 (`[gif @ ...] Invalid audio stream for GIF`).
  - In `ConverterModuleView.tsx`, the `.GIF` button remains enabled when audio is staged.
- **Minimal Fix**:
  1. In `ConverterModuleView.tsx`: Disable `.GIF` when `hasStagedAudio` is true.
  2. In `FfmpegRunner.ts`: Guard Case 4: if `targetExt === 'gif'` when `sourceIsAudio`, throw explicit validation error `Cannot convert audio-only file to GIF`.

---

### 🔴 F-02: Audio Extraction & Video Transcode crash on silent/audio-less video inputs
- **Affected Scope**: `electron/services/FfmpegRunner.ts:538-556, 778-808`
- **Technical Rationale**:
  - In Case 1/2 (`targetIsAudio`), FFmpeg is invoked with `-vn ... -c:a ...`. If a video input has no audio stream (e.g. screen recording, drone footage, timelapse), FFmpeg errors out: `Output file #0 does not contain any stream`.
  - In Case 5 (`Video -> Video transcode`), if `config.normalizeLoudness` is enabled, `['-af', 'loudnorm=...']` is appended. If the source video has no audio, FFmpeg exits with code 1: `Filtergraph 'loudnorm=...' requires audio input, but stream 0:a is not found`.
  - `FfmpegRunner.ts` already implements `hasAudioStream(filePath)` (line 50), but `executeConverterJob` ignores it.
- **Minimal Fix**:
  - Check `const hasAudio = this.hasAudioStream(config.inputPath);`.
  - For `targetIsAudio`: If `!hasAudio`, throw clean error: `Input video has no audio track to extract`.
  - For Video transcode: Only append audio encoder args and `loudnorm` filter if `hasAudio` is true; otherwise pass `-an`.

---

### 🟡 F-03: Studio Slate mode hardcodes `:d=${safeDur}`, truncating audio
- **Affected Scope**: `electron/services/FfmpegRunner.ts:646-675`
- **Technical Rationale**:
  - Studio Slate synthesizes video using `color=c=0x09090B:s=1280x720:r=30:d=${safeDur}` where `safeDur = Math.max(1, config.duration || 15)`.
  - When ffprobe parses VBR audio (or streaming files where duration defaults to 30s), the color video generator stops at 30 seconds.
  - Due to `-shortest`, once the color stream stops, FFmpeg terminates the muxer, truncating the rest of the audio.
- **Minimal Fix**:
  - Drop `:d=${safeDur}` from `color` filter: `color=c=0x09090B:s=1280x720:r=30`.
  - With `-shortest`, FFmpeg automatically terminates video generation the instant the input audio stream ends.

---

### 🟡 F-04: Hardware NVENC crashes when FFmpeg build lacks NVENC support
- **Affected Scope**: `electron/services/FfmpegRunner.ts:508, 754`, `electron/main.ts:479`
- **Technical Rationale**:
  - `executeConverterJob` calculates `useNvenc = hasNvenc && config.useHardwareEncoder;` where `hasNvenc` comes from `HardwareProbe.probe` (OS-level GPU presence).
  - If a user has an NVIDIA GPU but the active FFmpeg binary lacks `h264_nvenc` support (or driver issue), FFmpeg aborts: `Unknown encoder 'h264_nvenc'`.
  - Unlike `executeFixerJob` (line 1143) which verifies encoder availability, `executeConverterJob` never verifies `this.hasEncoder('h264_nvenc')` and provides no fallback.
- **Minimal Fix**:
  - Set `const useNvenc = hasNvenc && config.useHardwareEncoder && this.hasEncoder('h264_nvenc');`.

---

### 🟡 F-05: Smart Copy Remux limitations & missing transcode fallback
- **Affected Scope**: `electron/services/FfmpegRunner.ts:696-735`
- **Technical Rationale**:
  - `canSmartRemux` restricts audio codecs to `['aac', 'mp3', 'alac']` for MOV. Camera video (Sony, Canon, Panasonic, ProRes MOV) commonly records uncompressed `pcm_s16le`. QuickTime MOV supports PCM natively. Forcing full transcode on professional MOV footage violates zero-loss design.
  - Video codecs for MOV exclude `prores`. ProRes in MKV or MOV should smart-remux losslessly.
  - Smart Copy runs `ffmpeg -i in -c copy out` without `-map 0`. Default stream selection drops secondary audio tracks and subtitles.
  - If Smart Copy remux fails (due to bitstream header mismatch), the job crashes instead of falling back to transcode.
- **Minimal Fix**:
  - Include `prores` in `vOk` for MOV; include `pcm_s16le`, `pcm_s24le` in `aOk` for MOV.
  - Add `-map 0` to preserve all stream channels.
  - Wrap `runFfmpegWithProgress` for remux in try/catch; if remux fails, log warning and fall back to full transcode.

---

### 🟡 F-06: Batch loop in `useJobStore.ts` does not break on job cancellation
- **Affected Scope**: `src/store/useJobStore.ts:643-742`
- **Technical Rationale**:
  - `enqueueAndRunConverterJobs` loops through `itemsToConvert` with `for (const item of itemsToConvert)`.
  - When a user aborts an active job via `cancelJob(jobId)`, `startConverterJob` rejects.
  - The `catch` block logs the cancellation on that job item, but does not `break` the loop. The loop continues to convert the next file, then the next.
  - If a user stages new items while a batch is active, multiple instances of `enqueueAndRunConverterJobs` run simultaneously, contending for NVENC sessions and CPU threads.
- **Minimal Fix**:
  - Add `isProcessingQueue` boolean guard to `useJobStore`.
  - If `isCancelled` is true in the catch block, `break;` the loop so the entire batch halts.

---

### 🟡 F-07: Uncapped GIF generation risks process exhaustion
- **Affected Scope**: `electron/services/FfmpegRunner.ts:573-602`
- **Technical Rationale**:
  - Case 3 executes 2-pass palette generation (`palettegen` + `paletteuse`) on the entire source video without length checks.
  - Dropping a 10-minute video into `.gif` renders 9,000 frames at 15fps, generating a multi-gigabyte GIF that exhausts disk and crashes renderer memory.
- **Minimal Fix**:
  - Cap GIF generation at 30 seconds (`-t 30`) or clamp in UI with explicit user notice.

---

### 🟢 F-08: Code Duplication between `probeLocalMedia` and `probeLocalVideo`
- **Affected Scope**: `electron/services/FfmpegRunner.ts:271-468`
- **Technical Rationale**:
  - `probeLocalMedia` is a strict superset of `probeLocalVideo`. Both run `ffprobe -print_format json -show_format -show_streams`.
  - `probeLocalMedia` also ignores album art streams (`attached_pic === 1`) and parses sample rate.
- **Minimal Fix**:
  - Deprecate `probeLocalVideo` and route `fixer:probe` to `probeLocalMedia`.

---

### 🟢 F-09: Unnecessary Folder Nesting for Single Output Files
- **Affected Scope**: `electron/services/FfmpegRunner.ts:500-503`
- **Technical Rationale**:
  - Converter always outputs exactly one file (`${baseName}_Converted.${targetExt}`).
  - Wrapping each file in `outputDir/${baseName}_${jobId.slice(0, 6)}/` creates dozens of single-file folders during batch conversion.
- **Minimal Fix**:
  - Save directly to `config.outputDir` with collision avoidance (e.g. `_Converted_1.ext`).

---

### 🟢 F-10: VP9 WEBM CPU encode stalls
- **Affected Scope**: `electron/services/FfmpegRunner.ts:609, 753`
- **Technical Rationale**:
  - `libvpx-vp9` with `-crf 28 -b:v 0` without `-deadline realtime`, `-cpu-used 4`, or `-row-mt 1` defaults to single-threaded, ultra-slow CPU encoding in FFmpeg.
- **Minimal Fix**:
  - Add `-row-mt 1 -cpu-used 4` to VP9 encoder arguments.
