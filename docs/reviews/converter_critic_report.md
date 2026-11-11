# Stage 7 Critic Review Report: Module 4 Universal Format Converter

**Target Document:** `docs/specs/converter_module_spec.md`  
**Auditors:** Hostile Design Critic (`egm-design`) & Technical Copy Editor (`egm-style`)  

---

# Part 1: Design & Implementation Critic Review (egm-design)

## Executive Summary
Module 4 delivers a foundational 4-way conversion matrix, but contains severe edge-case gaps in process lifecycle, codec compatibility, stream handling, and memory safety. Most notably: uncapped GIF generation can trigger out-of-memory system freezes; audio-to-GIF routing causes hard FFmpeg crashes; silent video inputs cause unhandled filter exceptions; dark slate synthesis truncates audio; and the store lacks a concurrent execution mutex.

## 🔴 Blockers (Catastrophic Failure / Process Hang / Data Loss)

### 1. Uncapped Video-to-GIF Conversion Triggers Memory Exhaustion & System Lockup
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Lines 573–603)
- **Technical Failure**: Case 3 executes a 2-pass 256-color palette filter (`palettegen` + `paletteuse=dither=bayer`) over the entire duration of the input video without any duration or frame cap (`safeDur` defaults to full duration). A user converting a 5-minute 1080p clip generates 4,500 uncompressed GIF frames. FFmpeg buffers frame palettes in memory, resulting in multi-gigabyte files, runaway RAM/VRAM consumption, disk exhaustion, and UI lockup for 30+ minutes.
- **Recommendation**: Enforce a strict duration clamp (max 15–30s) or reject GIF jobs exceeding 30s unless trimmed. Inject `-t 15` or require an explicit user duration parameter.

### 2. Fatal FFmpeg Crash on Audio → GIF Conversion
- **Affected Scope**: `src/components/converter/ConverterModuleView.tsx` (Lines 252–268) & `electron/services/FfmpegRunner.ts` (Lines 605–644)
- **Technical Failure**: When audio files (`.mp3`, `.wav`, `.flac`) are staged and `.GIF` is selected in `VIDEO_TARGETS`, the UI allows job submission. `executeConverterJob` evaluates `sourceIsAudio && !targetIsAudio` as `true` (since `gif` is not in the audio list). It routes into `showwaves` or dark slate using `vEncoderArgs` (`h264_nvenc`/`libx264`) and `aEncoderArgs` (`aac`) targeting `output.gif`. FFmpeg immediately crashes: `GIF does not support H.264 video or AAC audio`.
- **Recommendation**: In `ConverterModuleView.tsx`, disable `.GIF` target button when staged files contain audio. In `FfmpegRunner.ts`, validate and reject `sourceIsAudio && targetExt === 'gif'` before spawning FFmpeg.

### 3. Fatal Crash on Silent Video Inputs When Transcoding or Converting to Audio
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Lines 538–571 & Lines 778–809)
- **Technical Failure**: When converting video without audio (screen captures, timelapses, drone footage):
  1. *Video → Audio*: FFmpeg runs `-vn -c:a ...`. With no audio stream, FFmpeg aborts: `Output file does not contain any stream`.
  2. *Video → Video Transcode*: `aEncoderArgs` unconditionally attaches `-af loudnorm=...` and `-c:a aac`. Without an audio stream, FFmpeg fails: `Cannot find a matching stream for unlabeled input pad 0 on filter Filter loudnorm`.
  3. *Smart Copy*: In `canSmartRemux`, `aCodec` is empty, causing `['aac', 'mp3', 'alac'].includes('')` to evaluate to `false`, forcing a transcode that then crashes on missing audio.
- **Recommendation**: Query `this.hasAudioStream(config.inputPath)`. If silent: pass `-an` for video-to-video; for video-to-audio, fail fast with a clear error or synthesize silent PCM. In `canSmartRemux`, allow silent video remuxing if video codec matches.

### 4. Audio Truncation Bug in Studio Slate Audio-to-Video Mode
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Lines 645–675)
- **Technical Failure**: Studio Slate mode instantiates the video source via:
  `-f lavfi -i color=c=0x09090B:s=1280x720:r=30:d=${safeDur}` combined with `-i config.inputPath -shortest`.
  When an input audio file has VBR encoding or missing metadata where `ffprobe` format duration falls back to default 30s, the synthetic color video stream stops exactly at `safeDur`. `-shortest` immediately truncates the output file at 30 seconds, discarding the remainder of the user's audio.
- **Recommendation**: Remove `d=${safeDur}` from the `lavfi color` filter: `color=c=0x09090B:s=1280x720:r=30`. Allow the color generator to produce frames continuously until `-shortest` terminates naturally when the audio stream ends.

### 5. Unbounded Concurrent Batch Execution Race Condition
- **Affected Scope**: `src/store/useJobStore.ts` (Lines 643–742) & `src/components/converter/ConverterModuleView.tsx` (Lines 431–443)
- **Technical Failure**: `enqueueAndRunConverterJobs` has no execution mutex or `isConverting` lock. While a conversion batch is in progress, if the user adds files and clicks "Convert", a second concurrent `for` loop executes in parallel. Both spawn FFmpeg transcode processes simultaneously. When hardware acceleration is on, concurrent instances saturate GPU encoder sessions (consumer NVIDIA cards enforce a strict limit of 3–5 sessions), crashing jobs with `NVENC out of memory / device limit reached`.
- **Recommendation**: Add `isConvertingBatch: boolean` to `useJobStore`. Disable the conversion button while active, or route all submissions through an internal FIFO task queue.

## 🟡 Majors (Reliability / Performance / Stream Degradation)

### 1. Smart Copy Failure on Multi-Stream Containers With No Fallback
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Lines 714–748)
- **Technical Failure**: `canSmartRemux` returns `true` for all MKVs and compatible video/audio streams in MP4/MOV. Running `-c copy` without stream filtering (`-map 0:v:0 -map 0:a? -sn -dn`) fails if source files contain unsupported subtitle codecs (e.g. PGS/ASS in MKV to MP4) or data/telemetry streams (GoPro metadata). Furthermore, there is no transcode fallback: if `-c copy` fails, the job immediately fails.
- **Recommendation**: Map explicit streams (`-map 0:v:0 -map 0:a? -sn -dn`) and wrap the smart remux call in a `try/catch` that automatically falls back to full transcode upon remux failure.

### 2. Stale Zustand State Pollutes Target Configuration
- **Affected Scope**: `src/store/useJobStore.ts` (Line 222) & `src/components/converter/ConverterModuleView.tsx` (Lines 368–381)
- **Technical Failure**: `-14 LUFS Normalize` is only exposed when `isAudioTarget` is selected. If enabled for an audio export and the user switches to `MP4` or `MOV`, `state.converterNormalizeLoudness` remains `true` in Zustand. In `canSmartRemux`, `config.normalizeLoudness` causes `canSmartRemux` to return `false`, silently disabling Smart Copy and forcing a slow CPU transcode on compatible video files without user awareness.
- **Recommendation**: Reset or decouple `converterNormalizeLoudness` when switching to video formats in `setConverterTargetFormat`.

### 3. Lack of Automatic CPU Fallback on NVENC Runtime Errors
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Lines 610, 754–777)
- **Technical Failure**: When `useHardwareEncoder` is enabled, FFmpeg spawns with `h264_nvenc`. If NVENC fails at runtime (due to driver issues, unsupported resolution, or session exhaustion), FFmpeg crashes and fails the job immediately without trying software encoding (`libx264`).
- **Recommendation**: Catch NVENC initialization failures and retry the job automatically with `libx264`, emitting a diagnostic warning.

### 4. Hardcoded Stereo Downmixing Destroys Multi-Channel Audio
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Line 515)
- **Technical Failure**: `buildAudioCodecArgs` hardcodes `'-ac', '2'`. Converting 5.1/7.1 surround sound or multi-track recordings (OBS) forcibly collapses or drops channels without matrix encoding, risking phase cancellation and dialogue loss.
- **Recommendation**: Check source channel count in `probeLocalMedia` and preserve channel layout unless downmixing is explicitly requested.

### 5. Incomplete Output Files & Empty Folders Left on Disk
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Lines 493–503, 1457–1481)
- **Technical Failure**: Every job creates `${baseName}_${jobId.slice(0, 6)}`. If cancelled or aborted mid-transcode, the process is killed but partial, corrupt output files and empty directories remain on the user's filesystem.
- **Recommendation**: Clean up incomplete target files and empty output folders on cancellation or process failure.

### 6. Missing Tone-Mapping on 10-bit HDR / Wide Gamut Inputs
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Lines 762, 773)
- **Technical Failure**: Converting 10-bit HDR (BT.2020 / HLG / PQ) footage directly to 8-bit SDR (`-pix_fmt yuv420p`) without tone mapping or color transfer tags yields washed-out, desaturated exports.
- **Recommendation**: Detect HDR/BT.2020 in `probeLocalMedia` and inject color space conversion/tonemapping filters or metadata tags.

## 🟢 Nits (Polish / Minor Inconsistencies)

### 1. Hardcoded `libvorbis` Codec Check
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Line 531)
- **Recommendation**: Use `this.hasEncoder('libvorbis') ? 'libvorbis' : 'vorbis'`.

### 2. Progress Percentage Clamps to 99% on Probing Fallback
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Lines 1440–1454)
- **Recommendation**: Suppress percentage calculation and report elapsed time and speed when duration is estimated or unknown.

### 3. QuickTime MOV Always Employs Lossy AAC
- **Affected Scope**: `electron/services/FfmpegRunner.ts` (Line 789)
- **Recommendation**: Allow PCM audio selection for MOV video exports.

### 4. Hardware Toggle Labeling Ambiguity
- **Affected Scope**: `src/components/converter/ConverterModuleView.tsx` (Line 420)
- **Recommendation**: Hide or disable toggle when non-NVIDIA GPUs are present.

---

# Part 2: Style & Specification Quality Critic Review (egm-style)

## Executive Summary
The Module 4 specification establishes a solid architectural foundation for the 4-way media conversion matrix. However, it contains critical contract inaccuracies, marketing hyperbole, unstated runtime invariants, and domain naming leakage inherited from Module 1 (`StemOutputPill`).

## 🔴 Blockers (Contract Defect)

### 1. GIF Smart Copy Contradiction
- **Affected Scope:** Section 1 (Line 5), Section 3.2 (Lines 84–89)
- **Problem:** Line 5 groups `.gif` into: `"Video ↔ Video (.mp4, .mov, .mkv, .webm, .gif) with Smart Copy (-c copy) zero-loss fast path."`
- **Correction:** Split GIF out of the video container stream-copy matrix into its own dedicated raster animation category.

### 2. Unstated Audio Downmixing Invariant (`-ac 2`)
- **Affected Scope:** Section 2 (Lines 43–60), Section 3.2 (Lines 90–95)
- **Problem:** The specification fails to define channel handling when converting multi-channel surround audio (5.1 / 7.1) or mono audio.
- **Correction:** Document explicit 2-channel stereo downmix invariant (`-ac 2`) across all target containers.

### 3. Silent Loudness Normalization Drop Invariant (`safeDur >= 3`)
- **Affected Scope:** Section 3.2 (Line 94)
- **Problem:** Line 94 specifies optional `loudnorm=I=-14:TP=-1.0:LRA=11` without qualification.
- **Correction:** Document minimum 3.0s duration bound for integrated loudness normalization.

## 🟡 Majors (Terminology & Completeness)

### 1. Domain Terminology Leak (`StemOutputPill`)
- **Affected Scope:** Section 2 (Lines 66–70)
- **Correction:** Introduce `OutputPill` alias or document `StemOutputPill` mapping for Module 4.

### 2. Silent NVENC Ignore on WEBM Target
- **Affected Scope:** Section 2 (Line 58), Section 3.2 (Lines 91–92), Section 5 (Line 115)
- **Correction:** Explicitly state that `useHardwareEncoder` applies strictly to H.264 targets (`mp4`, `mov`, `mkv`).

### 3. Uncalibrated Claim & Storage I/O Boundary Defect
- **Affected Scope:** Section 3.2 (Line 89)
- **Correction:** Replace with: `"Remuxes compatible streams without re-encoding, constrained only by sequential disk I/O throughput."`

### 4. Silent Remux Failure for Audio-less Video Streams
- **Affected Scope:** Section 3.2 (Line 86)
- **Correction:** Specify audio stream absence handling in remux validation rules.

### 5. Unstated Active/Inert Parameter Scopes in `ConverterJobConfig`
- **Affected Scope:** Section 2 (Lines 43–60)
- **Correction:** Add a parameter validity matrix mapping target format to active configuration fields.

## 🟢 Nits (Framing & STE-100)
- **-14 LUFS Descriptor:** OTT/Streaming loudness target, not traditional TV broadcast.
- **GIF Filtergraph:** Dual-branch single-pass filtergraph, not 2-pass.
- **Waveform Colors:** Document explicit gradient values (`0x10B981|0x6366F1`).
- **ASD-STE100:** Enforce 20-word maximum per sentence in spec text.
