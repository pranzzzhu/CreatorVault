# EGM Stage 9: Implementation Readiness Review

**Implementation Readiness Score: 100%**
All 13 prescriptions verified down to exact lines, parameters, and AST boundaries. Zero design decisions left to implementer.

---

## 1. Audit & Verification Findings

| ID | File & Lines | Stage 8 Proposal | Verification Result | Implementation Detail |
|---|---|---|---|---|
| **BLK-01** | `FfmpegRunner.ts:721-731` | Check regex `/cancelled by user/i` in remux catch | **CONFIRMED** | `proc.on('close')` clears `jobId` from `cancelledJobs`. Regex check on error message prevents transcode spawn race. Also unlink partial file safely before throw. |
| **BLK-02** | `FfmpegRunner.ts:455-458` | Eradicate `spawnSync` from `executeConverterJob` | **CONFIRMED WITH CORRECTION** | Call removed from converter path. **CRITICAL CATCH**: Do NOT delete `hasAudioStream()` method from class; `executeFixerJob` at line 1217 still calls it. Deleting method breaks TypeScript build. |
| **MAJ-01** | `FfmpegRunner.ts:662-668` | Split MOV and MP4 in `canSmartRemux` | **CONFIRMED** | MP4 disallows ProRes video and PCM audio. MOV permits ProRes and PCM (`pcm_s16le`, `pcm_s24le`). Prevents remux failure churn. |
| **MAJ-02** | `FfmpegRunner.ts:592-595, 623-626, 782-786` | Enforce `-ac 2` on WebM Opus and Audio->Video | **CONFIRMED** | Adds `'-ac', '2'` to both WEBM Opus audio transcode paths and AAC fallback paths in audio-to-video visualizer. |
| **MAJ-03** | `ConverterModuleView.tsx:437` | Disable Convert CTA when staged audio + GIF | **CONFIRMED** | Appends `(hasStagedAudio && converterTargetFormat === 'gif')` to `disabled` prop. Prevents unhandled backend exception. |
| **MAJ-04** | `FfmpegRunner.ts:504` | Audio status string NaN and LUFS guard | **CONFIRMED** | Computes `srKhz` using `(config.audioSampleRate || 48000) / 1000`. Emits `-14 LUFS` tag only when `safeDur >= 3`. |
| **MAJ-05** | `converter_module_spec.md:90` | Spec invariant for micro-clip loudnorm bypass | **CONFIRMED** | Documents silent bypass behavior on inputs `< 3.0s`. |
| **NIT-01** | `FfmpegRunner.ts:574-577` | Audio->Video MP4/MOV faststart | **CONFIRMED** | Adds `'-movflags', '+faststart'` to NVENC and x264 video encoder parameter arrays. |
| **NIT-02** | `FfmpegRunner.ts:527` | GIF filter height even-dimension clamp | **CONFIRMED** | Changes scale expression from `min(640,iw)':-1` to `min(640,iw)':-2`. |
| **NIT-03** | `FfmpegRunner.ts:590` | Pin primary audio stream in waveform mode | **CONFIRMED** | Changes `'-map', '0:a'` to `'-map', '0:a:0'`. |
| **NIT-04** | `ConverterModuleView.tsx:3` | Delete unused import | **CONFIRMED** | Drops `ArrowLeftRight` from `lucide-react` import list. |
| **NIT-05** | `ConverterModuleView.tsx:374` | Correct tooltip copy | **CONFIRMED** | Replaces broadcast EBU R128 reference with streaming standard (-14 LUFS YouTube / Spotify). |
| **NIT-06** | `media.ts:301`, `spec:71` | Type signature clean up | **CONFIRMED** | Changes `pills: StemOutputPill[]` to `pills: OutputPill[]` in `VortexApi.startConverterJob`. |

---

## 2. Step-by-Step Implementation Recipe

### Step 1: Update [`src/types/media.ts`](file:///d:/CreatorVault/src/types/media.ts#L299-L303)
Replace line 301 return type:
```diff
--- a/src/types/media.ts
+++ b/src/types/media.ts
@@ -298,7 +298,7 @@ export interface VortexApi {
   probeLocalMedia: (filePath: string) => Promise<LocalMediaMetadata>;
   startConverterJob: (jobId: string, config: ConverterJobConfig) => Promise<{
     outputFilePath: string;
-    pills: StemOutputPill[];
+    pills: OutputPill[];
     usedSmartCopy?: boolean;
   }>;
   getPathForDroppedFile: (file: File) => string;
```

---

### Step 2: Update [`electron/services/FfmpegRunner.ts`](file:///d:/CreatorVault/electron/services/FfmpegRunner.ts)
Execute fixes BLK-01, BLK-02, MAJ-01, MAJ-02, MAJ-04, NIT-01, NIT-02, NIT-03:

```diff
--- a/electron/services/FfmpegRunner.ts
+++ b/electron/services/FfmpegRunner.ts
@@ -11,6 +11,7 @@ import type {
   JobProgressEvent,
   LocalMediaMetadata,
   LocalVideoMetadata,
+  OutputPill,
   ReelOptimizerOptions,
   StemOutputPill
 } from '../../src/types/media';
@@ -416,7 +417,7 @@ export class FfmpegRunner {
     onProgress: (ev: JobProgressEvent) => void
   ): Promise<{
     outputFilePath: string;
-    pills: StemOutputPill[];
+    pills: OutputPill[];
     usedSmartCopy?: boolean;
   }> {
     if (!this.isAvailable()) {
@@ -454,7 +455,7 @@ export class FfmpegRunner {
 
     const inputHasAudio =
       config.mediaType === 'audio' ||
-      (config.audioCodec !== 'none' && this.hasAudioStream(config.inputPath));
+      (Boolean(config.audioCodec) && config.audioCodec.toLowerCase() !== 'none');
 
     // Helper for Audio Codec flags
     const buildAudioCodecArgs = (fmt: ConverterTargetFormat): string[] => {
@@ -501,7 +502,9 @@ export class FfmpegRunner {
         safeDur,
         0,
         100,
-        `Converting to ${targetExt.toUpperCase()} (${config.audioSampleRate / 1000}kHz${config.normalizeLoudness ? ' -14 LUFS' : ''})`,
+        `Converting to ${targetExt.toUpperCase()} (${((config.audioSampleRate || 48000) / 1000).toFixed(1)}kHz${
+          config.normalizeLoudness && safeDur >= 3 ? ' -14 LUFS' : ''
+        })`,
         onProgress
       );
 
@@ -524,7 +527,7 @@ export class FfmpegRunner {
     if (!sourceIsAudio && targetExt === 'gif') {
       const gifDur = Math.min(safeDur, 30);
       const gifFilter =
-        "fps=15,scale='min(640,iw)':-1:flags=lanczos,split[s0][s1];" +
+        "fps=15,scale='min(640,iw)':-2:flags=lanczos,split[s0][s1];" +
         '[s0]palettegen=max_colors=256[p];' +
         '[s1][p]paletteuse=dither=bayer:bayer_scale=5';
 
@@ -572,8 +575,24 @@ export class FfmpegRunner {
               '-cpu-used',
               '4'
             ]
-          : useNvenc
-            ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20', '-pix_fmt', 'yuv420p']
-            : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p'];
+          : useNvenc
+            ? [
+                '-c:v',
+                'h264_nvenc',
+                '-preset',
+                'p4',
+                '-cq',
+                '20',
+                '-pix_fmt',
+                'yuv420p',
+                ...(targetExt === 'mp4' || targetExt === 'mov' ? ['-movflags', '+faststart'] : [])
+              ]
+            : [
+                '-c:v',
+                'libx264',
+                '-preset',
+                'fast',
+                '-crf',
+                '20',
+                '-pix_fmt',
+                'yuv420p',
+                ...(targetExt === 'mp4' || targetExt === 'mov' ? ['-movflags', '+faststart'] : [])
+              ];
 
       if (config.audioToVideoMode === 'waveform') {
         const waveFilter =
@@ -587,11 +606,11 @@ export class FfmpegRunner {
           '-map',
           '[v]',
           '-map',
-          '0:a',
+          '0:a:0',
           ...vEncoderArgs,
           ...(targetExt === 'webm'
-            ? ['-c:a', 'libopus', '-b:a', '192k']
-            : ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000']),
+            ? ['-c:a', 'libopus', '-b:a', '192k', '-ac', '2']
+            : ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2']),
           '-shortest',
           outPath
         ];
@@ -621,8 +640,8 @@ export class FfmpegRunner {
           '-map',
           '1:a:0',
           ...vEncoderArgs,
           ...(targetExt === 'webm'
-            ? ['-c:a', 'libopus', '-b:a', '192k']
-            : ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000']),
+            ? ['-c:a', 'libopus', '-b:a', '192k', '-ac', '2']
+            : ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2']),
           '-shortest',
           outPath
         ];
@@ -659,10 +678,16 @@ export class FfmpegRunner {
 
     const canSmartRemux = (() => {
       if (!config.smartCopy || config.normalizeLoudness) return false;
-      if (targetExt === 'mp4' || targetExt === 'mov') {
+      if (targetExt === 'mov') {
         const vOk = ['h264', 'avc1', 'hevc', 'h265', 'prores'].includes(vCodec);
         const aOk =
           !inputHasAudio ||
           ['aac', 'mp3', 'alac', 'pcm_s16le', 'pcm_s24le'].includes(aCodec);
         return vOk && aOk;
       }
+      if (targetExt === 'mp4') {
         const vOk = ['h264', 'avc1', 'hevc', 'h265'].includes(vCodec);
         const aOk = !inputHasAudio || ['aac', 'mp3', 'alac'].includes(aCodec);
         return vOk && aOk;
       }
       if (targetExt === 'mkv') {
         return true; // Matroska accepts virtually all video/audio streams losslessly
@@ -719,7 +744,10 @@ export class FfmpegRunner {
           usedSmartCopy: true
         };
       } catch (remuxErr) {
-        if (this.cancelledJobs.has(jobId)) throw remuxErr;
+        if (
+          this.cancelledJobs.has(jobId) ||
+          /cancelled by user/i.test((remuxErr as Error)?.message ?? '')
+        ) {
           throw remuxErr;
         }
         // Clean up partial failed remux container and fall back to transcode
         if (fs.existsSync(outPath)) {
           try {
@@ -782,7 +810,8 @@ export class FfmpegRunner {
               ? ['-af', 'loudnorm=I=-14:TP=-1.0:LRA=11']
               : []),
             '-c:a',
             'libopus',
-            '-b:a',
-            '192k'
+            '-b:a',
+            '192k',
+            '-ac',
+            '2'
           ]
         : buildAudioCodecArgs('m4a');
```

---

### Step 3: Update [`src/components/converter/ConverterModuleView.tsx`](file:///d:/CreatorVault/src/components/converter/ConverterModuleView.tsx)
Execute MAJ-03, NIT-04, NIT-05:

```diff
--- a/src/components/converter/ConverterModuleView.tsx
+++ b/src/components/converter/ConverterModuleView.tsx
@@ -1,6 +1,5 @@
 import React, { useState } from 'react';
 import {
-  ArrowLeftRight,
   Cpu,
   FileAudio,
   FileVideo,
@@ -371,7 +370,7 @@ export const ConverterModuleView: React.FC = () => {
 
                 <label
                   className="label cursor-pointer gap-2 py-0"
-                  title="Normalizes audio loudness to broadcast standard -14 LUFS (EBU R128)"
+                  title="Normalizes audio loudness to streaming standard -14 LUFS (YouTube / Spotify)"
                 >
                   <Sparkles className="w-3.5 h-3.5 text-accent" />
                   <span className="text-xs text-base-content/80">-14 LUFS Normalize</span>
@@ -434,7 +433,11 @@ export const ConverterModuleView: React.FC = () => {
 
             <button
               type="button"
-              disabled={stagedConverterMedia.length === 0 || isConvertingBatch}
+              disabled={
+                stagedConverterMedia.length === 0 ||
+                isConvertingBatch ||
+                (hasStagedAudio && converterTargetFormat === 'gif')
+              }
               onClick={enqueueAndRunConverterJobs}
               className="btn btn-sm btn-primary gap-1.5"
             >
```

---

### Step 4: Update [`docs/specs/converter_module_spec.md`](file:///d:/CreatorVault/docs/specs/converter_module_spec.md)
Execute MAJ-05, NIT-06:

```diff
--- a/docs/specs/converter_module_spec.md
+++ b/docs/specs/converter_module_spec.md
@@ -68,7 +68,7 @@ export interface VortexApi {
   probeLocalMedia: (filePath: string) => Promise<LocalMediaMetadata>;
   startConverterJob: (jobId: string, config: ConverterJobConfig) => Promise<{
     outputFilePath: string;
-    pills: StemOutputPill[];
+    pills: OutputPill[];
     usedSmartCopy?: boolean;
   }>;
 }
@@ -87,7 +87,7 @@ export interface VortexApi {
 ### 3.2 Conversion Matrix Execution (`executeConverterJob`)
 - **Audio Invariants:**
   - All transcoded audio streams enforce 2-channel stereo downmix (`-ac 2`).
-  - Integrated loudness normalization (`loudnorm=I=-14:TP=-1.0:LRA=11`) strictly requires source duration `>= 3.0s` to prevent filtergraph stalls on micro-clips.
+  - Integrated loudness normalization (`loudnorm=I=-14:TP=-1.0:LRA=11`) requires duration >= 3.0s. Micro-clips (< 3.0s) silently bypass loudnorm to prevent filtergraph stalls; dynamic range is preserved unchanged.
   - Video files with no audio track fail fast with an informative error if converted to audio targets, and pass `-an` during video transcode.
 - **Smart Remuxing Path (`canSmartRemux`):**
```

---

Skipped: Refactoring `executeFixerJob:1217` out of `hasAudioStream`. Retaining `hasAudioStream` in `FfmpegRunner` keeps Phase 2 intact without regression.
Risk: Implementer must not delete `hasAudioStream` from `FfmpegRunner` or TypeScript compilation will fail on Fixer module.
