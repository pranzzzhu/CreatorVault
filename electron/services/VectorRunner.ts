import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  JobProgressEvent,
  LocalImageMetadata,
  StemOutputPill,
  VectorJobConfig
} from '../../src/types/media';
import { killProcessTree } from './BinaryManager';

export class VectorRunner {
  private activeProcesses = new Map<string, ChildProcess>();
  private cancelledJobs = new Set<string>();

  constructor(
    private binDir: string,
    private getFfmpegPath: () => string,
    private getFfprobePath: () => string,
    private isFfprobeAvailable: () => boolean,
    private getPythonPath: () => string = () => 'python'
  ) {}

  private findOptionalBinary(binaryName: string): string | null {
    const isWin = process.platform === 'win32';
    const exeName = isWin ? `${binaryName}.exe` : binaryName;
    const localCandidate = path.join(this.binDir, exeName);
    if (fs.existsSync(localCandidate)) {
      return localCandidate;
    }

    try {
      const locateCmd = isWin ? 'where' : 'which';
      const output = execFileSync(locateCmd, [binaryName], {
        encoding: 'utf8',
        timeout: 2500,
        windowsHide: true
      });
      const first = output
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      if (first && fs.existsSync(first)) {
        return first;
      }
    } catch {
      // Optional binary not installed
    }
    return null;
  }

  public probeLocalImage(filePath: string): LocalImageMetadata {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Image file not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    const fileSizeKB = Math.max(1, Math.round(stat.size / 1024));
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).replace('.', '').toUpperCase() || 'PNG';

    let width = 1024;
    let height = 1024;

    if (this.isFfprobeAvailable()) {
      try {
        const res = spawnSync(
          this.getFfprobePath(),
          [
            '-v',
            'quiet',
            '-print_format',
            'json',
            '-show_streams',
            filePath
          ],
          { encoding: 'utf8', windowsHide: true, timeout: 6000 }
        );
        if (res.status === 0 && res.stdout) {
          const parsed = JSON.parse(res.stdout);
          const streams: Array<Record<string, unknown>> = Array.isArray(parsed.streams)
            ? parsed.streams
            : [];
          const vStream = streams.find((s) => s.codec_type === 'video');
          if (vStream) {
            if (typeof vStream.width === 'number') width = vStream.width;
            if (typeof vStream.height === 'number') height = vStream.height;
          }
        }
      } catch {
        // Keep fallback dimensions
      }
    }

    return {
      filePath,
      fileName,
      fileSizeKB,
      width,
      height,
      format: ext
    };
  }

  public async executeVectorJob(
    jobId: string,
    config: VectorJobConfig,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<{ outputFilePath: string; pills: StemOutputPill[] }> {
    if (!fs.existsSync(config.inputPath)) {
      throw new Error(`Input image not found: ${config.inputPath}`);
    }

    const baseName =
      path
        .parse(config.fileName)
        .name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 56) || 'Vortex_Asset';

    const jobFolder = path.join(config.outputDir, `${baseName}_${jobId.slice(0, 6)}`);
    if (!fs.existsSync(jobFolder)) {
      fs.mkdirSync(jobFolder, { recursive: true });
    }

    if (config.preset === 'vtracer') {
      const outSvgPath = path.join(jobFolder, `${baseName}_Vector.svg`);
      await this.runSvgVectorizer(jobId, config, outSvgPath, onProgress);
      return {
        outputFilePath: outSvgPath,
        pills: [
          {
            id: 'vec_svg',
            label: 'Vector_Trace.svg',
            type: 'svg',
            filePath: outSvgPath,
            fileName: path.basename(outSvgPath)
          }
        ]
      };
    }

    if (config.preset === 'rmbg') {
      const outMattePath = path.join(jobFolder, `${baseName}_Alpha_Matte.png`);
      await this.runBackgroundRemover(jobId, config, outMattePath, onProgress);
      return {
        outputFilePath: outMattePath,
        pills: [
          {
            id: 'vec_matte',
            label: 'Alpha_Matte.png',
            type: 'image',
            filePath: outMattePath,
            fileName: path.basename(outMattePath)
          }
        ]
      };
    }

    // Preset: 'esrgan' (2x / 4x Super-Resolution Asset Upscaler)
    const scale = config.upscaleFactor || 4;
    const outUpscaledPath = path.join(jobFolder, `${baseName}_Upscaled_${scale}x.png`);
    await this.runAssetUpscaler(jobId, config, outUpscaledPath, scale, onProgress);
    return {
      outputFilePath: outUpscaledPath,
      pills: [
        {
          id: 'vec_upscale',
          label: `Upscaled_${scale}x.png`,
          type: 'image',
          filePath: outUpscaledPath,
          fileName: path.basename(outUpscaledPath)
        }
      ]
    };
  }

  private async runSvgVectorizer(
    jobId: string,
    config: VectorJobConfig,
    outSvgPath: string,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<void> {
    const vtracerBin = this.findOptionalBinary('vtracer');
    const speckleMap = { low: 12, medium: 6, high: 2 };
    const speckleVal = speckleMap[config.detailLevel] || 6;

    if (vtracerBin) {
      onProgress({
        jobId,
        stage: 'remuxing',
        progress: 30,
        statusMessage: 'Tracing Bézier paths via VTracer CLI...'
      });

      await this.spawnTracked(jobId, vtracerBin, [
        '--input',
        config.inputPath,
        '--output',
        outSvgPath,
        '--colormode',
        config.colorMode === 'binary' ? 'bw' : 'color',
        '--filter_speckle',
        String(speckleVal)
      ]);
      return;
    }

    // Try installed Python Rust vtracer binding
    try {
      onProgress({
        jobId,
        stage: 'remuxing',
        progress: 35,
        statusMessage: 'Tracing Bézier spline curves via VTracer Rust engine...'
      });

      const pyScript = `
import sys, vtracer
vtracer.convert_image_to_svg_py(
    sys.argv[1],
    sys.argv[2],
    colormode=sys.argv[3],
    hierarchical='stacked',
    mode='spline',
    filter_speckle=int(sys.argv[4]),
    color_precision=6,
    layer_difference=16,
    corner_threshold=60,
    length_threshold=4.0,
    max_iterations=10,
    splice_threshold=45,
    path_precision=3
)
`;
      await this.spawnTracked(jobId, this.getPythonPath(), [
        '-c',
        pyScript,
        config.inputPath,
        outSvgPath,
        config.colorMode,
        String(speckleVal)
      ]);
      if (fs.existsSync(outSvgPath)) {
        return;
      }
    } catch {
      // Fall back to built-in FFmpeg scanline SVG synthesizer if Python vtracer is missing
    }

    // Built-in multi-layer quantized SVG contour tracer via FFmpeg RGBA buffer decode
    onProgress({
      jobId,
      stage: 'remuxing',
      progress: 20,
      statusMessage: 'Decoding raster planes for SVG path synthesis...'
    });

    const gridW = config.detailLevel === 'high' ? 240 : config.detailLevel === 'medium' ? 180 : 128;
    const aspect = Math.max(0.1, (config.height || 1024) / (config.width || 1024));
    const gridH = Math.max(16, Math.round(gridW * aspect));

    const res = spawnSync(
      this.getFfmpegPath(),
      [
        '-v',
        'error',
        '-i',
        config.inputPath,
        '-vf',
        `scale=${gridW}:${gridH}:flags=area`,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        'pipe:1'
      ],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 15000 }
    );

    if (this.cancelledJobs.has(jobId)) {
      this.cancelledJobs.delete(jobId);
      throw new Error('Job cancelled by user');
    }

    if (res.status !== 0 || !res.stdout || res.stdout.length < gridW * gridH * 4) {
      throw new Error('Failed to decode raster image for SVG vectorization.');
    }

    onProgress({
      jobId,
      stage: 'remuxing',
      progress: 65,
      statusMessage: `Quantizing ${config.colorMode === 'binary' ? 'monochrome ink' : 'multi-color'} vector layers...`
    });

    const rgba = res.stdout;
    const step = config.colorMode === 'binary' ? 255 : config.detailLevel === 'high' ? 32 : 48;
    const colorRuns = new Map<string, string[]>();

    for (let y = 0; y < gridH; y++) {
      let runHex: string | null = null;
      let runStart = 0;

      for (let x = 0; x <= gridW; x++) {
        let hex: string | null = null;
        if (x < gridW) {
          const idx = (y * gridW + x) * 4;
          const r = rgba[idx];
          const g = rgba[idx + 1];
          const b = rgba[idx + 2];
          const a = rgba[idx + 3];

          if (a >= 40) {
            if (config.colorMode === 'binary') {
              const luma = 0.299 * r + 0.587 * g + 0.114 * b;
              hex = luma < 150 ? '#111111' : null;
            } else {
              const qr = Math.min(255, Math.round(r / step) * step);
              const qg = Math.min(255, Math.round(g / step) * step);
              const qb = Math.min(255, Math.round(b / step) * step);
              hex = `#${qr.toString(16).padStart(2, '0')}${qg.toString(16).padStart(2, '0')}${qb.toString(16).padStart(2, '0')}`;
            }
          }
        }

        if (hex !== runHex) {
          if (runHex !== null) {
            const w = x - runStart;
            let list = colorRuns.get(runHex);
            if (!list) {
              list = [];
              colorRuns.set(runHex, list);
            }
            list.push(`M${runStart},${y}h${w}v1h-${w}Z`);
          }
          runHex = hex;
          runStart = x;
        }
      }
    }

    const origW = config.width || gridW;
    const origH = config.height || gridH;
    const scaleX = (origW / gridW).toFixed(4);
    const scaleY = (origH / gridH).toFixed(4);

    // Sort layers from largest coverage to smallest
    const sortedLayers = [...colorRuns.entries()].sort((a, b) => b[1].length - a[1].length);
    const pathElements = sortedLayers
      .map(([hex, cmds]) => `    <path fill="${hex}" d="${cmds.join('')}" />`)
      .join('\n');

    const svgDoc = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${origW} ${origH}" width="${origW}" height="${origH}" shape-rendering="geometricPrecision">
  <g transform="scale(${scaleX}, ${scaleY})">
${pathElements}
  </g>
</svg>
`;

    fs.writeFileSync(outSvgPath, svgDoc, 'utf8');
  }

  private async runBackgroundRemover(
    jobId: string,
    config: VectorJobConfig,
    outMattePath: string,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<void> {
    // 1. Primary: Direct ONNX Runtime U2Net neural segmentation (~1.5s, bypasses rembg pooch/numba hangs)
    const u2netPath = path.join(
      process.env.USERPROFILE || process.env.HOME || '',
      '.u2net',
      'u2net.onnx'
    );

    if (fs.existsSync(u2netPath)) {
      try {
        onProgress({
          jobId,
          stage: 'remuxing',
          progress: 40,
          statusMessage: 'Running U2Net ONNX neural subject segmentation...'
        });

        const pyScript = `
import sys, numpy as np, onnxruntime as ort
from PIL import Image

in_path, out_path, model_path, tol = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])

orig_img = Image.open(in_path).convert('RGBA')
rgb_img = orig_img.convert('RGB')
w, h = rgb_img.size

resized = rgb_img.resize((320, 320), Image.Resampling.BILINEAR)
arr = np.asarray(resized, dtype=np.float32)
max_val = np.max(arr)
if max_val > 0:
    arr = arr / max_val

mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
arr = (arr - mean) / std
tensor = np.expand_dims(arr.transpose((2, 0, 1)), 0).astype(np.float32)

sess = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
inp_name = sess.get_inputs()[0].name
pred = sess.run(None, {inp_name: tensor})[0][0, 0]

mi, ma = float(pred.min()), float(pred.max())
mask = (pred - mi) / (ma - mi + 1e-8)

# Adjust soft threshold cutoff from UI tolerance (12 = tight foreground, 24 = balanced, 38 = soft)
low_cut = 0.22 if tol <= 15 else (0.14 if tol <= 26 else 0.08)
high_cut = 0.85 if tol <= 15 else (0.80 if tol <= 26 else 0.72)
mask = np.clip((mask - low_cut) / (high_cut - low_cut), 0.0, 1.0)

mask_u8 = (mask * 255.0).round().astype(np.uint8)
mask_pil = Image.fromarray(mask_u8, mode='L').resize((w, h), Image.Resampling.LANCZOS)

out_rgba = orig_img.copy()
out_rgba.putalpha(mask_pil)
out_rgba.save(out_path, 'PNG')
`;

        await this.spawnTracked(jobId, this.getPythonPath(), [
          '-c',
          pyScript,
          config.inputPath,
          outMattePath,
          u2netPath,
          String(config.matteTolerance || 24)
        ]);

        if (fs.existsSync(outMattePath)) {
          return;
        }
      } catch {
        // Fall through to FFmpeg studio colorkey fallback below (CB-5)
      }
    }

    onProgress({
      jobId,
      stage: 'remuxing',
      progress: 25,
      statusMessage: 'Sampling studio backdrop perimeter colors...'
    });

    // Sample a 32x32 thumbnail to detect dominant corner/border studio backdrop color
    const thumbRes = spawnSync(
      this.getFfmpegPath(),
      [
        '-v',
        'error',
        '-i',
        config.inputPath,
        '-vf',
        'scale=32:32',
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        'pipe:1'
      ],
      { windowsHide: true, timeout: 8000 }
    );

    let bgR = 255;
    let bgG = 255;
    let bgB = 255;

    if (thumbRes.status === 0 && thumbRes.stdout && thumbRes.stdout.length >= 32 * 32 * 4) {
      const buf = thumbRes.stdout;
      const corners = [
        0,
        31 * 4,
        31 * 32 * 4,
        (31 * 32 + 31) * 4,
        15 * 4,
        (15 * 32) * 4
      ];
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (const offset of corners) {
        sumR += buf[offset];
        sumG += buf[offset + 1];
        sumB += buf[offset + 2];
      }
      bgR = Math.round(sumR / corners.length);
      bgG = Math.round(sumG / corners.length);
      bgB = Math.round(sumB / corners.length);
    }

    const hexColor = `0x${bgR.toString(16).padStart(2, '0')}${bgG.toString(16).padStart(2, '0')}${bgB.toString(16).padStart(2, '0')}`;
    const similarity = Math.min(0.45, Math.max(0.05, (config.matteTolerance || 24) / 100)).toFixed(2);

    onProgress({
      jobId,
      stage: 'remuxing',
      progress: 65,
      statusMessage: `Keying backdrop (${hexColor.replace('0x', '#')}, tolerance ${config.matteTolerance}%)...`
    });

    await this.spawnTracked(jobId, this.getFfmpegPath(), [
      '-y',
      '-i',
      config.inputPath,
      '-vf',
      `format=rgba,colorkey=${hexColor}:${similarity}:0.08`,
      '-frames:v',
      '1',
      outMattePath
    ]);
  }

  private async runAssetUpscaler(
    jobId: string,
    config: VectorJobConfig,
    outUpscaledPath: string,
    scale: 2 | 4,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<void> {
    const esrganBin = this.findOptionalBinary('realesrgan-ncnn-vulkan');
    if (esrganBin) {
      onProgress({
        jobId,
        stage: 'remuxing',
        progress: 30,
        statusMessage: `Running ${scale}x Real-ESRGAN Vulkan super-resolution...`
      });
      await this.spawnTracked(jobId, esrganBin, [
        '-i',
        config.inputPath,
        '-o',
        outUpscaledPath,
        '-s',
        String(scale)
      ]);
      return;
    }

    // Check for PyTorch Spandrel + RealESRGAN_x4plus.pth sidecar model in ./bin/models
    const weightsPath = path.join(this.binDir, 'models', 'RealESRGAN_x4plus.pth');
    if (fs.existsSync(weightsPath)) {
      try {
        onProgress({
          jobId,
          stage: 'remuxing',
          progress: 35,
          statusMessage: `Running ${scale}x Real-ESRGAN neural super-resolution on GPU...`
        });

        const pyScript = `
import sys, torch, numpy as np
from PIL import Image
from spandrel import ModelLoader

in_path, out_path, model_path, target_scale = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = ModelLoader().load_from_file(model_path).to(device).eval()

img = Image.open(in_path).convert('RGB')
w, h = img.size
arr = np.array(img).astype(np.float32) / 255.0
tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).to(device)

with torch.no_grad():
    # Tile if larger than 640px to prevent VRAM spikes
    if w * h <= 640 * 640:
        sr = model(tensor)
    else:
        tile = 384
        overlap = 16
        out_h, out_w = h * 4, w * 4
        sr = torch.zeros((1, 3, out_h, out_w), device=device)
        for y in range(0, h, tile - overlap):
            for x in range(0, w, tile - overlap):
                y1 = min(h, y + tile)
                x1 = min(w, x + tile)
                y0 = max(0, y1 - tile)
                x0 = max(0, x1 - tile)
                patch = tensor[:, :, y0:y1, x0:x1]
                sr_patch = model(patch)
                sr[:, :, y0*4:y1*4, x0*4:x1*4] = sr_patch

sr_np = (sr.squeeze(0).permute(1, 2, 0).clamp(0, 1).cpu().numpy() * 255.0).round().astype(np.uint8)
res_img = Image.fromarray(sr_np)
if target_scale == 2:
    res_img = res_img.resize((w * 2, h * 2), Image.Resampling.LANCZOS)
res_img.save(out_path, 'PNG')
`;
        await this.spawnTracked(jobId, this.getPythonPath(), [
          '-c',
          pyScript,
          config.inputPath,
          outUpscaledPath,
          weightsPath,
          String(scale)
        ]);
        if (fs.existsSync(outUpscaledPath)) {
          return;
        }
      } catch {
        // Fallback to FFmpeg Lanczos+CAS below if PyTorch/Spandrel fails
      }
    }

    onProgress({
      jobId,
      stage: 'remuxing',
      progress: 45,
      statusMessage: `Upscaling ${scale}x via FFmpeg Lanczos + CAS edge restoration...`
    });

    await this.spawnTracked(jobId, this.getFfmpegPath(), [
      '-y',
      '-i',
      config.inputPath,
      '-vf',
      `scale=iw*${scale}:ih*${scale}:flags=lanczos+accurate_rnd+full_chroma_int,cas=strength=0.65,unsharp=5:5:0.8:5:5:0.0`,
      '-frames:v',
      '1',
      outUpscaledPath
    ]);
  }

  private spawnTracked(jobId: string, binPath: string, args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn(binPath, args, { windowsHide: true });
      this.activeProcesses.set(jobId, proc);

      // Drain stdout so child processes never block on a full OS stdout pipe buffer
      proc.stdout?.resume();

      let stderrTail = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-1200);
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(jobId);
        if (this.cancelledJobs.has(jobId)) {
          this.cancelledJobs.delete(jobId);
          reject(new Error('Job cancelled by user'));
          return;
        }
        reject(err);
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(jobId);
        if (this.cancelledJobs.has(jobId)) {
          this.cancelledJobs.delete(jobId);
          reject(new Error('Job cancelled by user'));
          return;
        }
        if (code === 0) {
          resolve();
        } else {
          const last = stderrTail.trim().split(/\r?\n/).pop() || `Process exited with code ${code}`;
          reject(new Error(last));
        }
      });
    });
  }

  public cancelJob(jobId: string): boolean {
    this.cancelledJobs.add(jobId);
    const proc = this.activeProcesses.get(jobId);
    if (proc) {
      killProcessTree(proc);
      this.activeProcesses.delete(jobId);
      return true;
    }
    return false;
  }

  public cancelAll(): void {
    for (const [jobId, proc] of this.activeProcesses.entries()) {
      this.cancelledJobs.add(jobId);
      killProcessTree(proc);
    }
    this.activeProcesses.clear();
  }
}
