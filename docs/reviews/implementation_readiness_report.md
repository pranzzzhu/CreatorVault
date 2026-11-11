# Stage 9: Implementation Readiness Report

**Target Document:** `D:\CreatorVault\docs\specs\v0.1.2_patch_spec.md`  
**Evaluator:** Implementation Readiness Goldfish (Tech Lead & Implementing Engineer)  
**Date:** 2026-11-10  
**Verdict:** 🔴 **BLOCKED** — Spec contains critical contradictions and execution hazards requiring resolution before release.

---

## Executive Summary

| Category | Count | Status |
| :--- | :---: | :--- |
| 🔴 **Blockers** | 1 | Fix 6B in spec contains no-op code and marks required IPC handler as "optional". |
| 🟡 **Majors** | 4 | Remux vs transcode codec mismatch, unhandled cancellation on retry, non-atomic binary write, FFmpeg CAS alpha crash. |
| 🟢 **Nits** | 4 | Instruction typos, outdated `installHint`, version mismatch in `package.json`, silent retry UX. |

---

## Detailed Findings

### 🔴 Blockers

#### 1. Contradictory Fix 6B Spec & No-Op Replacement Code
- **Affected Scope:** `v0.1.2_patch_spec.md` (Lines 236–247, Fix 6B: Titlebar Overlay Theme)
- **Finding & Guidance:**
  - **Hurdle:** Spec states problem is "Windows titlebar buttons remain pitch black in Light mode." However, provided code replacement in Section 6B pastes identical dark values:
    ```typescript
    titleBarOverlay: { color: '#050505', symbolColor: '#A1A1AA', height: 36 }
    ```
  - **Hurdle:** The actual required fix (`window:set-theme` IPC listener) is relegated to an italicized note marked *"Optional IPC listener can be added..."*.
  - **Codebase Reality:** The codebase already implements the listener in `main.ts` (lines 210–222), `preload.ts` (line 43), and `useJobStore.ts` (lines 197–202).
  - **Resolution:** Spec must be updated to mandate the `window:set-theme` IPC handler as the core fix rather than a no-op window configuration.

---

### 🟡 Majors

#### 2. YouTube 4K/1440p `--remux-video mp4` Does Not Transcode VP9/AV1
- **Affected Scope:** `v0.1.2_patch_spec.md` (Lines 26–36) & `YtDlpRunner.ts` (Lines 324–332)
- **Finding & Guidance:**
  - **Hurdle:** Spec states `--remux-video mp4` lets FFmpeg "transcode to H.264 MP4". In reality, yt-dlp `--remux-video` runs stream copy (`-c copy`).
  - **Technical Consequence:** MP4 natively supports VP9 (`vp09`) and AV1 (`av01`). FFmpeg copies VP9 into an MP4 container without transcoding to H.264. Premiere Pro and older Windows NLEs fail or glitch on VP9 inside MP4.
  - **Badge Mismatch:** `YtDlpRunner.defaultQualities` claims `H.264 / MP4`, misleading the editor.
  - **Resolution:** Either use `--recode-video mp4` (forces H.264 transcode) or correct badge and spec to `VP9 / MP4 (Remuxed)`.

#### 3. Unchecked Job Cancellation During Cookie-Lock Retry Spawns Rogue Process
- **Affected Scope:** `v0.1.2_patch_spec.md` (Lines 97–114) & `YtDlpRunner.ts` (Lines 484–498)
- **Finding & Guidance:**
  - **Hurdle:** When cookie lock occurs, `executeDownload()` recursively calls itself. `executeDownload()` lacks an entry guard checking `this.cancelledJobs.has(jobId)`.
  - **Technical Consequence:** If user cancels during failure handling, the new yt-dlp process spawns anyway and downloads fully in background.
  - **Resolution:** Add entry guard in `executeDownload`:
    ```typescript
    if (this.cancelledJobs.has(jobId)) {
      this.cancelledJobs.delete(jobId);
      throw new Error('Job cancelled by user');
    }
    ```

#### 4. Non-Atomic Download of `yt-dlp.exe` Causes `EBUSY` Crashes
- **Affected Scope:** `v0.1.2_patch_spec.md` (Lines 146–160) & `BinaryManager.ts` (Lines 440–453)
- **Finding & Guidance:**
  - **Hurdle:** `fs.writeFileSync(targetPath, buffer)` writes directly to `bin/yt-dlp.exe`.
  - **Technical Consequence:** If `yt-dlp.exe` is running, held by indexer, or scanned by Windows Defender, write fails with `EBUSY`. If download is aborted, destination binary is left empty or corrupted.
  - **Resolution:** Download to `bin/yt-dlp.exe.tmp` and replace via `fs.renameSync()`. Catch `EBUSY` with specific error message.

#### 5. FFmpeg CAS Filter Crashes on Transparent PNG Upscale Fallback
- **Affected Scope:** `VectorRunner.ts` (Lines 629–638)
- **Finding & Guidance:**
  - **Hurdle:** When Spandrel/PyTorch is unavailable, `runAssetUpscaler()` falls back to FFmpeg with `cas=strength=0.65`.
  - **Technical Consequence:** FFmpeg `cas` (Contrast Adaptive Sharpening) filter does not accept alpha channels (`rgba`). Upscaling transparent cutout PNGs from `rmbg` crashes FFmpeg.
  - **Resolution:** Use `unsharp=5:5:0.8:5:5:0.0` alone for alpha inputs or extract alpha before applying `cas`.

---

### 🟢 Nits

#### 6. Spec Instruction Typo in Fix 1
- **Affected Scope:** `v0.1.2_patch_spec.md` (Line 13)
- **Finding:** Mentions locating `defaultQualities` method when replacement block targets `executeDownload()`.
- **Resolution:** Update instruction text to reference `executeDownload()`.

#### 7. Outdated `installHint` for `yt-dlp` in Diagnostics
- **Affected Scope:** `BinaryManager.ts` (Line 365)
- **Finding:** Still displays `installHint: 'pip install -U yt-dlp'`, conflicting with standalone binary installer.
- **Resolution:** Change hint to `'Click 1-Click Install or place yt-dlp in ./bin'`.

#### 8. Version String Mismatch in `package.json`
- **Affected Scope:** `package.json` (Line 3)
- **Finding:** Version is `"0.1.1"` instead of `"0.1.2"`.
- **Resolution:** Bump version field to `"0.1.2"`.

#### 9. Silent Cookie Fallback UX
- **Affected Scope:** `YtDlpRunner.ts` (Line 492)
- **Finding:** Fallback retries without updating UI status message.
- **Resolution:** Emit `statusMessage: 'Browser cookies locked. Retrying anonymously...'` before retry.

---

## Codebase Alignment & Implementation Status Matrix

| Fix # | Target File | Spec Accuracy | Codebase Status | Verdict |
| :---: | :--- | :---: | :---: | :---: |
| **Fix 1** | `electron/services/YtDlpRunner.ts` | 🟡 Flawed (remux != transcode) | Implemented | Major finding |
| **Fix 2** | `electron/services/YtDlpRunner.ts` | 🟡 Missing cancel check | Implemented | Major finding |
| **Fix 3** | `electron/services/YtDlpRunner.ts` | 🟢 Exact | Cleanly removed | Ready |
| **Fix 4** | `electron/services/BinaryManager.ts` | 🟡 Non-atomic write | Implemented | Major finding |
| **Fix 5** | `electron/services/VectorRunner.ts` | 🟡 Fallback CAS bug | Implemented | Major finding |
| **Fix 6A** | `src/components/ripper/JobQueueList.tsx` | 🟢 Exact | Implemented | Ready |
| **Fix 6B** | `electron/main.ts` | 🔴 Broken / No-op in spec | Codebase has working IPC | Blocker finding |

---

## Action Plan for Production Readiness

1. **Update Spec Document (`v0.1.2_patch_spec.md`):**
   - Rewrite Section 6B to document `window:set-theme` IPC handler as mandatory.
   - Correct Section 1 explanation regarding VP9 remuxing vs H.264 transcoding.
2. **Apply 3 Surgical Hardening Patches:**
   - Add cancellation guard at top of `YtDlpRunner.executeDownload()`.
   - Use atomic `.tmp` file write in `BinaryManager.installBinary('yt-dlp')`.
   - Guard `cas` filter against RGBA inputs in `VectorRunner.runAssetUpscaler()`.
3. **Bump package version** to `0.1.2`.
