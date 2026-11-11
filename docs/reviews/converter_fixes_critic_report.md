# EGM Stage 7 Critic Review Report: Universal Format Converter Fixes

**Status:** Reviewed by Hostile Design Critic (`egm-design`) and Technical Copy Editor (`egm-style`).  
**Target Document:** [`docs/specs/converter_module_spec.md`](file:///d:/CreatorVault/docs/specs/converter_module_spec.md)  
**Baseline Reports:**
- [`docs/reviews/converter_fixes_zoom_out_report.md`](file:///d:/CreatorVault/docs/reviews/converter_fixes_zoom_out_report.md)
- [`docs/reviews/converter_fixes_comprehension_report.md`](file:///d:/CreatorVault/docs/reviews/converter_fixes_comprehension_report.md)

---

## 1. Executive Summary

The Stage 7 Critic review evaluated the recently implemented fixes across system architecture, concurrency, thread blocking, container compatibility, filtergraph resilience, copy accuracy, and invariant consistency.

The audit revealed **2 Blockers (🔴)**, **5 Majors (🟡)**, and **5 Nits (🟢)**. Crucially, the Hostile Design Critic uncovered a subtle cancellation race condition during smart remux fallback (BLK-01) and confirmed the synchronous `spawnSync` event-loop block (BLK-02).

---

## 2. Combined Findings Matrix

| Severity | ID | Subsystem | Issue Summary | Discovered By |
|---|---|---|---|---|
| 🔴 Blocker | BLK-01 | `FfmpegRunner.ts:722` | Cancellation swallowed during remux error; transcode spawns unstoppable | Design Critic |
| 🔴 Blocker | BLK-02 | `FfmpegRunner.ts:457` | Synchronous `spawnSync(ffmpeg -i)` halts Node.js event loop on every job | Design Critic / Zoom Out |
| 🟡 Major | MAJ-01 | `FfmpegRunner.ts:662` | ProRes/PCM Smart Copy remux attempted on MP4 containers | Design / Copy / Zoom Out |
| 🟡 Major | MAJ-02 | `FfmpegRunner.ts:593` | WEBM transcode omits architectural `-ac 2` stereo downmix | Design / Copy / Zoom Out |
| 🟡 Major | MAJ-03 | `ConverterModuleView.tsx:437` | UI permits execution of invalid Audio → GIF conversion if GIF clicked first | Design / Copy / Zoom Out |
| 🟡 Major | MAJ-04 | `FfmpegRunner.ts:504` | UI progress message claims `-14 LUFS` when bypassed on micro-clips (`< 3s`) & evaluates sample rate to `NaN` | Copy Editor / Comprehension |
| 🟡 Major | MAJ-05 | `converter_module_spec.md:90` | Spec omits behavior when duration is `< 3.0s` for loudness normalization | Copy Editor |
| 🟢 Nit | NIT-01 | `FfmpegRunner.ts:574` | Audio → Video MP4/MOV syntheses omit `-movflags +faststart` | Design / Copy / Comprehension |
| 🟢 Nit | NIT-02 | `FfmpegRunner.ts:527` | GIF filtergraph uses `-1` height scaling with odd dimension risk | Design Critic |
| 🟢 Nit | NIT-03 | `FfmpegRunner.ts:589` | Waveform filtergraph maps unpinned `0:a` instead of `0:a:0?` | Design Critic |
| 🟢 Nit | NIT-04 | `ConverterModuleView.tsx:3` | Unused `ArrowLeftRight` icon import | Design / Copy / Zoom Out |
| 🟢 Nit | NIT-05 | `ConverterModuleView.tsx:374` | EBU R128 misattribution in normalization tooltip (-14 LUFS is online streaming standard) | Copy Editor |

---

## 3. Detailed Finding Profiles & Remediation Code

### 🔴 BLK-01: Remux Catch Swallows Cancellation and Spawns Unstoppable Transcode
- **Scope:** `electron/services/FfmpegRunner.ts:721-732`
- **Root Cause:** When `runFfmpegWithProgress` encounters user cancellation, `proc.on('close')` deletes `jobId` from `this.cancelledJobs` before rejecting with `'Job cancelled by user'`. In `executeConverterJob`:
  ```typescript
  } catch (remuxErr) {
    if (this.cancelledJobs.has(jobId)) throw remuxErr;
  ```
  Because `jobId` was already deleted from `cancelledJobs`, `has(jobId)` evaluates to `false`. The error is swallowed, and FFmpeg immediately launches the subsequent transcode process. Because `jobId` is no longer in `cancelledJobs`, the fallback transcode cannot be cancelled.
- **Remediation:**
  ```typescript
  } catch (remuxErr) {
    if (
      this.cancelledJobs.has(jobId) ||
      /cancelled by user/i.test((remuxErr as Error)?.message ?? '')
    ) {
      throw remuxErr;
    }
    // Clean up partial failed remux container and fall back to transcode
    if (fs.existsSync(outPath)) {
      try {
        fs.unlinkSync(outPath);
      } catch {
        // Ignore unlink error
      }
    }
  }
  ```

### 🔴 BLK-02: Synchronous `spawnSync` inside Async Job Path Halts Node Event Loop
- **Scope:** `electron/services/FfmpegRunner.ts:50-61, 455-458`
- **Root Cause:** `executeConverterJob` invokes `this.hasAudioStream(config.inputPath)`, which executes `spawnSync(ffmpeg, ['-i', ...])`. This synchronously freezes Node's single thread for up to 10 seconds per item, blocking IPC messages, window controls, and cancellation handlers.
- **Remediation:** Use probed metadata directly (`probeLocalMedia` already verified streams via ffprobe):
  ```typescript
  const inputHasAudio =
    config.mediaType === 'audio' ||
    (Boolean(config.audioCodec) && config.audioCodec.toLowerCase() !== 'none');
  ```

### 🟡 MAJ-01: ProRes / PCM Stream Remux Attempted on MP4 Container
- **Scope:** `electron/services/FfmpegRunner.ts:662-672`
- **Root Cause:** Standard MP4 containers reject Apple ProRes video tags and PCM audio tracks (`Could not find tag for codec...`). MOV natively supports both. Treating them identically causes an avoidable failed remux attempt, disk pollution, and UI stutter.
- **Remediation:** Decouple `mov` and `mp4` logic in `canSmartRemux`:
  ```typescript
  if (targetExt === 'mov') {
    const vOk = ['h264', 'avc1', 'hevc', 'h265', 'prores'].includes(vCodec);
    const aOk =
      !inputHasAudio ||
      ['aac', 'mp3', 'alac', 'pcm_s16le', 'pcm_s24le'].includes(aCodec);
    return vOk && aOk;
  }
  if (targetExt === 'mp4') {
    const vOk = ['h264', 'avc1', 'hevc', 'h265'].includes(vCodec);
    const aOk = !inputHasAudio || ['aac', 'mp3', 'alac'].includes(aCodec);
    return vOk && aOk;
  }
  ```

### 🟡 MAJ-02: WEBM Transcode Bypasses Stereo Downmix Invariant (`-ac 2`)
- **Scope:** `electron/services/FfmpegRunner.ts:592-595, 623-625, 777-786`
- **Root Cause:** While `buildAudioCodecArgs` enforces `-ac 2`, WEBM audio (`libopus`) bypasses `buildAudioCodecArgs` in three places, leaving 5.1/7.1 audio without stereo downmix.
- **Remediation:** Append `-ac 2` to all `libopus` encoder argument lists.

### 🟡 MAJ-03: UI Permits Execution of Prohibited Audio → GIF Conversion
- **Scope:** `src/components/converter/ConverterModuleView.tsx:437`
- **Root Cause:** If `.GIF` is clicked before staging an audio file, `converterTargetFormat` remains `'gif'`. The `.GIF` button disables, but the Convert CTA stays enabled.
- **Remediation:** Disable Convert CTA when audio is staged and target is GIF:
  ```tsx
  disabled={
    stagedConverterMedia.length === 0 ||
    isConvertingBatch ||
    (hasStagedAudio && converterTargetFormat === 'gif')
  }
  ```

### 🟡 MAJ-04: Status String Accuracy & NaN Guard
- **Scope:** `electron/services/FfmpegRunner.ts:504`
- **Root Cause:** Audio conversion status string displays `-14 LUFS` even when `safeDur < 3` (bypassed), and renders `NaNkHz` if `audioSampleRate` is undefined.
- **Remediation:**
  ```typescript
  const srKhz = ((config.audioSampleRate || 48000) / 1000).toFixed(1);
  const lufsTag = config.normalizeLoudness && safeDur >= 3 ? ' -14 LUFS' : '';
  `Converting to ${targetExt.toUpperCase()} (${srKhz}kHz${lufsTag})`
  ```

### 🟡 MAJ-05: Spec Clarification on Micro-Clip Loudness Bypass
- **Scope:** `docs/specs/converter_module_spec.md:90`
- **Remediation:** Explicitly state in spec: *"When duration is `< 3.0s`, the `loudnorm` filter is silently bypassed and audio dynamic range is preserved unchanged."*
