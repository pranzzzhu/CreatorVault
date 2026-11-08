# Critic Review: Social Compression Armor Spec (Lines 1..147)

**Reviewers:** Hostile Design Critic (`egm-design`), Structural Validator (`egm-structural`), Technical Copy Editor (`egm-style`)  
**Overall Verdict:** 🟡 CONDITIONAL PASS (2 Blockers, 5 Majors, 9 Nits)

---

## 1. 🔴 Blockers

### Blocker 1: Odd Pad Offset Breaks YUV420p Chroma Subsampling
* **Reviewer:** `egm-design`
* **Affected Scope:** Lines 30, 89, 120 (`pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black`)
* **Finding:** Scale filter truncates width and height to even numbers via `trunc(.../2)*2`, but pad offset math `(oh-ih)/2` still yields odd integers. Example: 16:9 input (3840×2160 or 1920×1080) scales to height `ih = 606`. `oh - ih = 1920 - 606 = 1314`. Vertical offset `(oh - ih) / 2 = 657` (odd number). YUV420p chroma plane is subsampled 2×2; odd x/y offset places chroma at non-integer coordinate `328.5`, triggering chroma bleeding or FFmpeg pad aborts.
* **Fix:** Enforce even pad offsets in filter graph:
  `pad=1080:1920:'trunc((ow-iw)/4)*2':'trunc((oh-ih)/4)*2':black` or scale with `trunc(.../4)*4`.

### Blocker 2: Unconditional Audio Filter Crashes on Silent B-Roll
* **Reviewer:** `egm-design`
* **Affected Scope:** Lines 35, 91 (`-af loudnorm=I=-14:TP=-1.0:LRA=11 -c:a aac -b:a 320k`)
* **Finding:** Spec mandates `loudnorm` and AAC encoding for all inputs. Camera B-roll, timelapses, or drone clips lack audio tracks. FFmpeg aborts immediately if audio filtergraph maps to nonexistent input stream (`no audio stream found`).
* **Fix:** Require audio stream detection via ffprobe. If no audio stream present, omit `-af loudnorm` and `-c:a aac` (or generate silent 48kHz stereo track if container requires audio).

---

## 2. 🟡 Majors

### Major 1: Perceptual Metric Compares Non-Identical Ground Truth (Vanity Metric Risk)
* **Reviewer:** `egm-design`
* **Affected Scope:** Lines 14, 36–37, 54, 62–67, 92, 118
* **Finding:** Spec compares `simPreview` against `armoredOutput`, but compares `rawSim` against `rawInput`. This measures similarity to intermediate smoothed video vs similarity to noisy raw video. A blurred video compresses with near-zero loss against itself, inflating its retention score. To measure true quality retention, both compressed streams must compare against identical ground-truth input footage. Furthermore, CUJ 1 quotes synthetic scores (`76.4 -> 92.1`), which codebase forces via hardcoded `grainBonus + sharpenBonus` offsets when measured lift is low.
* **Fix:** Document that simulation score is an indicative heuristic, benchmark both distorted passes against the original source reference stream, and forbid hardcoded vanity score offsets.

### Major 2: Rec.709 Container Tagging Distorts HDR / Wide Gamut (BT.2020) Inputs
* **Reviewer:** `egm-design`
* **Affected Scope:** Lines 14, 22, 34, 91
* **Finding:** Slinging container flags (`-colorspace bt709 -color_primaries bt709 -color_trc bt709`) alters metadata without converting pixel matrix or tone-mapping HDR transfer curves. Passing 10-bit HDR/HLG footage (iPhone Pro / Sony S-Log) tags HDR pixel values as BT.709, yielding blown-out contrast, clipped highlights, and neon skin tones.
* **Fix:** Document constraint in Goals/Non-Goals: Rec.709 lock applies strictly to SDR footage. Add tone-mapping requirement (`zscale` or `tonemap`) or explicit rejection for BT.2020/HLG/PQ streams.

### Major 3: False Constant Frame Rate (CFR) Lock When `targetFps` is `'keep'`
* **Reviewer:** `egm-design`
* **Affected Scope:** Lines 14, 23, 30, 106
* **Finding:** Problem statement targets "VFR Stutter" and promises CFR locking. But filter chain only injects `fps=30` or `fps=60` when explicitly chosen. If user selects default `targetFps: 'keep'`, no fps filter runs, and variable frame rate mobile footage remains VFR.
* **Fix:** Force CFR on `'keep'` setting using `-fps_mode cfr` (or `-vsync cfr`) or probe input FPS and set `fps=${probedFps}`.

### Major 4: First-Person Voice & Personification in Architecture Decision
* **Reviewer:** `egm-style`
* **Affected Scope:** Lines 131, 137 (`## Alternatives Considered`)
* **Finding:** Line 137 uses first-person plural ("We probe for libvmaf first..."). Line 131 personifies the feature ("Social armor prioritizes..."). Specifications must use dry, objective third-person or imperative framing.
* **Fix:** Replace with objective third-person: "Master export defaults to software `libx264` for maximum quality retention; NVENC is selectable via the Hardware toggle." and "Probe for `libvmaf` first for perceptual scoring; fall back to `ssim` if unavailable."

### Major 5: Uncalibrated Metric Claim & Conflated Compression Terminology
* **Reviewer:** `egm-style`
* **Affected Scope:** Line 20 (`## The Problem`), Line 54 (`## CUJ 1`)
* **Finding:** Line 20 references "macroblock banding". Macroblocking and banding are distinct compression artifacts. Conflating them is technically inaccurate. Line 54 states quality lift output as an absolute factual badge (`Raw Upload: 76.4 -> Armored: 92.1 (+15.7 Lift)`) rather than an illustrative example.
* **Fix:** Change "macroblock banding" to "macroblocking and gradient banding". Prefix lift badge with illustrative marker: `(e.g., Raw Upload: 76.4 -> Armored: 92.1 (+15.7 Lift))`.

---

## 3. 🟢 Nits

### Nit 1: Workflow Editorializing in Non-Goals
* **Reviewer:** `egm-style`
* **Affected Scope:** Lines 42, 44 (`## Non-Goals`)
* **Finding:** Parenthetical statements contain subjective workflow commentary and third-party product mentions with no actionable operator decision.
* **Fix:** Truncate commentary to clean system boundaries.

### Nit 2: Redundant Synonyms & Pseudo-Technical Jargon
* **Reviewer:** `egm-style`
* **Affected Scope:** Lines 12, 14 (`## Overview`), Line 20 (`## The Problem`), Line 30 (`## Goals`)
* **Finding:** "Image entropy" is quasi-scientific; "grain and noise" is redundant; "automatic centering letterbox/pillarbox padding" is awkward phrasing.
* **Fix:** Calibrate phrasing per style review edits.

### Nit 3: Filler Words & Brand Fluff
* **Reviewer:** `egm-style`
* **Affected Scope:** Line 35, 52, 109, 118, 136, 144
* **Finding:** "Sony A7IV" consumer branding, "safety bypass", "gracefully fall back", "Netflix VMAF", "next-gen ingest".
* **Fix:** Replace with generic technical terms (`4K camera clip`, `bypass`, `falls back`, `VMAF (libvmaf)`, `AV1 or HEVC ingest`).

### Nit 4: Section Header Naming Variance
* **Reviewer:** `egm-structural`
* **Affected Scope:** Lines 18, 28, 40, 70
* **Finding:** Variance between standard template titles (`Problem Statement`, `Goals & Non-Goals`) and document headers (`## The Problem`, `## Goals`, `## Non-Goals`). Content satisfies specification intent.

### Nit 5: HTML Line-Break Tags Inside Mermaid Node Labels
* **Reviewer:** `egm-structural`
* **Affected Scope:** Lines 75, 76, 80, 89–92
* **Finding:** Multi-line labels use `<br/>`. Valid in GitHub Mermaid, but can trigger warnings in strict MDX parsers.

### Nit 6: Raw Comparison Operator in Prose
* **Reviewer:** `egm-structural`
* **Affected Scope:** Line 35 (`(<3s)`)
* **Finding:** Raw `<` character before digit `3` in `(<3s)`. CommonMark parses literally, but strict XML/MDX documentation generators can warn on unescaped `<`. Recommend code span `(<3s)`.

### Nit 7: Inconsistent Numbered List Spacing
* **Reviewer:** `egm-structural`
* **Affected Scope:** Lines 20–24 vs Lines 106–109
* **Finding:** Lines 20–24 use single-space indentation after numbers (`1. `). Lines 106–109 use two-space indentation (`1.  `).

### Nit 8: Fragile Cancellation Detection Match
* **Reviewer:** `egm-design`
* **Affected Scope:** Line 117
* **Finding:** Mitigation specifies `err.message.includes('cancelled')`. Fails if runtime emits American spelling `canceled` (single 'l') or exit signal text.
* **Fix:** Use case-insensitive regex `/cancel/i`.

### Nit 9: Missing Abort / Cancel Flow in Mermaid Diagram
* **Reviewer:** `egm-design`
* **Affected Scope:** Lines 72–102
* **Finding:** Diagram details forward pipeline but omits user cancel IPC flow (`JobQueueList -> cancelJob -> FfmpegRunner`).
