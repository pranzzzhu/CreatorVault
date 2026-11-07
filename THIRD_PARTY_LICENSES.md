# Third-Party Licenses & Sidecar Attributions

**VORTEX** orchestrates external open-source command-line utilities and neural network weights via its modular sidecar architecture (`BinaryManager.ts`). When distributing VORTEX source code or pre-packaged release bundles containing sidecar binaries, the following upstream licenses apply:

---

## 1. `yt-dlp`
- **Repository:** https://github.com/yt-dlp/yt-dlp
- **License:** The Unlicense (Public Domain)
- **Usage in VORTEX:** Invoked as an external child process (`YtDlpRunner.ts`) for URL metadata inspection and timestamp section clipping.

---

## 2. `FFmpeg` & `FFprobe` (`Gyan.FFmpeg` Full Build)
- **Website / Source:** https://ffmpeg.org/ | https://github.com/GyanD/codexffmpeg
- **License:** GNU General Public License v3.0 (GPLv3) (when compiled with `--enable-gpl`, `libx264`, and `x265`) or LGPL v2.1+.
- **Usage in VORTEX:** Invoked as an external child process (`FfmpegRunner.ts`) for 48kHz PCM WAV extraction, LED deflickering, target-size bitrate encoding, Apple ProRes 422 proxy transcoding, and silence detection.
- **Compliance Notice:** If you distribute a release archive bundling `ffmpeg.exe` / `ffprobe.exe` compiled with GPL encoders (`libx264`), you must include the GPLv3 license text (https://www.gnu.org/licenses/gpl-3.0.txt) and reference the upstream FFmpeg source repository.

---

## 3. `Demucs` (`htdemucs`)
- **Repository:** https://github.com/facebookresearch/demucs
- **Copyright:** Copyright (c) Meta Platforms, Inc. and affiliates.
- **License:** MIT License
- **Usage in VORTEX:** Invoked via Python (`StemRunner.ts`) for 2-stem and 4-stem audio source separation.

---

## 4. `VTracer`
- **Repository:** https://github.com/visioncortex/vtracer
- **Copyright:** Copyright (c) 2020 Vision Cortex
- **License:** MIT License
- **Usage in VORTEX:** Invoked via CLI or Python bindings (`VectorRunner.ts`) for raster-to-SVG spline vectorization.

---

## 5. `Rembg` & `U2Net` (`u2net.onnx`)
- **Repositories:**
  - `rembg`: https://github.com/danielgatis/rembg (Copyright (c) 2020 Daniel Gatis — **MIT License**)
  - `U-2-Net`: https://github.com/xuebinqin/U-2-Net (Copyright (c) 2020 Xuebin Qin — **Apache License 2.0**)
- **Usage in VORTEX:** Executed via `onnxruntime` (`VectorRunner.ts`) for local 32-bit RGBA alpha matte background removal.

---

## 6. `Real-ESRGAN` (`RealESRGAN_x4plus.pth`) & `Spandrel`
- **Repositories:**
  - `Real-ESRGAN`: https://github.com/xinntao/Real-ESRGAN (Copyright (c) 2021 Xintao Wang — **BSD 3-Clause License**)
  - `Spandrel`: https://github.com/chaiNNer-org/spandrel (Copyright (c) 2023 chaiNNer-org — **MIT License**)
- **Usage in VORTEX:** Executed via Vulkan CLI or PyTorch `spandrel` (`VectorRunner.ts`) for 2x and 4x super-resolution image upscaling.
