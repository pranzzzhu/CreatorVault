# Comprehension Audit Report: Module 4 Universal Format Converter

**Target Document**: `docs/specs/converter_module_spec.md`  
**Auditor**: Comprehension Goldfish (Naive Reader Perspective)  
**Notice**: Subagent operates under strict read-only protocol. Persist this report to `docs/reviews/converter_comprehension_report.md`.

---

## 1. Paraphrase

### What this proposes
Module 4 introduces Universal Media Format Converter for CreatorVault. Converter provides four-way matrix converting arbitrarily between video and audio containers (MP4, MOV, MKV, WEBM, GIF, WAV, MP3, FLAC, M4A, OGG). System enables zero-loss container stream copying (`-c copy`) when codecs match target containers. System transcodes incompatible streams via NVENC GPU or CPU x264/VP9, extracts normalized audio at 44.1/48kHz with -14 LUFS, and synthesizes waveform/slate video from audio inputs. Workflows queue sequentially through unified job list with OS drag-and-drop output pills.

### How the existing system works, per this document
The document states CreatorVault runs Electron desktop architecture with React UI and TypeScript contracts. Media files get staged via drag-and-drop or file pickers and probed through `ffprobe` JSON stream inspection. Conversion execution delegates to `electron/services/FfmpegRunner.ts`, which evaluates remux compatibility and executes appropriate FFmpeg pipelines. Progress events emit over Electron IPC into `useJobStore.ts`, displaying progress in `JobQueueList` and yielding final file paths as draggable pills.

---

## 2. Findings & Discrepancies

### Finding 1: Invalid Audio-to-GIF Transition & Unhandled Codec Crash
- **Severity**: 🔴 Blocker
- **Affected Scope**: Section 1 (Line 8), Section 2 (Lines 17-27), Section 3.2 (Lines 90-95)
- **Discrepancy Description & Rationale**:
  Spec lists `gif` in `ConverterTargetFormat`. Section 1 excludes `gif` from Audio → Video, but Section 2 includes it without validation. In implementation (`FfmpegRunner.ts:605`), `if (sourceIsAudio && !targetIsAudio)` matches when target is `gif`. Runner attempts to encode GIF using `libx264` or `h264_nvenc` with audio streams. FFmpeg immediately aborts with invalid muxer/codec errors. Spec must explicitly prohibit or disallow `.gif` target when source is audio.

### Finding 2: Undefined Fallback Semantics for Failed Smart Copy Remuxing
- **Severity**: 🔴 Blocker
- **Affected Scope**: Section 3.2 (Lines 84-90)
- **Discrepancy Description & Rationale**:
  Spec defines conditions for Smart Remux (`canSmartRemux`), but fails to state system behavior when user selects Smart Copy on incompatible codecs (e.g. VP9 in MKV to MP4, or ProRes MOV to MP4). Reader cannot determine if engine throws error, aborts, or silently falls back to lossy transcode. Implementation silently transcodes, but spec leaves contract unspecified. Spec must define whether Smart Copy is strict requirement or opportunistic fast path.

### Finding 3: Undefined `StemOutputPill` Contract and Domain Misnomer
- **Severity**: 🟡 Major
- **Affected Scope**: Section 2 (Line 68), Section 4 (Line 103), Section 5 (Line 116)
- **Discrepancy Description & Rationale**:
  Method `startConverterJob` returns `pills: StemOutputPill[]`. Type `StemOutputPill` is not defined in spec document. The name is confusing legacy artifact from Module 1 (Stem Separator). Format converter produces container media files, not separated musical stems. Reader cannot determine pill attributes (`filePath`, `type`, `label`) or native OS drag-to-timeline integration mechanics.

### Finding 4: Silent Omission of -14 LUFS Normalization for Clips Under 3 Seconds
- **Severity**: 🟡 Major
- **Affected Scope**: Section 1 (Line 6), Section 3.2 (Line 94)
- **Discrepancy Description & Rationale**:
  Spec states audio conversion supports broadcast -14 LUFS loudness normalization via `loudnorm`. Spec omits vital engine precondition: FFmpeg `loudnorm` filter requires minimum audio buffer duration. Implementation silently bypasses loudness normalization for clips under 3 seconds without warning. Naive user converting short UI sound effects or sound bites receives unnormalized audio with no error or notification.

### Finding 5: Silent Video Handling and Inaccurate Default Audio Probing
- **Severity**: 🟡 Major
- **Affected Scope**: Section 3.1 (Lines 78-82), Section 3.2 (Lines 84-96)
- **Discrepancy Description & Rationale**:
  Spec claims `probeLocalMedia` accurately inspects container streams. For video files with no audio track, probe logic defaults `audioCodec` to `'aac'` and `sampleRate` to `48000`. Transcode pipeline then attempts to encode AAC audio for silent inputs without `-an`. Spec fails to define contracts for silent source videos and channel layouts (mono, stereo, 5.1).

### Finding 6: Unstated Sidecar Binary Prerequisites and Missing Error Contract
- **Severity**: 🟡 Major
- **Affected Scope**: Section 3 (Lines 76-96)
- **Discrepancy Description & Rationale**:
  Spec describes `ffmpeg` and `ffprobe` execution without stating dependency requirements. Unlike Modules 1 and 2, spec does not state whether Converter supports simulation mode when binaries are absent, or how missing sidecars are communicated. In code, missing FFmpeg throws unhandled error. Spec must explicitly state FFmpeg and FFprobe are mandatory, non-simulated prerequisites.

### Finding 7: Unspecified Output Directory Hierarchy
- **Severity**: 🟢 Nit
- **Affected Scope**: Section 2 (Line 59), Section 3.2
- **Discrepancy Description & Rationale**:
  `ConverterJobConfig` declares `outputDir: string`. Spec does not define output path structure. Implementation creates unique subfolder per job (`<outputDir>/<baseName>_<jobIdPrefix>/<baseName>_Converted.<ext>`). Spec should state subfolder naming policy so downstream callers know where files land.

### Finding 8: Hardcoded Dimensions in Audio-to-Video Synthesizer
- **Severity**: 🟢 Nit
- **Affected Scope**: Section 3.2 (Line 95)
- **Discrepancy Description & Rationale**:
  Waveform and dark slate synthesizers hardcode output canvas to 1280x720 at 30fps. Spec does not specify if canvas size, framerate, or waveform palette (`0x10B981|0x6366F1`) are fixed design constants or user-configurable parameters.

### Finding 9: Unbounded GIF Conversion Risk on Long Video Sources
- **Severity**: 🟢 Nit
- **Affected Scope**: Section 3.2 (Line 93)
- **Discrepancy Description & Rationale**:
  GIF target executes two-pass 15fps palette generation. Spec sets no maximum input duration or warning threshold. Converting long footage (e.g. 10 minutes) generates huge GIF files and risks system memory exhaustion. Spec should define maximum duration ceiling or UI warning.
