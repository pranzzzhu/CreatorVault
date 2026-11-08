# Stage 9: Implementation Readiness Report

**Target Document:** `D:\CreatorVault\docs\specs\social_compression_armor_spec.md` (Lines 148..227)  
**Reviewers:** Pragmatic Tech Lead (`egm-implementation-readiness`), Pedantic Technical Quality Auditor (`egm-codebase-details`)  
**Standard:** `implementation-readiness-standard.md`  
**Verdict:** 🔴 REJECTED / BLOCKED (Implementation Standard & Cancellation Invariants Not Met)

---

## 1. 🔴 Blockers

### Blocker 1: Swallowed Cancellation in `measureQualityScore`
* **Reviewer:** `egm-codebase-details`
* **Affected Scope:** `electron/services/FfmpegRunner.ts#L1451-L1525` & `social_compression_armor_spec.md#L182`
* **Finding:** `measureQualityScore` wraps `runProcessAsync` inside bare `catch` blocks without checking error messages. When a user clicks Abort during VMAF or SSIM computation, `runProcessAsync` rejects with `Error('Job cancelled by user')`. The bare catch block catches and swallows this error, returning `null`. `runIgCompressionSimulation` treats `null` as metric unavailability, injects fallback scores (`76.4`, `92.1`), and completes normally. The job marks `completed` instead of aborting. Spec line 182 only specifies re-throwing in `executeFixerJob`, leaving `measureQualityScore` vulnerable.
* **Required Fix:** Re-throw cancellation inside `measureQualityScore`:
  ```typescript
  catch (err) {
    if ((err as Error).message?.toLowerCase().includes('cancelled by user')) throw err;
    // Fall back to SSIM / null
  }
  ```

### Blocker 2: Zero-Decision Rule Violations in Detailed Implementation Plan
* **Reviewer:** `egm-codebase-details`, `egm-implementation-readiness`
* **Affected Scope:** `docs/specs/social_compression_armor_spec.md#L172-L193`
* **Finding:** The plan fails the Zero-Decision Rule:
  1. **Line 178:** Omits exact CLI parameters for NVENC fallback (`-c:v h264_nvenc -preset p5 -rc:v vbr -cq 18 -b:v 0 -maxrate 12M -bufsize 24M -g ${keyint} -pix_fmt yuv420p -movflags +faststart`).
  2. **Line 181:** Omits dual-slice transcode algorithms, reference scaling (`safeRawScaleFilter`), temporary file cleanup, and lift scoring formula (`grainBonus`, `sharpenBonus`, clamp deltas).
  3. **Line 189:** Specifies "explicit defaults" for store slices without stating default values (`ig-reels`, `keep`, `subtle`, `true`, `true`, `true`).
* **Required Fix:** Provide verbatim CLI argument arrays, exact method signatures, and default values.

### Blocker 3: Undefined State Slices Defaults in `useJobStore.ts`
* **Reviewer:** `egm-implementation-readiness`
* **Affected Scope:** `src/store/useJobStore.ts`, Line 189
* **Finding:** Line 189 states "with explicit defaults" but omits default values. Must explicitly specify initial state values.
* **Required Fix:** Document initial state values in the spec.

---

## 2. 🟡 Majors

### Major 1: Missing Phasing and Incremental Checkpoints
* **Reviewer:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 148–215
* **Finding:** Standard explicitly requires partitioning work into incremental buildable phases. Document provides only flat 6-file list.
* **Required Fix:** Break into 4 phases:
  - Phase 1: Shared types & IPC contract (`media.ts`). Checkpoint: `npx tsc --noEmit`.
  - Phase 2: Engine filter pipeline & simulation (`FfmpegRunner.ts`). Checkpoint: unit test / capability probe.
  - Phase 3: Zustand state & UI controls (`useJobStore.ts`, `FixerModuleView.tsx`). Checkpoint: component render test.
  - Phase 4: Queue lift badge & docs (`JobQueueList.tsx`, `README.md`, `HANDOVER.md`). Checkpoint: `npm run build`.

### Major 2: Underspecified Filter Chain Ordering & Arguments
* **Reviewer:** `egm-implementation-readiness`
* **Affected Scope:** `electron/services/FfmpegRunner.ts`, Lines 176–180
* **Finding:** FFmpeg filters are sequence-sensitive. Must document explicit array concatenation order:
  1. Base scale/pad: `scale=w='trunc(min(1080,iw*1920/ih)/2)*2':h='trunc(min(1920,ih*1080/iw)/2)*2':flags=lanczos,pad=1080:1920:'trunc((ow-iw)/4)*2':'trunc((oh-ih)/4)*2':black`
  2. Denoise (if `denoiseGrain`): `hqdn3d=1.5:1.5:3:3`
  3. Pre-sharpen: subtle `unsharp=3:3:0.5:3:3:0.0` | crisp `unsharp=3:3:0.85:3:3:0.0`
  4. Frame rate (if not `keep`): `fps=30` | `fps=60`

### Major 3: Non-Actionable Verification Plan Without Automated Tests
* **Reviewer:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 217–224
* **Finding:** Verification plan relies on manual inspection descriptions without automated unit or regression assertions.
* **Required Fix:** Add automated test specifications covering filter composition, keyint calculation, and simulation cancellation error propagation.

### Major 4: Missing Concurrency (CB-1) & Staging (MJ-1) Invariants in Store Plan
* **Reviewer:** `egm-codebase-details`
* **Affected Scope:** `docs/specs/social_compression_armor_spec.md#L185-L193` & `src/store/useJobStore.ts#L311-L316`
* **Finding:** Section 3 of the plan omits critical invariants implemented in `useJobStore.ts`:
  1. Immediate clearing of `stagedLocalVideos: []` upon enqueue to prevent duplicate submission (`MJ-1`).
  2. Strict sequential FIFO batch iteration to respect NVENC session limits (`CB-1`).

### Major 5: Architecture Inversion on NVENC Hierarchy
* **Reviewer:** `egm-codebase-details`
* **Affected Scope:** `docs/specs/social_compression_armor_spec.md#L178`
* **Finding:** Line 178 describes "automatic NVENC fallback" from `libx264`. NVENC is optional hardware acceleration; `libx264` is CPU baseline/fallback.

---

## 3. 🟢 Nits

### Nit 1: Incomplete Windows Pipe Drain in Legacy Methods
* **Reviewer:** `egm-codebase-details`
* **Affected Scope:** `FfmpegRunner.ts#L92`, `#L1006`
* **Finding:** `extractOrNormalizeWav` and `detectSpeechSegments` still omit `proc.stdout?.resume()`.

### Nit 2: Unremediated Combat Metaphor in HANDOVER.md
* **Reviewer:** `egm-codebase-details`
* **Affected Scope:** `HANDOVER.md#L48`
* **Finding:** `HANDOVER.md` line 48 still reads "hostile platform upload simulator".

### Nit 3: Undocumented Header and Table Changes in Docs
* **Reviewer:** `egm-implementation-readiness`
* **Affected Scope:** Lines 209–214
* **Finding:** Plan names `README.md` and `HANDOVER.md` without exact sections or table anchors to update.
