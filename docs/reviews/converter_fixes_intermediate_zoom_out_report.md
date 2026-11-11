# EGM Stage 8: Intermediate Zoom-Out Architecture Review
**Target:** [`docs/specs/converter_module_spec.md`](file:///d:/CreatorVault/docs/specs/converter_module_spec.md)  
**Verdict:** 🔴 **NO-GO (Blocked on 2 Blockers & 3 Majors)**

---

## 1. Cross-Examination & De-Duplication Verdict

Audited all findings across Stage 5 (Zoom-Out), Stage 6 (Comprehension), and Stage 7 (Critic):

| Finding ID | Scope | Cross-Examination Verdict | Status |
|---|---|---|---|
| **BLK-01** | `FfmpegRunner.ts:722` | Confirmed. `proc.on('close')` deletes `jobId` from `cancelledJobs`. Catch checks `has(jobId)`, evaluates false, swallows cancellation error, spawns unstoppable transcode. | 🔴 Blocker |
| **BLK-02** | `FfmpegRunner.ts:457` | Confirmed. `hasAudioStream()` runs `spawnSync(ffmpeg -i)` on main Node thread. Freezes Electron event loop up to 10s per file. Blocks UI and IPC cancellation. Redundant with `probeLocalMedia`. | 🔴 Blocker |
| **MAJ-01** | `FfmpegRunner.ts:662` | Confirmed. Standard MP4 container rejects ProRes video and PCM audio. Attempting `-c copy` fails FFmpeg every time on ProRes/PCM, creates temp file churn, then falls back. MOV natively supports both. | 🟡 Major |
| **MAJ-02** | `FfmpegRunner.ts:592, 623, 777` | Confirmed. Spec section 3.2 mandates `-ac 2` stereo downmix invariant. All 3 WEBM paths (`libopus`) bypass `buildAudioCodecArgs` and omit `-ac 2`. 5.1/7.1 audio breaks. | 🟡 Major |
| **MAJ-03** | `ConverterModuleView.tsx:437` | Confirmed. Selecting GIF before staging audio leaves GIF selected. CTA stays clickable. Submits invalid job that crashes backend. | 🟡 Major |
| **MAJ-04** | `FfmpegRunner.ts:504` | Confirmed. Audio status message logs `NaNkHz` when sample rate unprobed, and claims `-14 LUFS` even when micro-clip (`<3s`) bypassed filter. | 🟡 Major |
| **MAJ-05** | `converter_module_spec.md:90` | Confirmed. Spec states loudness normalization requires `>= 3.0s` but leaves failure/bypass behavior unstated. | 🟡 Major |
| **NIT-01..06** | `FfmpegRunner.ts`, `ConverterModuleView.tsx`, `media.ts` | Valid polish: faststart flag on audio-to-video, GIF `-2` height, pinned stream `0:a:0`, unused import, tooltip copy, type alias. | 🟢 Nit |

### Discarded Scope Creep / Non-Issues
- **Custom audio channel matrix mapping**: Dismissed as YAGNI. Stereo downmix (`-ac 2`) satisfies 99% of creator workflows.
- **Child process manager wrapper class**: Dismissed. One regex line check fixes the cancellation race without adding abstractions.
- **Redundant probe on file conversion**: Dismissed. Pre-flight probe data is trustworthy.

---

## 2. Minimal Remediation Prescriptions

### 🔴 BLK-01: Fix Cancellation Swallowing in Remux Catch
[`electron/services/FfmpegRunner.ts:721-725`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L721-L725)
```typescript
      } catch (remuxErr) {
        if (
          this.cancelledJobs.has(jobId) ||
          /cancelled by user/i.test((remuxErr as Error)?.message ?? '')
        ) {
          throw remuxErr;
        }
        // Clean up partial failed remux container and fall back to transcode
```

### 🔴 BLK-02: Eradicate Synchronous `spawnSync` from Async Path
[`electron/services/FfmpegRunner.ts:455-458`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L455-L458)
```typescript
    const inputHasAudio =
      config.mediaType === 'audio' ||
      (Boolean(config.audioCodec) && config.audioCodec.toLowerCase() !== 'none');
```
*Action: Delete unused `private hasAudioStream(filePath: string)` entirely.*

### 🟡 MAJ-01: Decouple MOV and MP4 in `canSmartRemux`
[`electron/services/FfmpegRunner.ts:662-668`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L662-L668)
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

### 🟡 MAJ-02: Enforce `-ac 2` on All WEBM Opus Transcodes
[`electron/services/FfmpegRunner.ts:592-594, 623-625, 782-786`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L592-L594)
```typescript
// Lines 592-594 & 623-625:
targetExt === 'webm'
  ? ['-c:a', 'libopus', '-b:a', '192k', '-ac', '2']
  : ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2'],

// Lines 782-786:
'-c:a', 'libopus', '-b:a', '192k', '-ac', '2'
```

### 🟡 MAJ-03: Guard UI Convert Button Against Prohibited Audio → GIF
[`src/components/converter/ConverterModuleView.tsx:437`](file:///d:/CreatorVault/src/components/converter/ConverterModuleView.tsx#L437)
```tsx
disabled={
  stagedConverterMedia.length === 0 ||
  isConvertingBatch ||
  (hasStagedAudio && converterTargetFormat === 'gif')
}
```

### 🟡 MAJ-04: Status String Precision & NaN Guard
[`electron/services/FfmpegRunner.ts:504`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L504)
```typescript
const srKhz = ((config.audioSampleRate || 48000) / 1000).toFixed(1);
const lufsTag = config.normalizeLoudness && safeDur >= 3 ? ' -14 LUFS' : '';
const statusMsg = `Converting to ${targetExt.toUpperCase()} (${srKhz}kHz${lufsTag})`;
```

### 🟡 MAJ-05: Spec Invariant for Micro-Clip Loudness Bypass
[`docs/specs/converter_module_spec.md:90`](file:///d:/CreatorVault/docs/specs/converter_module_spec.md#L90)
Update section 3.2:
`- Integrated loudness normalization (loudnorm=I=-14:TP=-1.0:LRA=11) requires duration >= 3.0s. Micro-clips (< 3.0s) silently bypass loudnorm to prevent filtergraph stalls; dynamic range is preserved unchanged.`

---

## 3. Nits Clean-Up Plan (Single Sweep)
1. [`FfmpegRunner.ts:574`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L574): Add `...(targetExt === 'mp4' || targetExt === 'mov' ? ['-movflags', '+faststart'] : [])` to Audio → Video `vEncoderArgs`.
2. [`FfmpegRunner.ts:527`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L527): Change GIF scale to `scale=640:-2:flags=lanczos` (prevent odd pixel dimension errors).
3. [`FfmpegRunner.ts:590`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts#L590): Pin audio stream `-map 0:a:0`.
4. [`ConverterModuleView.tsx:3`](file:///d:/CreatorVault/src/components/converter/ConverterModuleView.tsx#L3): Delete unused import `ArrowLeftRight`.
5. [`ConverterModuleView.tsx:374`](file:///d:/CreatorVault/src/components/converter/ConverterModuleView.tsx#L374): Tooltip update: `"Normalizes audio loudness to streaming standard -14 LUFS (YouTube / Spotify)"`.
6. [`src/types/media.ts:301`](file:///d:/CreatorVault/src/types/media.ts#L301) & [`converter_module_spec.md:71`](file:///d:/CreatorVault/docs/specs/converter_module_spec.md#L71): Change return signature `pills: StemOutputPill[]` to `pills: OutputPill[]`.

---

Skipped: Custom channel routing UI and complex process supervisor wrappers.
Risk: Applying transcode fallback without BLK-01 fix lets cancelled jobs run in background, consuming CPU/GPU and leaving orphaned output files.
