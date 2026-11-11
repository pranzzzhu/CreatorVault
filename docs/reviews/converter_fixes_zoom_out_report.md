# EGM Stage 5 Zoom-Out Audit: Universal Format Converter Fixes

**Verdict:** 🟢 **PASS WITH RESERVATIONS (0 Blockers, 3 Majors, 4 Nits)**  
**Target Document:** [`docs/specs/converter_module_spec.md`](file:///d:/CreatorVault/docs/specs/converter_module_spec.md)  
**Baseline Report:** [`docs/reviews/converter_consolidated_review_report.md`](file:///d:/CreatorVault/docs/reviews/converter_consolidated_review_report.md)  
**Persist Target:** `docs/reviews/converter_fixes_zoom_out_report.md`  

---

## 1. Action Items Verification Matrix (ACT-01 to ACT-12)

| Action Item | Target Scope | Audit Verdict | Analysis & Minimalist Assessment |
|---|---|---|---|
| **ACT-01** (Audio → GIF Guard) | `ConverterModuleView.tsx`, `FfmpegRunner.ts` | 🟡 Partial | Backend throws clean error; UI disables `.GIF` button. UI loophole remains if user selects `.GIF` before staging audio. |
| **ACT-02** (Silent Video Failures) | `FfmpegRunner.ts` | 🟢 Applied | Probes `'none'` for missing audio; audio extraction throws descriptive error; transcode passes `-an`; remux uses `-map 0:a?`. Synchronous re-probe is redundant. |
| **ACT-03** (Studio Slate Audio Truncation) | `FfmpegRunner.ts` | 🟢 Applied | Removed fixed `:d=${safeDur}` from lavfi color filter; relies on `-shortest` for natural audio-bound termination. |
| **ACT-04** (Uncapped GIF Generation) | `FfmpegRunner.ts` | 🟢 Applied | Clamps encode duration to `Math.min(safeDur, 30)` via `-t ${gifDur}` before `-i`. |
| **ACT-05** (Batch Mutex & Cancel Break) | `useJobStore.ts`, `ConverterModuleView.tsx` | 🟢 Applied | `isConvertingBatch` lock disables double-triggering; `break` on cancellation halts subsequent batch items cleanly. |
| **ACT-06** (Smart Copy ProRes/PCM & Fallback) | `FfmpegRunner.ts` | 🟡 Partial | ProRes/PCM and `-sn -dn` added; failed remux falls back to transcode. However, MP4 remux of ProRes/PCM is attempted and fails needlessly. |
| **ACT-07** (Stale Loudness State) | `useJobStore.ts` | 🟢 Applied | `setConverterTargetFormat` resets `converterNormalizeLoudness: false` when switching to video containers. |
| **ACT-08** (NVENC Availability Guard) | `FfmpegRunner.ts` | 🟢 Applied | `useNvenc` checks `this.hasEncoder('h264_nvenc')` before picking NVENC CLI arguments. |
| **ACT-09** (Spec Invariant Alignment) | `converter_module_spec.md` | 🟢 Applied | Added `-ac 2` stereo downmix invariant, `safeDur >= 3` LUFS threshold, dual-branch palette filtergraph, and batch lock. |
| **ACT-10** (VP9 Multi-Threading Flags) | `FfmpegRunner.ts` | 🟢 Applied | Appended `-row-mt 1 -cpu-used 4` to both WEBM encoding argument lists. |
| **ACT-11** (Probe Consolidation) | `FfmpegRunner.ts` | 🟢 Applied | `probeLocalVideo` delegates to `probeLocalMedia` without code duplication. |
| **ACT-12** (Output Pill Type Alias) | `src/types/media.ts` | 🟢 Applied | Exported `export type OutputPill = StemOutputPill`. |

---

## 2. Findings & Architectural Critique

### 🟡 MAJOR FINDINGS

#### 1. MP4 Container Remux Attempt on ProRes / PCM (Premature Failure Fallback)
- **Severity:** 🟡 Major
- **Affected Scope:** [`electron/services/FfmpegRunner.ts:662-678`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L662-L678)
- **Simplicity Rationale:**  
  In `canSmartRemux`, `mp4` and `mov` share identical criteria:
  ```typescript
  if (targetExt === 'mp4' || targetExt === 'mov') {
    const vOk = ['h264', 'avc1', 'hevc', 'h265', 'prores'].includes(vCodec);
    const aOk = !inputHasAudio || ['aac', 'mp3', 'alac', 'pcm_s16le', 'pcm_s24le'].includes(aCodec);
    return vOk && aOk;
  }
  ```
  Standard MP4 containers (`.mp4`) do NOT support ProRes video or PCM audio (`pcm_s16le`/`pcm_s24le`). When converting ProRes/PCM QuickTime files to MP4, FFmpeg fails immediately with `Could not find tag for codec...`. While the try/catch unlinks the failed file and falls back to transcode, this induces unnecessary disk I/O, event-loop latency, and UI progress stutter (remux starts, errors, then transcode starts).
- **Minimal Fix:** Separate MOV and MP4 checks:
  ```typescript
  if (targetExt === 'mov') {
    return ['h264', 'avc1', 'hevc', 'h265', 'prores'].includes(vCodec) &&
      (!inputHasAudio || ['aac', 'mp3', 'alac', 'pcm_s16le', 'pcm_s24le'].includes(aCodec));
  }
  if (targetExt === 'mp4') {
    return ['h264', 'avc1', 'hevc', 'h265'].includes(vCodec) &&
      (!inputHasAudio || ['aac', 'mp3', 'alac'].includes(aCodec));
  }
  ```

#### 2. UI Convert CTA Allows Invalid Audio → GIF Execution
- **Severity:** 🟡 Major
- **Affected Scope:** [`src/components/converter/ConverterModuleView.tsx:255, 437`](file:///d:/CreatorVault/src/components/converter/ConverterModuleView.tsx#L255-L256)
- **Simplicity Rationale:**  
  `isGifDisabled` only disables clicking the `.GIF` selector button after audio is staged. If the user selects `.GIF` before staging an audio file, `converterTargetFormat` remains `'gif'`. The `.GIF` button becomes disabled, but the active selection stays `.GIF` and the Convert button remains enabled (`Convert to .GIF (1)`). Clicking Convert fires the backend job, which fails with an error badge in the queue. The UI should prevent invalid job submission upfront.
- **Minimal Fix:** Disable Convert CTA or reset format:
  ```tsx
  disabled={stagedConverterMedia.length === 0 || isConvertingBatch || (hasStagedAudio && converterTargetFormat === 'gif')}
  ```

#### 3. WEBM Transcode Omits `-ac 2` Stereo Downmix Invariant
- **Severity:** 🟡 Major
- **Affected Scope:** [`electron/services/FfmpegRunner.ts:592, 623, 777`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L592-L593)
- **Simplicity Rationale:**  
  ACT-09 documented the architectural invariant: *"All transcoded audio streams enforce 2-channel stereo downmix (`-ac 2`)."* While `buildAudioCodecArgs` includes `-ac 2`, WEBM audio (`libopus`) bypasses `buildAudioCodecArgs` in three locations:
  ```typescript
  targetExt === 'webm' ? ['-c:a', 'libopus', '-b:a', '192k'] : buildAudioCodecArgs(...)
  ```
  Surround sound (5.1/7.1) sources converted to WEBM retain multi-channel layouts instead of standard stereo downmix.
- **Minimal Fix:** Append `-ac 2` to `libopus` arguments:
  ```typescript
  targetExt === 'webm' ? ['-c:a', 'libopus', '-b:a', '192k', '-ac', '2']
  ```

---

### 🟢 NIT FINDINGS

#### 1. Redundant Synchronous `hasAudioStream` Spawn
- **Severity:** 🟢 Nit
- **Affected Scope:** [`electron/services/FfmpegRunner.ts:457`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L457)
- **Simplicity Rationale:**  
  `probeLocalMedia` already inspected streams via `ffprobe` and set `audioCodec = 'none'` if absent. Evaluating `config.audioCodec !== 'none' && this.hasAudioStream(config.inputPath)` executes `spawnSync(ffmpeg, ['-i', ...])` on every staged video, blocking Node's main thread up to 10 seconds per item.
- **Minimal Fix:** Trust probed metadata:
  ```typescript
  const inputHasAudio = config.mediaType === 'audio' || config.audioCodec !== 'none';
  ```

#### 2. Missing Faststart on Audio → Video Outputs
- **Severity:** 🟢 Nit
- **Affected Scope:** [`electron/services/FfmpegRunner.ts:558-639`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L558-L639)
- **Simplicity Rationale:**  
  CASE 5 (Video Transcode) adds `-movflags +faststart` for MP4/MOV, but CASE 4 (Audio → Video) omits it, writing the moov atom at the end of the file.
- **Minimal Fix:** Include `...(targetExt === 'mp4' || targetExt === 'mov' ? ['-movflags', '+faststart'] : [])` in CASE 4 video encoder args.

#### 3. Unused Import in `ConverterModuleView.tsx`
- **Severity:** 🟢 Nit
- **Affected Scope:** [`src/components/converter/ConverterModuleView.tsx:3`](file:///d:/CreatorVault/src/components/converter/ConverterModuleView.tsx#L3)
- **Simplicity Rationale:** `ArrowLeftRight` is imported from `lucide-react` but never rendered.
- **Minimal Fix:** Delete unused import.

#### 4. Audio Status String NaN Guard
- **Severity:** 🟢 Nit
- **Affected Scope:** [`electron/services/FfmpegRunner.ts:504`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L504)
- **Simplicity Rationale:** `config.audioSampleRate / 1000` renders `NaNkHz` if `audioSampleRate` is undefined.
- **Minimal Fix:** Use `(config.audioSampleRate || 48000) / 1000`.

---

## 3. Senior Dev Scope & Risk Summary
- **Skipped / Deferred:** Custom channel mapping matrix (stereo downmix `-ac 2` handles 99% of creator use cases).
- **Remaining Risk:** Unseparated MP4 remux check burns 1-2s running an invalid FFmpeg command before transcode fallback on ProRes MOV files.
- **Conclusion:** Core architectural stability is verified; all 5 original blockers are eradicated. Resolve the 3 Majors for complete production readiness.
