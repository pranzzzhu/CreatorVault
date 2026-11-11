# VORTEX (CreatorVault) — Module 4: Universal Format Converter (`converter`) Specification

## 1. Overview & Architectural Goals
Module 4 introduces the Universal Media Format Converter (`converter`) to CreatorVault. It provides a local-first, 4-way conversion matrix between arbitrary video and audio formats:
1. Video ↔ Video (.mp4, .mov, .mkv, .webm) with opportunistic Smart Copy (`-c copy`) zero-loss fast path and transcode fallback.
2. Video → Audio (.wav, .mp3, .flac, .m4a, .ogg) with selectable sample rate (44.1kHz vs 48kHz) and streaming -14 LUFS loudness normalization.
3. Audio ↔ Audio (.wav, .mp3, .flac, .m4a, .ogg).
4. Audio → Video (.mp4, .mov, .mkv, .webm) with synthesized real-time audio waveform or studio dark slate.
5. Video → Animated GIF (.gif) with 256-color palette filtergraph clamped to maximum 30s. Audio → GIF is strictly prohibited.

---

## 2. Technical Contracts & Types (`src/types/media.ts`)

```typescript
export type ModuleId = 'ripper' | 'fixer' | 'vectorizer' | 'converter';

export type ConverterTargetFormat =
  | 'mp4'
  | 'mov'
  | 'mkv'
  | 'webm'
  | 'gif'
  | 'wav'
  | 'mp3'
  | 'flac'
  | 'm4a'
  | 'ogg';

export interface LocalMediaMetadata {
  filePath: string;
  fileName: string;
  fileSizeMB: number;
  duration: number;
  mediaType: 'video' | 'audio';
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  sampleRate: number;
}

export interface ConverterJobConfig {
  inputPath: string;
  fileName: string;
  duration: number;
  mediaType: 'video' | 'audio';
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  targetFormat: ConverterTargetFormat;
  smartCopy: boolean;
  audioSampleRate: 48000 | 44100;
  normalizeLoudness: boolean;
  audioToVideoMode: 'waveform' | 'slate';
  useHardwareEncoder: boolean;
  outputDir: string;
}

export type OutputPill = StemOutputPill;

export interface VortexApi {
  // ... existing methods
  selectMediaFiles: () => Promise<string[]>;
  probeLocalMedia: (filePath: string) => Promise<LocalMediaMetadata>;
  startConverterJob: (jobId: string, config: ConverterJobConfig) => Promise<{
    outputFilePath: string;
    pills: OutputPill[];
    usedSmartCopy?: boolean;
  }>;
}
```

---

## 3. Core Engine Pipeline (`electron/services/FfmpegRunner.ts`)

### 3.1 Metadata Probing (`probeLocalMedia`)
- Inspects container streams via `ffprobe` JSON output.
- Distinguishes true video streams from embedded album artwork (`attached_pic === 1` or mjpeg/png on audio extensions).
- Defaults `videoCodec` to `'none'`, `audioCodec` to `'none'`, and `sampleRate` to `0` when streams are absent.
- Extracts dimensions, framerate, duration, video codec, audio codec, and sample rate.

### 3.2 Conversion Matrix Execution (`executeConverterJob`)
- **Audio Invariants:**
  - All transcoded audio streams enforce 2-channel stereo downmix (`-ac 2`).
  - Integrated loudness normalization (`loudnorm=I=-14:TP=-1.0:LRA=11`) requires duration >= 3.0s. Micro-clips (< 3.0s) silently bypass loudnorm to prevent filtergraph stalls; dynamic range is preserved unchanged.
  - Video files with no audio track fail fast with an informative error if converted to audio targets, and pass `-an` during video transcode.
- **Smart Remuxing Path (`canSmartRemux`):**
  - Triggered when `config.smartCopy === true` and `config.normalizeLoudness === false`.
  - Allowed for MOV if video is H.264/HEVC/ProRes and audio is AAC/MP3/ALAC/PCM (or audio-less). Allowed for MP4 if video is H.264/HEVC and audio is AAC/MP3/ALAC (or audio-less).
  - Allowed for MKV for all streams.
  - Allowed for WEBM if video is VP8/VP9/AV1 and audio is Opus/Vorbis (or audio-less).
  - Remux maps explicit streams (`-map 0:v:0 -map 0:a? -sn -dn`).
  - Opportunistic execution: If `-c copy` fails, cleans up partial files and falls back automatically to full transcode.
- **Transcode Path:**
  - Video Target (WEBM): `libvpx-vp9` with `-row-mt 1 -cpu-used 4` and `libopus`.
  - Video Target (MP4/MOV/MKV): `h264_nvenc` (when GPU hardware toggle is active and validated via `hasEncoder`) or `libx264`, with `aac` audio.
  - GIF Target: Lanczos scaling to 640px, dual-branch `palettegen` + `paletteuse=dither=bayer:bayer_scale=5` at 15fps, clamped to maximum 30 seconds (`-t 30`). Audio to GIF is prohibited.
  - Audio Target: Extracts audio (`-vn`), applies sample rate (`-ar`), optional `loudnorm=I=-14:TP=-1.0:LRA=11`, and target codec (PCM 16-bit for WAV, LAME 320k for MP3, FLAC, AAC 320k for M4A, Vorbis for OGG).
  - Audio → Video: Synthesizes either `showwaves=s=1280x720:mode=cline:rate=30` or solid dark slate `color=c=0x09090B:s=1280x720:r=30`, mapped with input audio stream. Slate mode uses `-shortest` without fixed video duration so audio is never prematurely truncated.

---

## 4. State Management & Batch Execution (`src/store/useJobStore.ts`)
- `stagedConverterMedia: LocalMediaMetadata[]` holds queued files before submission.
- Multi-file drag-and-drop or file dialog staging with deduplication.
- `isConvertingBatch: boolean` mutex guards against concurrent batch submissions.
- `enqueueAndRunConverterJobs`: Submits staged items into active queue sequentially to avoid GPU/CPU resource contention.
- Aborting a running job breaks the batch loop immediately to prevent subsequent queued jobs from running.
- Switching to a video target automatically resets `converterNormalizeLoudness` to false to prevent accidental Smart Copy sabotage.

---

## 5. UI Architecture (`src/components/converter/ConverterModuleView.tsx`)
- Drag-and-drop dropzone with file picker button.
- Staged file list with metadata inspection badges (resolution, framerate, audio codec, sample rate, size).
- 4-way target format matrix: Video/animation containers (MP4, MOV, MKV, WEBM, GIF) vs Studio audio formats (WAV, MP3, FLAC, M4A, OGG).
- `.GIF` target button disabled when audio files are staged.
- Convert CTA disabled and displays progress indicator while `isConvertingBatch` is active.
- Conditional parameter controls:
  - Smart Copy toggle (video outputs only).
  - Sample rate (48kHz NLE vs 44.1kHz music) and -14 LUFS loudness toggle (audio targets only).
  - Audio-to-video visualizer mode (Live Waveform vs Studio Black Slate).
  - Hardware acceleration toggle (NVENC GPU vs CPU libx264).
- Integrated with shared `JobQueueList` for unified monitoring and native drag-and-drop to NLE timeline.
