# Intermediate Zoom Out Audit: Social Compression Armor (`reel-optimizer`)

Verdict: 🔴 **REJECTED (Remediation Incomplete & Mitigation Bloat Detected)**

Root cause: Spec marked "Approved / Remediated", but document text unchanged. Review round mitigations threaten massive scope creep. Simplest design solves root conditioning problem; drop vanity metric lab.

---

### Audit Findings

#### 1. 🔴 Blocker — Spec Marked Remediated Without Applying Upstream Fixes
* **Affected Scope**: Lines 5, 30, 35, 100, 182
* **Simplicity Rationale**: Document claims status `Approved / Remediated`. File contains zero applied fixes from Critic, Comprehension, or Zoom Out reviews. Chroma subsampling odd pad offsets (`(oh-ih)/2`) remain. Audio loudnorm crashes silent clips. Mermaid diagram bypasses IPC boundary. Fragile cancellation swallow remains.
* **Fix**: Apply concrete fixes directly to spec text before claiming remediation.

---

#### 2. 🔴 Blocker — Mitigation Bloat: Over-Engineered Vanity Metric Lab
* **Affected Scope**: Comprehension Blocker (Lines 36, 170, 181), Readiness Blocker 2 (`FfmpegRunner.ts#L1420-L1428`).
* **Simplicity Rationale**: Comprehension and Readiness reports demand specifying dual-stream VMAF filter graphs and exact synthetic score formulas (`grainBonus + sharpenBonus`). CreatorVault is local fast NLE utility, not video quality lab. Existing codebase math is fake vanity lift (`rawScore = optimizedScore - expectedLift`). Building complex VMAF harness adds 150+ lines of brittle subprocesses, swallowed cancellations, and missing model errors.
* **Fix**: Demote simulation to optional secondary preview encode (`Simulated_Constrained.mp4`). Cut VMAF/SSIM metric math and synthetic lift badge entirely. Save 150 lines.

---

#### 3. 🟡 Major — Scope Creep: Proposed HDR Tone-Mapping Engine
* **Affected Scope**: Critic Report Major 2 (Lines 22, 34).
* **Simplicity Rationale**: Critic report suggests adding `zscale` or tone-mapping filter chains for BT.2020/HDR mobile video. CreatorVault is not DaVinci Resolve. Adding tone-mapping adds color science maintenance, LUT dependencies, and slow CPU transcode times.
* **Fix**: Set strict boundary in Non-Goals: SDR Rec.709 only. Document HDR tone-mapping as NLE responsibility. Pass-through or warn on HDR.

---

#### 4. 🟡 Major — YAGNI Platform Selector Bloat
* **Affected Scope**: Lines 161, 189, 199, `media.ts`.
* **Simplicity Rationale**: Spec exposes `platform: 'ig-reels' | 'tiktok' | 'yt-shorts'`. Comprehension report demands distinct bitrates for each. In reality, all three use identical 1080×1920 Rec.709 H.264 masters. Divergent profiles add unused UI controls and dead branches.
* **Fix**: Drop 3-way platform join UI and store state slice. Expose single preset: "Social 9:16 Vertical".

---

#### 5. 🟡 Major — Global `JobItem` Domain Model Contamination
* **Affected Scope**: Lines 170, 192, `media.ts`.
* **Simplicity Rationale**: Spec adds `vmafComparison` directly to top-level `JobItem`. `JobItem` serves all 9 modules (Demucs stems, ProRes proxies, Deflicker, VTracer). Adding preset-specific metric object pollutes core shared interface.
* **Fix**: Return simulation preview via standard `StemOutputPill` (`Simulated_IG_Constrained.mp4`). Put status note in `statusMessage`. Delete `vmafComparison` from `JobItem`.

---

#### 6. 🟡 Major — Inverted Hardware Acceleration Semantics
* **Affected Scope**: Lines 33, 178.
* **Simplicity Rationale**: Spec calls NVENC an "automatic hardware fallback" for `libx264`. Software `libx264` is universal baseline/fallback. Hardware NVENC is optional speed acceleration. Inverted framing confuses hardware toggle defaults.
* **Fix**: Rephrase: "Master export defaults to software `libx264`; NVENC is optional hardware speedup via Hardware toggle."

---

#### 7. 🟢 Nit — Mermaid IPC Process Boundary Violation
* **Affected Scope**: Lines 88–102.
* **Simplicity Rationale**: Mermaid diagram links `Sim` directly to `QueueState`. Main process worker cannot touch Renderer Zustand store directly with Electron context isolation.
* **Fix**: Route return link through IPC handler response.

---

#### 8. 🟢 Nit — Unscrubbed Audit Shorthand (`CB-1`, `MJ-1`)
* **Affected Scope**: Lines 80, 107.
* **Simplicity Rationale**: Text contains internal review tracking identifiers without definition.
* **Fix**: Replace shorthand tokens with explicit architectural statements (FIFO queue execution, staged array clearing).

---

### Minimal Architecture Recommendation
1. Scale + Even Pad + Denoise (`hqdn3d`) + Unsharp (`unsharp`) + Rec.709 lock + Loudnorm (guarded on audio stream presence).
2. Master export via software `libx264` (or NVENC if hardware toggle checked).
3. Optional 5-second simulated constrained transcode preview saved directly as standard `StemOutputPill`.
4. Delete VMAF/SSIM calculation, fake bonus score math, and `vmafComparison` interface.
