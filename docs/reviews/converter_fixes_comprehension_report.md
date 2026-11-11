# Stage 6: Comprehension Test Report — Module 4: Universal Format Converter (`converter`)

## Paraphrase

### What this proposes
Module 4 adds local media format conversion across five video containers (MP4, MOV, MKV, WEBM, GIF) and five audio formats (WAV, MP3, FLAC, M4A, OGG). The system remuxes compatible streams without transcoding ("Smart Copy") and falls back automatically to GPU/CPU transcoding when remuxing fails. Video inputs convert to audio with optional 2-channel downmix and -14 LUFS loudness normalization. Audio inputs convert to video using synthetic live waveforms or studio dark slates. Video inputs convert to animated GIFs with a 256-color palette capped at 30 seconds, while audio-to-GIF conversion is prohibited.

### How the existing system works, per this document
The Electron desktop application invokes sidecar `ffmpeg` and `ffprobe` binaries through IPC. The UI presents drag-and-drop staging with stream probing that filters out embedded album art. Users configure target format and encoding parameters, then execute batch conversion guarded by a concurrency mutex. Jobs run sequentially, emit progress events, save outputs to job folders, and expose draggable result pills to the timeline.

---

## Findings

### 1. 🟡 Major
- **Affected Scope**: Section 3.2 (`Conversion Matrix Execution`), line 90; `electron/services/FfmpegRunner.ts:463-465, 504, 779-781`
- **Discrepancy Description & Rationale**:
  - Spec states integrated loudness normalization (`loudnorm`) strictly requires duration `>= 3.0s` to prevent filtergraph stalls.
  - Spec does not state failure contract for clips under 3.0s: does it error out or bypass?
  - Code silently omits `-af loudnorm` when `safeDur < 3`.
  - Code progress callback (`line 504`) still reports `Converting to WAV (48kHz -14 LUFS)`.
  - Misleading UI/log output tells user audio is normalized when raw volume was exported unchanged.
  - Fix: Update spec to explicitly define silent bypass under 3s. Condition progress message on `config.normalizeLoudness && safeDur >= 3`.

### 2. 🟡 Major
- **Affected Scope**: Section 3.2 (`Smart Remuxing Path`), line 94; `electron/services/FfmpegRunner.ts:662-667`
- **Discrepancy Description & Rationale**:
  - Spec and code state remux is allowed for MP4/MOV if video is `H.264/HEVC/ProRes` and audio is `AAC/MP3/ALAC/PCM`.
  - Standard MP4 container specification does not support Apple ProRes video or uncompressed PCM audio. MOV container does.
  - Staging ProRes/PCM with MP4 target and Smart Copy triggers an invalid FFmpeg remux run, fails, deletes temp file, and falls back to transcode.
  - Spec conflates MP4 and MOV container capabilities.
  - Fix: Decouple MP4 from MOV in spec and `canSmartRemux`. Allow ProRes and PCM for MOV only. Restrict MP4 to H.264/HEVC and AAC/MP3/ALAC.

### 3. 🟡 Major
- **Affected Scope**: Section 4 & 5 (`State Management & Batch Execution`, `UI Architecture`), lines 111-115, 121-123; `src/store/useJobStore.ts:669-760`
- **Discrepancy Description & Rationale**:
  - Document omits execution semantics for heterogeneous file batches.
  - When audio and video are staged together, `.GIF` button disables globally for all files, even staged video files.
  - When batch includes silent video and target is audio, silent job errors while remainder of batch continues.
  - Spec leaves unstated whether batch halts on individual errors or only on user cancellation.
  - Fix: Document batch tolerance contract: single-file errors record to job and do not halt batch; only user cancellation breaks loop.

### 4. 🟢 Nit
- **Affected Scope**: Section 1 & 5 (`Overview & Architectural Goals`, `UI Architecture`), lines 4, 104, 109
- **Discrepancy Description & Rationale**:
  - Spec and UI claim "4-Way Matrix" (Video↔Video, Video→Audio, Audio↔Audio, Audio→Video), but list 5 distinct conversion classes by including Video→Animated GIF.
  - Fix: Clarify that GIF is a specialized animation output of video container export, or label as "4-Way Media Matrix + Animated GIF Export".

### 5. 🟢 Nit
- **Affected Scope**: Section 2 (`Technical Contracts & Types`), lines 63, 71; `src/types/media.ts:176, 301`
- **Discrepancy Description & Rationale**:
  - Spec defines `export type OutputPill = StemOutputPill;` to decouple from Module 1 naming.
  - `VortexApi.startConverterJob` return type in spec and in `media.ts` still explicitly uses `pills: StemOutputPill[]`.
  - Fix: Update `VortexApi.startConverterJob` return signature to `pills: OutputPill[]`.

### 6. 🟢 Nit
- **Affected Scope**: Section 3.2 (`Transcode Path`), line 104; `electron/services/FfmpegRunner.ts:581-628`
- **Discrepancy Description & Rationale**:
  - Video-to-Video transcode adds `-movflags +faststart` for MP4 and MOV containers.
  - Audio-to-Video synthesis (waveform and slate) omits `-movflags +faststart` on MP4 and MOV containers.
  - Output files lack front-loaded `moov` atom for instant web playback.
  - Fix: Append `-movflags +faststart` to MP4/MOV outputs in Audio-to-Video pipeline.
