import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import type { HardwareTelemetry } from '../../src/types/media';

const execFileAsync = promisify(execFile);

export class HardwareProbe {
  public static getDefaultTelemetry(): HardwareTelemetry {
    const hasAppleSilicon = process.platform === 'darwin' && os.arch() === 'arm64';
    if (hasAppleSilicon) {
      const cpuModel = os.cpus()[0]?.model || 'Apple Silicon';
      return {
        gpuName: cpuModel,
        hasNvidiaCuda: false,
        hasNvenc: false,
        hasAppleSilicon: true,
        acceleratorBadge: 'GPU TURBO: APPLE MPS',
        recommendedDevice: 'mps'
      };
    }
    const cpuModel = os.cpus()[0]?.model?.split('@')[0]?.trim() || 'Multi-Core CPU';
    return {
      gpuName: cpuModel,
      hasNvidiaCuda: false,
      hasNvenc: false,
      hasAppleSilicon: false,
      acceleratorBadge: 'CPU FALLBACK MODE',
      recommendedDevice: 'cpu'
    };
  }

  public static async probe(ffmpegPath: string): Promise<HardwareTelemetry> {
    let gpuName = 'CPU Compute Engine';
    let hasNvidiaCuda = false;
    let hasNvenc = false;
    const hasAppleSilicon = process.platform === 'darwin' && os.arch() === 'arm64';

    // Parallel async checks: nvidia-smi & ffmpeg encoders
    const [smiRes, encRes] = await Promise.allSettled([
      execFileAsync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
        timeout: 3000,
        windowsHide: true
      }),
      ffmpegPath
        ? execFileAsync(ffmpegPath, ['-hide_banner', '-encoders'], {
            timeout: 3000,
            windowsHide: true
          })
        : Promise.reject(new Error('No ffmpeg'))
    ]);

    if (smiRes.status === 'fulfilled' && smiRes.value.stdout?.trim()) {
      gpuName = smiRes.value.stdout.split(/\r?\n/)[0].trim();
      hasNvidiaCuda = true;
    }

    if (encRes.status === 'fulfilled' && encRes.value.stdout?.includes('h264_nvenc')) {
      hasNvenc = hasNvidiaCuda;
    }

    if (hasNvidiaCuda) {
      const shortGpu = gpuName
        .replace(/NVIDIA\s+/i, '')
        .replace(/GeForce\s+/i, '')
        .trim();
      return {
        gpuName,
        hasNvidiaCuda: true,
        hasNvenc,
        hasAppleSilicon: false,
        acceleratorBadge: `GPU TURBO: ${shortGpu.toUpperCase()}`,
        recommendedDevice: 'cuda'
      };
    }

    if (hasAppleSilicon) {
      const cpuModel = os.cpus()[0]?.model || 'Apple Silicon';
      return {
        gpuName: cpuModel,
        hasNvidiaCuda: false,
        hasNvenc: false,
        hasAppleSilicon: true,
        acceleratorBadge: 'GPU TURBO: APPLE MPS',
        recommendedDevice: 'mps'
      };
    }

    const cpuModel = os.cpus()[0]?.model?.split('@')[0]?.trim() || 'Multi-Core CPU';
    return {
      gpuName: cpuModel,
      hasNvidiaCuda: false,
      hasNvenc: false,
      hasAppleSilicon: false,
      acceleratorBadge: 'CPU FALLBACK MODE',
      recommendedDevice: 'cpu'
    };
  }
}
