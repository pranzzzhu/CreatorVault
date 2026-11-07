import { spawnSync } from 'node:child_process';
import os from 'node:os';
import type { HardwareTelemetry } from '../../src/types/media';

export class HardwareProbe {
  public static probe(ffmpegPath: string): HardwareTelemetry {
    let gpuName = 'CPU Compute Engine';
    let hasNvidiaCuda = false;
    let hasNvenc = false;
    const hasAppleSilicon = process.platform === 'darwin' && os.arch() === 'arm64';

    // 1. Check nvidia-smi for NVIDIA RTX/GTX GPU & CUDA support
    try {
      const smi = spawnSync(
        'nvidia-smi',
        ['--query-gpu=name', '--format=csv,noheader'],
        { encoding: 'utf8', timeout: 3000, windowsHide: true }
      );
      if (smi.status === 0 && smi.stdout && smi.stdout.trim().length > 0) {
        gpuName = smi.stdout.split(/\r?\n/)[0].trim();
        hasNvidiaCuda = true;
      }
    } catch {
      // No nvidia-smi found
    }

    // 2. Check FFmpeg hardware encoders for h264_nvenc
    try {
      const enc = spawnSync(ffmpegPath, ['-hide_banner', '-encoders'], {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true
      });
      if (enc.status === 0 && enc.stdout && enc.stdout.includes('h264_nvenc')) {
        hasNvenc = hasNvidiaCuda; // NVENC usable when NVIDIA GPU present
      }
    } catch {
      // FFmpeg missing or failed
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
