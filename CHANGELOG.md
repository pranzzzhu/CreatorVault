# Changelog

All notable changes to **VORTEX (CreatorVault)** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-11

### Added
- **Module 4: Universal Format Converter (`converter`)**:
  - Full 4-way media format conversion matrix: Video-to-Video, Video-to-Audio, Audio-to-Audio, and Audio-to-Video.
  - Video output targets: MP4, MOV, MKV, WEBM, and animated high-fidelity 256-color palette GIF.
  - Audio output targets: WAV (48kHz/96kHz 16-bit studio master), MP3 (320k), FLAC (lossless), M4A (320k), and OGG (q8).
  - Smart Copy: Instant zero-loss container remuxing (`-c copy`) for compatible video/audio streams.
  - Audio-to-Video rendering with real-time dynamic waveform visualization (`showwaves`) or studio dark slate backdrop.
  - Optional EBU R128 (-14 LUFS) broadcast loudness normalization.
- **Direct Export Mode (Single-File Streamlining)**:
  - Jobs producing a single file (such as standalone video clips, single format conversions, or deflickered videos) export directly into the selected output directory without creating an extra subfolder.
  - Multi-file jobs (Demucs stem separation, Premiere XML cuts + jump-cut preview, IG Reel armored + compression preview) retain isolated subfolders.
- **Collision-Proof File Resolution (`FileUtils.ts`)**:
  - In-memory `activeReservedPaths` reservation set with `releaseFilePath()` to eliminate TOCTOU race conditions across parallel jobs.
  - Automated counter incrementing (`(1)`, `(2)`, `(3)`) preventing suffix stacking (`Clip (1) (1).mp4`).
  - Windows DOS reserved device name shielding (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) and trailing dot/whitespace stripping.
- **Plain-English UX & Language Redesign**:
  - Simplified all interface copy, tool descriptions, badges, and action buttons to accessible everyday English.
- **Node.js Self-Check Test Suite (`tests/self-check.test.mjs`)**:
  - 8 automated tests covering timestamp boundary rollovers, media protocol whitelisting, bitrate budgets, taskbar ratios, sub-second slider windows, collision resolution, silence chopper audio validation, and Premiere Pro XML timeline frame alignment.

### Changed
- Bumped application version to `0.2.0`.
- Updated Sidebar navigation to include Universal Converter.
- Upgraded release packaging configuration and asset creation.

---

## [0.1.1] - 2026-11-08

### Added
- **Social Compression Armor & IG Reel Optimizer (`reel-optimizer`)**:
  - New 5th pipeline in Module 2 (Video Fixer & Proxy Deck), positioned as Preset 1 (flagship card).
  - 1080×1920 9:16 Lanczos downscaling with safe even-dimension padding (`trunc((ow-iw)/4)*2` and `trunc((oh-ih)/4)*2`) to guarantee YUV420p chroma plane alignment.
  - High-frequency temporal denoising pass (`hqdn3d=1.5:1.5:3:3`) via **Grain Saver** toggle to eliminate macroblock artifacts under aggressive mobile platform transcoding.
  - Edge pre-emphasis (`unsharp`) with **Subtle** (`unsharp=3:3:0.5:3:3:0.0`) and **Crisp** (`unsharp=3:3:0.85:3:3:0.0`) presets to offset platform blurring on text, hair, and high-contrast edges.
  - Strict Constant Frame Rate (CFR) locking across 30 fps, 60 fps, and Source (`fps=<probed>`) to eliminate mobile VFR stutter.
  - Broadcast-master `libx264` slow encoding (CRF 18, 12M maxrate, 24M buffer, AQ mode 3, dynamic 2-second keyframe intervals with scene-cut detection enabled).
  - Hardware GPU acceleration toggle with explicit `h264_nvenc` cascade (`p5`, `vbr`, `cq 18`, `-g <keyint>`).
  - Rec.709 color space metadata tagging (`bt709 tv`, SDR sources) to prevent mobile gamma shifts and washed-out contrast.
  - Audio loudness normalization (`loudnorm=I=-14:TP=-1.0:LRA=11` + AAC 320k 48kHz) with short-clip (<3s) safety bypass and silent-video detection (`-an`).
  - Optional constrained platform transcode simulation (3.5 Mbps CRF 25) with dual-stream VMAF perceptual retention measurement (native SSIM fallback) emitting a secondary preview pill (`Simulated_IG_Constrained.mp4`).
- **Elephant-Goldfish Model (EGM) Audit Remediation**:
  - Full architectural verification across 7 reviewer personas.
  - Complete cancellation propagation: aborting during simulation or metric calculation re-throws `/cancel/i` and halts process trees cleanly.
  - Automated Windows stdout pipe draining (`proc.stdout?.resume()`) to prevent 64KB deadlock.
  - Dedicated architectural specification: [`docs/specs/social_compression_armor_spec.md`](./docs/specs/social_compression_armor_spec.md).

### Changed
- Bumped application version to `0.1.1`.
- Made `reel-optimizer` the default selected preset on Module 2 load.
- Updated `.gitignore` to prevent archive blobs (`*.7z`, `*.zip`) from polluting repository history.

---

## [0.1.0] - 2026-11-07

### Added
- Initial release of VORTEX (CreatorVault) Desktop Media Engine.
- Module 1: Universal Ripper, Clipper & Demucs Stem Lab (2-stem and 4-stem HTDemucs).
- Module 2: FFmpeg Video Fixer & Proxy Deck (LED Deflicker, Target Size Compressor, Silence Chopper Premiere XML, ProRes 422 Proxy).
- Module 3: Vectorizer, Background Remover (U2Net ONNX) & Super-Resolution Upscaler (Real-ESRGAN).
- 7-engine sidecar manager with 1-click in-app installer and native OS drag-to-timeline pills.
