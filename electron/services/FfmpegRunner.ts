import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  ConverterJobConfig,
  ConverterTargetFormat,
  FixerJobConfig,
  JobProgressEvent,
  LocalMediaMetadata,
  LocalVideoMetadata,
  OutputPill,
  ReelOptimizerOptions,
  StemOutputPill
} from '../../src/types/media';
import { killProcessTree } from './BinaryManager';
import { getNonCollidingFilePath, releaseFilePath } from './FileUtils';

// Even scaled size and even pad offsets keep YUV420p chroma planes aligned (offset = trunc(x/4)*2).
const REEL_SCALE_PAD_FILTER =
  "scale=w='trunc(min(1080,iw*1920/ih)/2)*2':h='trunc(min(1920,ih*1080/iw)/2)*2':flags=lanczos," +
  "pad=1080:1920:'trunc((ow-iw)/4)*2':'trunc((oh-ih)/4)*2':black";

export class FfmpegRunner {
  private activeProcesses = new Map<string, ChildProcess>();
  private cancelledJobs = new Set<string>();
  private encoderCache = new Map<string, boolean>();
  private filterCache = new Map<string, boolean>();

  constructor(private getFfmpegPath: () => string, private isAvailable: () => boolean) {}

  private hasEncoder(encoderName: string): boolean {
    if (this.encoderCache.has(encoderName)) {
      return this.encoderCache.get(encoderName)!;
    }
    try {
      const res = spawnSync(this.getFfmpegPath(), ['-hide_banner', '-encoders'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 5000
      });
      const available = res.status === 0 && Boolean(res.stdout && res.stdout.includes(encoderName));
      this.encoderCache.set(encoderName, available);
      return available;
    } catch {
      return false;
    }
  }

  /** Returns true when the file has at least one audio stream (ffmpeg -i lists streams on stderr). */
  private hasAudioStream(filePath: string): boolean {
    try {
      const res = spawnSync(this.getFfmpegPath(), ['-hide_banner', '-i', filePath], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 10000
      });
      return /Stream #\d+:\d+.*: Audio:/.test(`${res.stderr || ''}`);
    } catch {
      return true;
    }
  }

  private hasFilter(filterName: string): boolean {
    if (this.filterCache.has(filterName)) {
      return this.filterCache.get(filterName)!;
    }
    try {
      const res = spawnSync(this.getFfmpegPath(), ['-hide_banner', '-filters'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 5000
      });
      const available = res.status === 0 && Boolean(res.stdout && res.stdout.includes(filterName));
      this.filterCache.set(filterName, available);
      return available;
    } catch {
      return false;
    }
  }

  /**
   * Ensures an audio file is 48kHz 16-bit stereo PCM WAV for Premiere Pro / After Effects timeline lock,
   * or extracts a clean WAV from a downloaded video before feeding into Demucs.
   */
  public async extractOrNormalizeWav(
    inputPath: string,
    outputWavPath: string,
    durationSec: number,
    jobId: string,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<string> {
    if (!this.isAvailable() || !fs.existsSync(inputPath)) {
      this.writeValidSilentWav(outputWavPath, Math.min(Math.max(durationSec, 3), 15));
      return outputWavPath;
    }

    const ffmpegBin = this.getFfmpegPath();

    return new Promise<string>((resolve, reject) => {
      const args = [
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-acodec',
        'pcm_s16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        outputWavPath
      ];

      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      this.activeProcesses.set(jobId, proc);
      proc.stdout?.resume();

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch && durationSec > 0) {
          const secs =
            parseInt(timeMatch[1], 10) * 3600 +
            parseInt(timeMatch[2], 10) * 60 +
            parseFloat(timeMatch[3]);
          const pct = Math.min(99, Math.round((secs / durationSec) * 100));
          onProgress({
            jobId,
            stage: 'remuxing',
            progress: pct,
            statusMessage: `Extracting 48kHz PCM WAV (${pct}%)...`
          });
        }
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
        if (code === 0 && fs.existsSync(outputWavPath)) {
          resolve(outputWavPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Generates a valid playable media file for simulation mode.
   * For video extensions (.mp4/.mkv/.mov), synthesizes a real H.264/AAC container if FFmpeg is available,
   * or falls back to a .wav extension so a .mp4 never contains raw RIFF WAVE headers (CB-3).
   */
  public writeValidSimulatedMedia(
    targetPath: string,
    durationSec = 6,
    freqHz = 220
  ): string {
    const ext = path.extname(targetPath).toLowerCase();
    const isVideoExt = ext === '.mp4' || ext === '.mkv' || ext === '.mov' || ext === '.webm';
    const safeDuration = Math.max(2, Math.min(durationSec, 12));

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (ext === '.svg') {
      fs.writeFileSync(
        targetPath,
        `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">\n  <rect width="512" height="512" fill="#18181b"/>\n</svg>\n`,
        'utf8'
      );
      return targetPath;
    }

    if (ext === '.xml') {
      fs.writeFileSync(
        targetPath,
        `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5"><sequence id="vortex-sim"><name>Vortex_Sequence</name><duration>300</duration></sequence></xmeml>\n`,
        'utf8'
      );
      return targetPath;
    }

    if (ext === '.png') {
      const png1x1 = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      fs.writeFileSync(targetPath, png1x1);
      return targetPath;
    }

    if (isVideoExt && this.isAvailable()) {
      const res = spawnSync(
        this.getFfmpegPath(),
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `testsrc=duration=${safeDuration}:size=1280x720:rate=30`,
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=${freqHz}:sample_rate=48000:duration=${safeDuration}`,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-shortest',
          targetPath
        ],
        { windowsHide: true, timeout: 15000 }
      );
      if (res.status === 0 && fs.existsSync(targetPath)) {
        return targetPath;
      }
    }

    // Fallback to a valid .wav path so we never write RIFF headers into a .mp4 file
    const wavPath = isVideoExt
      ? path.join(path.dirname(targetPath), `${path.parse(targetPath).name}.wav`)
      : targetPath;
    this.writeValidSilentWav(wavPath, safeDuration, freqHz);
    return wavPath;
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

  /**
   * Probes a local video file via ffprobe to extract exact duration, resolution, frame rate, and codecs.
   */
  /**
   * @deprecated Use probeLocalMedia instead. Kept for backwards compatibility with Module 2.
   */
  public probeLocalVideo(
    filePath: string,
    ffprobePath: string,
    isFfprobeAvailable: boolean
  ): LocalVideoMetadata {
    const meta = this.probeLocalMedia(filePath, ffprobePath, isFfprobeAvailable);
    return {
      filePath: meta.filePath,
      fileName: meta.fileName,
      fileSizeMB: meta.fileSizeMB,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      videoCodec: meta.videoCodec,
      audioCodec: meta.audioCodec
    };
  }

  /**
   * Probes any local video or audio file via ffprobe, automatically classifying it as 'video' or 'audio'
   * (ignoring embedded album art streams on MP3/FLAC files).
   */
  public probeLocalMedia(
    filePath: string,
    ffprobePath: string,
    isFfprobeAvailable: boolean
  ): LocalMediaMetadata {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    const fileSizeMB = Number((stat.size / (1024 * 1024)).toFixed(2));
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const audioExts = new Set(['.wav', '.mp3', '.flac', '.m4a', '.ogg', '.aac', '.opus', '.wma']);

    let duration = 30;
    let mediaType: 'video' | 'audio' = audioExts.has(ext) ? 'audio' : 'video';
    let width = 0;
    let height = 0;
    let fps = 30;
    let videoCodec = 'none';
    let audioCodec = 'none';
    let sampleRate = 0;

    if (isFfprobeAvailable) {
      try {
        const res = spawnSync(
          ffprobePath,
          [
            '-v',
            'quiet',
            '-print_format',
            'json',
            '-show_format',
            '-show_streams',
            filePath
          ],
          { encoding: 'utf8', windowsHide: true, timeout: 8000 }
        );

        if (res.status === 0 && res.stdout) {
          const parsed = JSON.parse(res.stdout);
          const fmtDur = parseFloat(parsed.format?.duration || '0');
          if (Number.isFinite(fmtDur) && fmtDur > 0) {
            duration = Number(fmtDur.toFixed(2));
          }

          const streams: Array<Record<string, unknown>> = Array.isArray(parsed.streams)
            ? parsed.streams
            : [];

          // Ignore embedded cover art (attached_pic === 1) when detecting real video streams
          const vStream = streams.find((s) => {
            if (s.codec_type !== 'video') return false;
            const disp = s.disposition as Record<string, unknown> | undefined;
            if (disp && disp.attached_pic === 1) return false;
            const cName = String(s.codec_name || '').toLowerCase();
            if ((cName === 'mjpeg' || cName === 'png') && audioExts.has(ext)) return false;
            return true;
          });

          const aStream = streams.find((s) => s.codec_type === 'audio');

          if (vStream) {
            mediaType = 'video';
            if (typeof vStream.width === 'number') width = vStream.width;
            if (typeof vStream.height === 'number') height = vStream.height;
            if (typeof vStream.codec_name === 'string') videoCodec = vStream.codec_name;
            const parseRate = (rateStr: unknown): number | null => {
              if (typeof rateStr !== 'string' || !rateStr.includes('/')) return null;
              const [num, den] = rateStr.split('/').map(Number);
              if (num > 0 && den > 0) {
                const val = num / den;
                if (val >= 1 && val <= 240) return Math.round(val * 100) / 100;
              }
              return null;
            };
            fps = parseRate(vStream.r_frame_rate) ?? parseRate(vStream.avg_frame_rate) ?? 30;
          } else {
            mediaType = 'audio';
          }

          if (aStream) {
            if (typeof aStream.codec_name === 'string') audioCodec = aStream.codec_name;
            const sr = parseInt(String(aStream.sample_rate || '48000'), 10);
            if (Number.isFinite(sr) && sr > 0) sampleRate = sr;
          }
        }
      } catch {
        // Fallback to extension-based defaults
      }
    }

    return {
      filePath,
      fileName,
      fileSizeMB,
      duration,
      mediaType,
      width,
      height,
      fps,
      videoCodec,
      audioCodec,
      sampleRate
    };
  }

  /**
   * Executes Universal 4-Way Format Conversion:
   * 1. Video -> Video (.mp4, .mov, .mkv, .webm, .gif) with Smart Copy (-c copy) zero-loss fast path
   * 2. Video -> Audio (.wav, .mp3, .flac, .m4a, .ogg)
   * 3. Audio -> Audio (.wav, .mp3, .flac, .m4a, .ogg)
   * 4. Audio -> Video (.mp4, .mov, .mkv, .webm, .gif) with synthesized Waveform or Studio Slate
   */
  public async executeConverterJob(
    jobId: string,
    config: ConverterJobConfig,
    hasNvenc: boolean,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<{
    outputFilePath: string;
    pills: OutputPill[];
    usedSmartCopy?: boolean;
  }> {
    if (!this.isAvailable()) {
      throw new Error('FFmpeg binary is not available. Check Settings -> Sidecar Binaries.');
    }
    if (!fs.existsSync(config.inputPath)) {
      throw new Error(`Source file does not exist: ${config.inputPath}`);
    }

    const baseName =
      path
        .parse(config.fileName)
        .name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 56) || 'Vortex_Converted';

    const targetExt = config.targetFormat;
    const outPath = getNonCollidingFilePath(config.outputDir, `${baseName}_Converted`, targetExt);
    try {
    const safeDur = Math.max(1, config.duration || 15);
    const useNvenc = Boolean(hasNvenc && config.useHardwareEncoder && this.hasEncoder('h264_nvenc'));

    const targetIsAudio = ['wav', 'mp3', 'flac', 'm4a', 'ogg'].includes(targetExt);
    const sourceIsAudio = config.mediaType === 'audio';

    if (sourceIsAudio && targetExt === 'gif') {
      throw new Error(
        'Audio files cannot be converted to GIF format. Please select an audio format or video container.'
      );
    }

    const inputHasAudio =
      config.mediaType === 'audio' ||
      (Boolean(config.audioCodec) && config.audioCodec.toLowerCase() !== 'none');

    // Helper for Audio Codec flags
    const buildAudioCodecArgs = (fmt: ConverterTargetFormat): string[] => {
      const srArgs = ['-ar', String(config.audioSampleRate || 48000), '-ac', '2'];
      const normArgs =
        config.normalizeLoudness && safeDur >= 3
          ? ['-af', 'loudnorm=I=-14:TP=-1.0:LRA=11']
          : [];

      switch (fmt) {
        case 'wav':
          return [...normArgs, '-c:a', 'pcm_s16le', ...srArgs];
        case 'mp3':
          return [...normArgs, '-c:a', 'libmp3lame', '-b:a', '320k', ...srArgs];
        case 'flac':
          return [...normArgs, '-c:a', 'flac', ...srArgs];
        case 'm4a':
          return [...normArgs, '-c:a', 'aac', '-b:a', '320k', ...srArgs];
        case 'ogg':
          return [...normArgs, '-c:a', 'libvorbis', '-q:a', '8', ...srArgs];
        default:
          return [...normArgs, '-c:a', 'aac', '-b:a', '256k', ...srArgs];
      }
    };

    // CASE 1 & 2: Any Source (Video or Audio) -> Audio Output (.wav, .mp3, .flac, .m4a, .ogg)
    if (targetIsAudio) {
      if (!inputHasAudio) {
        throw new Error(`Input video "${config.fileName}" contains no audio track to extract.`);
      }

      const args = [
        '-y',
        '-i',
        config.inputPath,
        '-vn',
        ...buildAudioCodecArgs(targetExt),
        outPath
      ];

      await this.runFfmpegWithProgress(
        jobId,
        args,
        safeDur,
        0,
        100,
        `Converting to ${targetExt.toUpperCase()} (${((config.audioSampleRate || 48000) / 1000).toFixed(1)}kHz${
          config.normalizeLoudness && safeDur >= 3 ? ' -14 LUFS' : ''
        })`,
        onProgress
      );

      return {
        outputFilePath: outPath,
        pills: [
          {
            id: `conv_${targetExt}`,
            label: `${path.basename(outPath)}`,
            type: 'audio',
            filePath: outPath,
            fileName: path.basename(outPath)
          }
        ],
        usedSmartCopy: false
      };
    }

    // CASE 3: Video -> Animated GIF (High-Fidelity 256-Color Palette Filtergraph)
    if (!sourceIsAudio && targetExt === 'gif') {
      const gifDur = Math.min(safeDur, 30);
      const gifFilter =
        "fps=15,scale='min(640,iw)':-2:flags=lanczos,split[s0][s1];" +
        '[s0]palettegen=max_colors=256[p];' +
        '[s1][p]paletteuse=dither=bayer:bayer_scale=5';

      await this.runFfmpegWithProgress(
        jobId,
        ['-y', '-t', String(gifDur), '-i', config.inputPath, '-vf', gifFilter, '-an', outPath],
        gifDur,
        0,
        100,
        'Synthesizing 256-color palette GIF (max 30s)...',
        onProgress
      );

      return {
        outputFilePath: outPath,
        pills: [
          {
            id: 'conv_gif',
            label: path.basename(outPath),
            type: 'image',
            filePath: outPath,
            fileName: path.basename(outPath)
          }
        ],
        usedSmartCopy: false
      };
    }

    // CASE 4: Audio -> Video (.mp4, .mov, .mkv, .webm, .gif)
    if (sourceIsAudio && !targetIsAudio) {
      const vEncoderArgs =
        targetExt === 'webm'
          ? [
              '-c:v',
              'libvpx-vp9',
              '-crf',
              '30',
              '-b:v',
              '0',
              '-pix_fmt',
              'yuv420p',
              '-row-mt',
              '1',
              '-cpu-used',
              '4'
            ]
          : useNvenc
            ? [
                '-c:v',
                'h264_nvenc',
                '-preset',
                'p4',
                '-cq',
                '20',
                '-pix_fmt',
                'yuv420p',
                ...(targetExt === 'mp4' || targetExt === 'mov' ? ['-movflags', '+faststart'] : [])
              ]
            : [
                '-c:v',
                'libx264',
                '-preset',
                'fast',
                '-crf',
                '20',
                '-pix_fmt',
                'yuv420p',
                ...(targetExt === 'mp4' || targetExt === 'mov' ? ['-movflags', '+faststart'] : [])
              ];

      if (config.audioToVideoMode === 'waveform') {
        const waveFilter =
          '[0:a:0]showwaves=s=1280x720:mode=cline:rate=30:colors=0x10B981|0x6366F1,format=yuv420p[v]';
        const args = [
          '-y',
          '-i',
          config.inputPath,
          '-filter_complex',
          waveFilter,
          '-map',
          '[v]',
          '-map',
          '0:a:0',
          ...vEncoderArgs,
          ...(targetExt === 'webm'
            ? ['-c:a', 'libopus', '-b:a', '192k', '-ac', '2']
            : ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2']),
          '-shortest',
          outPath
        ];

        await this.runFfmpegWithProgress(
          jobId,
          args,
          safeDur,
          0,
          100,
          `Rendering Audio Waveform Video (.${targetExt})`,
          onProgress
        );
      } else {
        // Studio Dark Slate (1280x720 @ 30fps)
        const args = [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=0x09090B:s=1280x720:r=30',
          '-i',
          config.inputPath,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          ...vEncoderArgs,
          ...(targetExt === 'webm'
            ? ['-c:a', 'libopus', '-b:a', '192k', '-ac', '2']
            : ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2']),
          '-shortest',
          outPath
        ];

        await this.runFfmpegWithProgress(
          jobId,
          args,
          safeDur,
          0,
          100,
          `Wrapping Audio in Studio Slate Container (.${targetExt})`,
          onProgress
        );
      }

      return {
        outputFilePath: outPath,
        pills: [
          {
            id: `conv_a2v_${targetExt}`,
            label: path.basename(outPath),
            type: 'video',
            filePath: outPath,
            fileName: path.basename(outPath)
          }
        ],
        usedSmartCopy: false
      };
    }

    // CASE 5: Video -> Video (.mp4, .mov, .mkv, .webm)
    const vCodec = (config.videoCodec || '').toLowerCase();
    const aCodec = (config.audioCodec || '').toLowerCase();

    const canSmartRemux = (() => {
      if (!config.smartCopy || config.normalizeLoudness) return false;
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
      if (targetExt === 'mkv') {
        return true; // Matroska accepts virtually all video/audio streams losslessly
      }
      if (targetExt === 'webm') {
        const vOk = ['vp8', 'vp9', 'av1'].includes(vCodec);
        const aOk = !inputHasAudio || ['opus', 'vorbis'].includes(aCodec);
        return vOk && aOk;
      }
      return false;
    })();

    if (canSmartRemux) {
      try {
        const remuxArgs = [
          '-y',
          '-i',
          config.inputPath,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-sn',
          '-dn',
          '-c',
          'copy',
          ...(targetExt === 'mp4' || targetExt === 'mov' ? ['-movflags', '+faststart'] : []),
          outPath
        ];

        await this.runFfmpegWithProgress(
          jobId,
          remuxArgs,
          safeDur,
          0,
          100,
          `Smart Copy: Zero-loss container remux to .${targetExt}`,
          onProgress
        );

        return {
          outputFilePath: outPath,
          pills: [
            {
              id: `conv_remux_${targetExt}`,
              label: path.basename(outPath),
              type: 'video',
              filePath: outPath,
              fileName: path.basename(outPath)
            }
          ],
          usedSmartCopy: true
        };
      } catch (remuxErr) {
        if (
          this.cancelledJobs.has(jobId) ||
          /cancelled by user/i.test((remuxErr as Error)?.message ?? '')
        ) {
          throw remuxErr;
        }
        // Clean up partial failed remux container and fall back to transcode
        if (fs.existsSync(outPath)) {
          try {
            fs.unlinkSync(outPath);
          } catch {
            // Ignore unlink error
          }
        }
      }
    }

    // Full Video -> Video Transcode Path
    const vEncoderArgs =
      targetExt === 'webm'
        ? [
            '-c:v',
            'libvpx-vp9',
            '-crf',
            '28',
            '-b:v',
            '0',
            '-pix_fmt',
            'yuv420p',
            '-row-mt',
            '1',
            '-cpu-used',
            '4'
          ]
        : useNvenc
          ? [
              '-c:v',
              'h264_nvenc',
              '-preset',
              'p4',
              '-cq',
              '19',
              '-pix_fmt',
              'yuv420p',
              ...(targetExt === 'mp4' || targetExt === 'mov' ? ['-movflags', '+faststart'] : [])
            ]
          : [
              '-c:v',
              'libx264',
              '-preset',
              'fast',
              '-crf',
              '18',
              '-pix_fmt',
              'yuv420p',
              ...(targetExt === 'mp4' || targetExt === 'mov' ? ['-movflags', '+faststart'] : [])
            ];

    const aEncoderArgs = !inputHasAudio
      ? ['-an']
      : targetExt === 'webm'
        ? [
            ...(config.normalizeLoudness && safeDur >= 3
              ? ['-af', 'loudnorm=I=-14:TP=-1.0:LRA=11']
              : []),
            '-c:a',
            'libopus',
            '-b:a',
            '192k',
            '-ac',
            '2'
          ]
        : buildAudioCodecArgs('m4a');

    await this.runFfmpegWithProgress(
      jobId,
      [
        '-y',
        '-i',
        config.inputPath,
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        ...vEncoderArgs,
        ...aEncoderArgs,
        outPath
      ],
      safeDur,
      0,
      100,
      `Transcoding to .${targetExt.toUpperCase()} via ${targetExt === 'webm' ? 'VP9' : useNvenc ? 'NVENC' : 'CPU libx264'}`,
      onProgress
    );

    return {
      outputFilePath: outPath,
      pills: [
        {
          id: `conv_vid_${targetExt}`,
          label: path.basename(outPath),
          type: 'video',
          filePath: outPath,
          fileName: path.basename(outPath)
        }
      ],
      usedSmartCopy: false
    };
    } finally {
      releaseFilePath(outPath);
    }
  }

  /**
   * Executes one of the 5 Phase 2 Video Fixer & Proxy Deck presets:
   * - 'reel-optimizer': Social Compression Armor & IG Reel Optimizer (Lanczos 1080x1920, Rec.709, VMAF simulation)
   * - 'deflicker': LED / high-shutter deflicker + gradfun de-banding
   * - 'target-size': Exact target file size bitrate solver (NVENC VBR or 2-pass libx264)
   * - 'prores-proxy': 1080p Apple ProRes 422 Proxy (.mov) with 48kHz PCM audio
   * - 'silence-xml': FFmpeg silencedetect -> FCP7/Premiere XML cut list + jump-cut preview MP4
   */
  public async executeFixerJob(
    jobId: string,
    config: FixerJobConfig,
    hasNvenc: boolean,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<{
    outputFilePath: string;
    pills: StemOutputPill[];
    vmafComparison?: {
      rawScore: number;
      optimizedScore: number;
      simulatedPreviewPath?: string;
    };
  }> {
    if (!this.isAvailable()) {
      throw new Error('FFmpeg binary is not available. Check Settings -> Sidecar Binaries.');
    }
    if (!fs.existsSync(config.inputPath)) {
      throw new Error(`Source file does not exist: ${config.inputPath}`);
    }

    const baseName =
      path
        .parse(config.fileName)
        .name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 56) || 'Vortex_Fixer';

    const useNvenc = hasNvenc && config.useHardwareEncoder;
    const safeDur = Math.max(1, config.duration || 15);
    let directOutPath: string | null = null;

    try {
      if (config.preset === 'deflicker') {
        const outPath = getNonCollidingFilePath(config.outputDir, `${baseName}_Deflickered`, 'mp4');
        directOutPath = outPath;
        const winSize = Math.max(3, Math.min(15, config.deflickerWindow || 7));
      const vEncoderArgs = useNvenc
        ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '19']
        : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '18'];

      await this.runFfmpegWithProgress(
        jobId,
        [
          '-y',
          '-i',
          config.inputPath,
          '-vf',
          `deflicker=mode=pm:size=${winSize},gradfun=strength=1.2:radius=8`,
          ...vEncoderArgs,
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          outPath
        ],
        safeDur,
        0,
        100,
        `Deflickering (${winSize}-frame PM window) via ${useNvenc ? 'NVENC' : 'CPU'}`,
        onProgress
      );

      return {
        outputFilePath: outPath,
        pills: [
          {
            id: 'fixer_deflicker',
            label: 'Deflickered_Clean.mp4',
            type: 'video',
            filePath: outPath,
            fileName: path.basename(outPath)
          }
        ]
      };
    }

    if (config.preset === 'target-size') {
      const targetMB = Math.max(2, config.targetSizeMB || 10);
      const outPath = getNonCollidingFilePath(config.outputDir, `${baseName}_${targetMB}MB`, 'mp4');
      directOutPath = outPath;
      const hasAudio = config.audioCodec !== undefined
        ? (Boolean(config.audioCodec) && config.audioCodec.toLowerCase() !== 'none')
        : this.hasAudioStream(config.inputPath);
      const audioKbps = hasAudio ? 128 : 0;
      // Reserve 6% container overhead margin so output strictly stays under the cap
      const totalTargetKbits = targetMB * 8192 * 0.94;
      const videoKbps = Math.max(150, Math.floor(totalTargetKbits / safeDur - audioKbps));
      const maxRateKbps = Math.round(videoKbps * 1.12);
      const bufSizeKbps = videoKbps * 2;
      const audioArgs = hasAudio ? ['-c:a', 'aac', '-b:a', `${audioKbps}k`] : ['-an'];

      if (useNvenc) {
        await this.runFfmpegWithProgress(
          jobId,
          [
            '-y',
            '-i',
            config.inputPath,
            '-c:v',
            'h264_nvenc',
            '-rc',
            'vbr',
            '-b:v',
            `${videoKbps}k`,
            '-maxrate',
            `${maxRateKbps}k`,
            '-bufsize',
            `${bufSizeKbps}k`,
            '-pix_fmt',
            'yuv420p',
            ...audioArgs,
            outPath
          ],
          safeDur,
          0,
          100,
          `Compressing to ${targetMB}MB (${videoKbps} kbps NVENC)`,
          onProgress
        );
      } else {
        // 2-Pass CPU libx264 with isolated per-job passlogfile in tmpdir
        const passLogPrefix = path.join(os.tmpdir(), `ffmpeg2pass_${jobId}`);
        const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null';

        try {
          await this.runFfmpegWithProgress(
            jobId,
            [
              '-y',
              '-i',
              config.inputPath,
              '-c:v',
              'libx264',
              '-b:v',
              `${videoKbps}k`,
              '-pass',
              '1',
              '-passlogfile',
              passLogPrefix,
              '-an',
              '-f',
              'null',
              nullSink
            ],
            safeDur,
            0,
            48,
            `Pass 1/2: Analyzing bitrate envelope (${videoKbps} kbps)`,
            onProgress
          );

          await this.runFfmpegWithProgress(
            jobId,
            [
              '-y',
              '-i',
              config.inputPath,
              '-c:v',
              'libx264',
              '-b:v',
              `${videoKbps}k`,
              '-maxrate',
              `${maxRateKbps}k`,
              '-bufsize',
              `${bufSizeKbps}k`,
              '-pass',
              '2',
              '-passlogfile',
              passLogPrefix,
              '-pix_fmt',
              'yuv420p',
              ...audioArgs,
              outPath
            ],
            safeDur,
            50,
            100,
            `Pass 2/2: Encoding ${targetMB}MB master (${videoKbps} kbps)`,
            onProgress
          );
        } finally {
          // Direct deletion of passlog files without scanning full os.tmpdir()
          for (const suffix of ['-0.log', '-0.log.mbtree', '-0.log.temp']) {
            try {
              const p = `${passLogPrefix}${suffix}`;
              if (fs.existsSync(p)) fs.unlinkSync(p);
            } catch {}
          }
        }
      }

      return {
        outputFilePath: outPath,
        pills: [
          {
            id: 'fixer_compressed',
            label: `Compressed_${targetMB}MB.mp4`,
            type: 'video',
            filePath: outPath,
            fileName: path.basename(outPath)
          }
        ]
      };
    }

    if (config.preset === 'prores-proxy') {
      const outPath = getNonCollidingFilePath(config.outputDir, `${baseName}_ProRes_Proxy`, 'mov');
      directOutPath = outPath;
      await this.runFfmpegWithProgress(
        jobId,
        [
          '-y',
          '-i',
          config.inputPath,
          '-vf',
          "scale=-2:'min(1080,ih)'",
          '-c:v',
          'prores_ks',
          '-profile:v',
          '0',
          '-vendor',
          'apl0',
          '-pix_fmt',
          'yuv422p10le',
          '-c:a',
          'pcm_s16le',
          '-ar',
          '48000',
          '-ac',
          '2',
          outPath
        ],
        safeDur,
        0,
        100,
        'Transcoding 1080p Apple ProRes 422 Proxy (.mov)',
        onProgress
      );

      return {
        outputFilePath: outPath,
        pills: [
          {
            id: 'fixer_proxy',
            label: 'ProRes_422_Proxy.mov',
            type: 'proxy',
            filePath: outPath,
            fileName: path.basename(outPath)
          }
        ]
      };
    }

    if (config.preset === 'reel-optimizer') {
      const options: ReelOptimizerOptions = config.reelOptimizer || {
        platform: 'ig-reels',
        targetFps: 'keep',
        preSharpen: 'subtle',
        denoiseGrain: true,
        colorFixRec709: true,
        simulateIgCompression: true
      };

      const platformTagMap: Record<string, string> = {
        'ig-reels': 'IG_Reel',
        'tiktok': 'TikTok',
        'yt-shorts': 'YT_Shorts'
      };
      const platformTag = platformTagMap[options.platform] || 'Social';

      // Keep subfolder if 2 files output (clean master + simulated IG compression preview); direct export if 1 file
      const isMultiOutput = Boolean(options.simulateIgCompression);
      const jobFolder = isMultiOutput
        ? path.join(config.outputDir, `${baseName}_${jobId.slice(0, 6)}`)
        : config.outputDir;
      if (isMultiOutput && !fs.existsSync(jobFolder)) {
        fs.mkdirSync(jobFolder, { recursive: true });
      }

      const outPath = isMultiOutput
        ? path.join(jobFolder, `${baseName}_${platformTag}_Armored.mp4`)
        : getNonCollidingFilePath(config.outputDir, `${baseName}_${platformTag}_Armored`, 'mp4');
      if (!isMultiOutput) {
        directOutPath = outPath;
      }

      // 1. High-precision filter chain with safe even-dimension padding
      const filterParts: string[] = [REEL_SCALE_PAD_FILTER];

      if (options.denoiseGrain) {
        filterParts.push('hqdn3d=1.5:1.5:3:3');
      }

      if (options.preSharpen === 'subtle') {
        filterParts.push('unsharp=3:3:0.5:3:3:0.0');
      } else if (options.preSharpen === 'crisp') {
        filterParts.push('unsharp=3:3:0.85:3:3:0.0');
      }

      if (options.targetFps === '30') {
        filterParts.push('fps=30');
      } else if (options.targetFps === '60') {
        filterParts.push('fps=60');
      } else if (config.fps > 0) {
        // 'keep' still locks CFR at the probed rate so VFR phone footage does not stay variable
        filterParts.push(`fps=${config.fps}`);
      }

      const vfFilter = filterParts.join(',');

      // 2. Video encoder args with dynamic keyframe interval and thread clamping
      const targetFpsNum =
        options.targetFps === '30'
          ? 30
          : options.targetFps === '60'
            ? 60
            : (config.fps || 30);
      const keyint = Math.max(24, Math.round(targetFpsNum * 2));
      const threadCount = Math.max(1, Math.min(os.cpus().length - 2, 8));
      const hasX264 = this.hasEncoder('libx264');

      const vEncoderArgs = useNvenc
        ? [
            '-c:v',
            'h264_nvenc',
            '-preset',
            'p5',
            '-rc:v',
            'vbr',
            '-cq',
            '18',
            '-b:v',
            '0',
            '-maxrate',
            '12M',
            '-bufsize',
            '24M',
            '-g',
            String(keyint),
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart'
          ]
        : hasX264
          ? [
              '-c:v',
              'libx264',
              '-preset',
              'slow',
              '-profile:v',
              'high',
              '-level:v',
              '4.2',
              '-crf',
              '18',
              '-maxrate',
              '12M',
              '-bufsize',
              '24M',
              '-x264-params',
              `aq-mode=3:aq-strength=0.9:deblock=-1,-1:rc-lookahead=${Math.min(60, keyint)}:keyint=${keyint}`,
              '-threads',
              String(threadCount),
              '-pix_fmt',
              'yuv420p',
              '-movflags',
              '+faststart'
            ]
          : [
              '-c:v',
              'h264',
              '-crf',
              '18',
              '-pix_fmt',
              'yuv420p',
              '-movflags',
              '+faststart'
            ];

      // 3. Rec.709 Color lock parameters
      const colorArgs = options.colorFixRec709
        ? [
            '-colorspace',
            'bt709',
            '-color_primaries',
            'bt709',
            '-color_trc',
            'bt709',
            '-color_range',
            'tv'
          ]
        : [];

      // 4. Loudness normalization; skipped for silent inputs (no audio stream) and clips under 3s
      const hasAudio = config.audioCodec !== undefined
        ? (Boolean(config.audioCodec) && config.audioCodec.toLowerCase() !== 'none')
        : this.hasAudioStream(config.inputPath);
      const audioArgs = !hasAudio
        ? ['-an']
        : safeDur >= 3
        ? [
            '-af',
            'loudnorm=I=-14:TP=-1.0:LRA=11',
            '-c:a',
            'aac',
            '-b:a',
            '320k',
            '-ar',
            '48000'
          ]
        : [
            '-c:a',
            'aac',
            '-b:a',
            '320k',
            '-ar',
            '48000'
          ];

      const mainEndPct = options.simulateIgCompression ? 75 : 100;

      await this.runFfmpegWithProgress(
        jobId,
        [
          '-y',
          '-i',
          config.inputPath,
          '-vf',
          vfFilter,
          ...vEncoderArgs,
          ...colorArgs,
          ...audioArgs,
          outPath
        ],
        safeDur,
        0,
        mainEndPct,
        `Armoring Social 9:16 Master (${platformTag})`,
        onProgress
      );

      let vmafComparison:
        | { rawScore: number; optimizedScore: number; simulatedPreviewPath?: string }
        | undefined;
      let simulatedPreviewPath: string | undefined;

      // Simulation is an optional extra: a failure never blocks the armored master.
      if (options.simulateIgCompression) {
        onProgress({
          jobId,
          stage: 'remuxing',
          progress: 78,
          statusMessage: 'Simulating platform compression & measuring quality retention...'
        });

        try {
          const sim = await this.runIgCompressionSimulation(
            jobId,
            config.inputPath,
            outPath,
            jobFolder,
            baseName,
            safeDur,
            onProgress
          );
          simulatedPreviewPath = sim.simulatedPreviewPath;
          if (sim.rawScore !== null && sim.optimizedScore !== null) {
            vmafComparison = {
              rawScore: sim.rawScore,
              optimizedScore: sim.optimizedScore,
              simulatedPreviewPath
            };
          }
        } catch (simErr) {
          if (/cancel/i.test((simErr as Error).message ?? '')) {
            throw simErr;
          }
          console.warn('Simulation failed; delivering armored master without quality badge:', simErr);
        }
      }

      const pills: StemOutputPill[] = [
        {
          id: 'fixer_reel_optimizer',
          label: `${platformTag}_Armored.mp4`,
          type: 'video',
          filePath: outPath,
          fileName: path.basename(outPath)
        }
      ];

      if (simulatedPreviewPath && fs.existsSync(simulatedPreviewPath)) {
        pills.push({
          id: 'fixer_sim_preview',
          label: 'Simulated_IG_Constrained.mp4',
          type: 'video',
          filePath: simulatedPreviewPath,
          fileName: path.basename(simulatedPreviewPath)
        });
      }

      return {
        outputFilePath: outPath,
        pills,
        vmafComparison
      };
    }

    // Preset: 'silence-xml' (Dead-Air Silence Chopper -> Premiere Pro FCP7 XML + Jump-Cut Preview MP4: 2 output files)
    const hasAudio = config.audioCodec !== undefined
      ? (Boolean(config.audioCodec) && config.audioCodec.toLowerCase() !== 'none')
      : this.hasAudioStream(config.inputPath);
    if (!hasAudio) {
      throw new Error('Video contains no audio track for silence detection.');
    }

    const jobFolder = path.join(config.outputDir, `${baseName}_${jobId.slice(0, 6)}`);
    if (!fs.existsSync(jobFolder)) {
      fs.mkdirSync(jobFolder, { recursive: true });
    }

    const xmlPath = path.join(jobFolder, `${baseName}_Premiere_Cuts.xml`);
    const jumpCutPath = path.join(jobFolder, `${baseName}_JumpCut.mp4`);

    const segments = await this.detectSpeechSegments(
      jobId,
      config.inputPath,
      safeDur,
      config.silenceThresholdDb || -30,
      config.silenceMinDuration || 0.5,
      onProgress
    );

    this.writePremiereXml(xmlPath, config, segments);

    const pills: StemOutputPill[] = [
      {
        id: 'fixer_xml',
        label: 'Premiere_Timeline.xml',
        type: 'xml',
        filePath: xmlPath,
        fileName: path.basename(xmlPath)
      }
    ];

    // Also render a ready-to-play jump-cut MP4 if speech segments were isolated (isolated in try/catch per MJ-4)
    if (segments.length > 0 && segments.length <= 75) {
      try {
        const expr = segments
          .map((s) => `between(t,${s.start.toFixed(3)},${s.end.toFixed(3)})`)
          .join('+');
        const vEncoderArgs = useNvenc
          ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20']
          : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20'];

        await this.runFfmpegWithProgress(
          jobId,
          [
            '-y',
            '-i',
            config.inputPath,
            '-vf',
            `select='${expr}',setpts=N/FRAME_RATE/TB`,
            '-af',
            `aselect='${expr}',asetpts=N/SR/TB`,
            ...vEncoderArgs,
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            jumpCutPath
          ],
          safeDur,
          55,
          100,
          `Rendering ${segments.length} jump-cut speech segments`,
          onProgress
        );

        if (fs.existsSync(jumpCutPath)) {
          pills.push({
            id: 'fixer_jumpcut',
            label: `JumpCut_${segments.length}Clips.mp4`,
            type: 'video',
            filePath: jumpCutPath,
            fileName: path.basename(jumpCutPath)
          });
        }
      } catch (err) {
        if ((err as Error).message?.toLowerCase().includes('cancelled by user')) {
          throw err;
        }
        // Keep primary Premiere XML deliverable even if jump-cut preview fails
      }
    }

    return {
      outputFilePath: xmlPath,
      pills
    };
    } finally {
      if (directOutPath) {
        releaseFilePath(directOutPath);
      }
    }
  }

  private runFfmpegWithProgress(
    jobId: string,
    args: string[],
    durationSec: number,
    startPct: number,
    endPct: number,
    labelPrefix: string,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<void> {
    const ffmpegBin = this.getFfmpegPath();
    const span = Math.max(1, endPct - startPct);

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      this.activeProcesses.set(jobId, proc);
      proc.stdout?.resume();

      let stderrTail = '';

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrTail = (stderrTail + text).slice(-1800);

        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        const speedMatch = text.match(/speed=\s*([0-9.]+x)/);
        if (timeMatch && durationSec > 0) {
          const secs =
            parseInt(timeMatch[1], 10) * 3600 +
            parseInt(timeMatch[2], 10) * 60 +
            parseFloat(timeMatch[3]);
          const ratio = Math.min(1, Math.max(0, secs / durationSec));
          const pct = Math.min(99, Math.round(startPct + ratio * span));
          onProgress({
            jobId,
            stage: 'remuxing',
            progress: pct,
            speed: speedMatch ? speedMatch[1] : undefined,
            statusMessage: `${labelPrefix} (${pct}%)...`
          });
        }
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
          const lastLine = stderrTail.trim().split(/\r?\n/).pop() || `FFmpeg exited with code ${code}`;
          reject(new Error(lastLine));
        }
      });
    });
  }

  private detectSpeechSegments(
    jobId: string,
    inputPath: string,
    durationSec: number,
    thresholdDb: number,
    minSilenceDur: number,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<Array<{ start: number; end: number }>> {
    const ffmpegBin = this.getFfmpegPath();
    const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null';

    return new Promise((resolve, reject) => {
      const args = [
        '-i',
        inputPath,
        '-af',
        `silencedetect=noise=${thresholdDb}dB:d=${minSilenceDur}`,
        '-f',
        'null',
        nullSink
      ];

      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      this.activeProcesses.set(jobId, proc);
      proc.stdout?.resume();

      let fullLog = '';

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        fullLog += text;
        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch && durationSec > 0) {
          const secs =
            parseInt(timeMatch[1], 10) * 3600 +
            parseInt(timeMatch[2], 10) * 60 +
            parseFloat(timeMatch[3]);
          const pct = Math.min(50, Math.round((secs / durationSec) * 50));
          onProgress({
            jobId,
            stage: 'remuxing',
            progress: pct,
            statusMessage: `Scanning audio for dead air (${thresholdDb}dB, ${minSilenceDur}s)...`
          });
        }
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
        if (code !== 0) {
          reject(new Error(`Silence scan exited with code ${code}`));
          return;
        }

        const silences: Array<{ start: number; end: number }> = [];
        let currentStart: number | null = null;

        for (const line of fullLog.split(/\r?\n/)) {
          const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
          if (startMatch) {
            currentStart = parseFloat(startMatch[1]);
          }
          const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
          if (endMatch && currentStart !== null) {
            const endVal = parseFloat(endMatch[1]);
            if (endVal > currentStart) {
              silences.push({ start: currentStart, end: endVal });
            }
            currentStart = null;
          }
        }
        if (currentStart !== null && currentStart < durationSec) {
          silences.push({ start: currentStart, end: durationSec });
        }

        // Invert silence intervals into active speech segments with 60ms natural breath padding
        const pad = 0.06;
        const speech: Array<{ start: number; end: number }> = [];
        let cursor = 0;

        for (const s of silences) {
          const paddedSilenceStart = Math.max(cursor, s.start + pad);
          const paddedSilenceEnd = Math.min(durationSec, Math.max(paddedSilenceStart, s.end - pad));
          if (paddedSilenceStart - cursor >= 0.18) {
            speech.push({ start: Number(cursor.toFixed(3)), end: Number(paddedSilenceStart.toFixed(3)) });
          }
          cursor = paddedSilenceEnd;
        }
        if (durationSec - cursor >= 0.18) {
          speech.push({ start: Number(cursor.toFixed(3)), end: Number(durationSec.toFixed(3)) });
        }

        if (speech.length === 0) {
          speech.push({ start: 0, end: durationSec });
        }

        resolve(speech);
      });
    });
  }

  /**
   * Generates a Final Cut Pro 7 / Adobe Premiere Pro / DaVinci Resolve compatible
   * xmeml version="5" non-destructive timeline XML with all silent pauses removed.
   */
  private writePremiereXml(
    xmlPath: string,
    config: FixerJobConfig,
    segments: Array<{ start: number; end: number }>
  ): void {
    const rawFps = config.fps || 30;
    const isNtsc =
      Math.abs(rawFps - 23.976) < 0.06 ||
      Math.abs(rawFps - 29.97) < 0.06 ||
      Math.abs(rawFps - 59.94) < 0.08;
    const ntscFlag = isNtsc ? 'TRUE' : 'FALSE';
    const fps = Math.max(1, Math.round(rawFps));
    const width = config.width || 1920;
    const height = config.height || 1080;
    const totalSourceFrames = Math.max(1, Math.round(config.duration * fps));
    // Premiere Pro / FCP7 XML expects file://localhost/D%3a/... on Windows (MJ-3)
    const rawFileUrl = pathToFileURL(config.inputPath).toString();
    const fileUrl =
      process.platform === 'win32'
        ? rawFileUrl.replace(/^file:\/\/\/([A-Za-z]):/, 'file://localhost/$1%3a')
        : rawFileUrl.replace(/^file:\/\/\//, 'file://localhost/');
    const esc = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    let timelineCursor = 0;
    const videoClipItems: string[] = [];
    const audioClipItems: string[] = [];

    segments.forEach((seg, idx) => {
      const inFrame = Math.max(0, Math.round(seg.start * fps));
      const outFrame = Math.max(inFrame + 1, Math.round(seg.end * fps));
      const clipDurFrames = outFrame - inFrame;
      const startTimeline = timelineCursor;
      const endTimeline = timelineCursor + clipDurFrames;
      timelineCursor = endTimeline;

      const fileElement =
        idx === 0
          ? `<file id="file-1">
              <name>${esc(config.fileName)}</name>
              <pathurl>${esc(fileUrl)}</pathurl>
              <rate><timebase>${fps}</timebase><ntsc>${ntscFlag}</ntsc></rate>
              <duration>${totalSourceFrames}</duration>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height></samplecharacteristics></video>
                <audio><channelcount>2</channelcount><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></audio>
              </media>
            </file>`
          : `<file id="file-1"/>`;

      videoClipItems.push(`
          <clipitem id="vclip-${idx + 1}">
            <name>${esc(config.fileName)} (Cut ${idx + 1})</name>
            <enabled>TRUE</enabled>
            <duration>${totalSourceFrames}</duration>
            <rate><timebase>${fps}</timebase><ntsc>${ntscFlag}</ntsc></rate>
            <start>${startTimeline}</start>
            <end>${endTimeline}</end>
            <in>${inFrame}</in>
            <out>${outFrame}</out>
            ${fileElement}
          </clipitem>`);

      audioClipItems.push(`
          <clipitem id="aclip-${idx + 1}">
            <name>${esc(config.fileName)} (Audio ${idx + 1})</name>
            <enabled>TRUE</enabled>
            <duration>${totalSourceFrames}</duration>
            <rate><timebase>${fps}</timebase><ntsc>${ntscFlag}</ntsc></rate>
            <start>${startTimeline}</start>
            <end>${endTimeline}</end>
            <in>${inFrame}</in>
            <out>${outFrame}</out>
            <file id="file-1"/>
          </clipitem>`);
    });

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence id="vortex-silence-sequence">
    <name>${esc(path.parse(config.fileName).name)}_SilenceCuts (${segments.length} clips)</name>
    <duration>${Math.max(1, timelineCursor)}</duration>
    <rate>
      <timebase>${fps}</timebase>
      <ntsc>${ntscFlag}</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <rate><timebase>${fps}</timebase><ntsc>${ntscFlag}</ntsc></rate>
            <width>${width}</width>
            <height>${height}</height>
            <pixelaspectratio>square</pixelaspectratio>
          </samplecharacteristics>
        </format>
        <track>${videoClipItems.join('\n')}
        </track>
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <depth>16</depth>
            <samplerate>48000</samplerate>
          </samplecharacteristics>
        </format>
        <track>${audioClipItems.join('\n')}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
`;

    fs.writeFileSync(xmlPath, xmlContent, 'utf8');
  }

  /**
   * Generates a valid playable 48kHz 16-bit stereo WAV file with a subtle synthesized harmonic chord
   * when operating in fallback simulation mode so that WaveSurfer preview and NLE drag-and-drop
   * always receive real, valid, frame-accurate media files on disk.
   */
  public writeValidSilentWav(
    targetPath: string,
    durationSec = 6,
    freqHz = 220
  ): void {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sampleRate = 48000;
    const numChannels = 2;
    const bitsPerSample = 16;
    const safeDuration = Math.max(2, Math.min(durationSec, 12));
    const numSamples = Math.floor(sampleRate * safeDuration);
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF WAVE header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
    buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Synthesize a clean rhythmic envelope so waveform preview shows distinct dynamics
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const beatEnv = Math.exp(-((t * 2.5) % 1) * 4.5);
      const wave =
        Math.sin(2 * Math.PI * freqHz * t) * 0.6 +
        Math.sin(2 * Math.PI * (freqHz * 1.5) * t) * 0.3 +
        Math.sin(2 * Math.PI * (freqHz * 2) * t) * 0.1;
      const sample = Math.max(-1, Math.min(1, wave * beatEnv * 0.45));
      const intSample = Math.floor(sample * 32767);
      buffer.writeInt16LE(intSample, offset);
      buffer.writeInt16LE(intSample, offset + 2);
      offset += 4;
    }

    fs.writeFileSync(targetPath, buffer);
  }

  /**
   * Simulates constrained Instagram / TikTok server-side recompression (3.5Mbps cap, fast CRF 25)
   * on a 5-second slice of both the armored master and the raw upload. Both compressed slices are
   * scored against the same original source (scaled to 1080x1920) with VMAF, or SSIM if libvmaf is absent.
   * Scores are null when no metric filter is available.
   */
  private async runIgCompressionSimulation(
    jobId: string,
    rawInputPath: string,
    armoredOutputPath: string,
    jobFolder: string,
    baseName: string,
    durationSec: number,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<{ rawScore: number | null; optimizedScore: number | null; simulatedPreviewPath?: string }> {
    const sliceDur = Math.min(5, Math.max(1, durationSec));
    const sliceStart = Math.max(0, (durationSec - sliceDur) / 2);

    const simPreviewPath = path.join(jobFolder, `${baseName}_IG_Simulated_Preview.mp4`);
    const rawSimPath = path.join(jobFolder, `${baseName}_temp_raw_sim.mp4`);
    const simEncoder = this.hasEncoder('libx264') ? 'libx264' : 'h264';
    const constrainedArgs = [
      '-c:v',
      simEncoder,
      '-preset',
      'fast',
      '-crf',
      '25',
      '-maxrate',
      '3.5M',
      '-bufsize',
      '7M',
      '-pix_fmt',
      'yuv420p'
    ];
    const slice = ['-ss', sliceStart.toFixed(2), '-t', sliceDur.toFixed(2)];

    // 1. Constrained transcode of the armored master
    await this.runProcessAsync(jobId, [
      '-y',
      ...slice,
      '-i',
      armoredOutputPath,
      ...constrainedArgs,
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      simPreviewPath
    ]);

    onProgress({
      jobId,
      stage: 'remuxing',
      progress: 84,
      statusMessage: 'Measuring armored quality retention (VMAF/SSIM)...'
    });

    // 2. Armored score vs original source
    const optimizedScore = await this.measureQualityScore(
      jobId,
      simPreviewPath,
      rawInputPath,
      sliceStart,
      sliceDur,
      REEL_SCALE_PAD_FILTER
    );

    onProgress({
      jobId,
      stage: 'remuxing',
      progress: 90,
      statusMessage: 'Simulating raw video constrained upload transcode...'
    });

    let rawScore: number | null = null;
    try {
      // 3. Constrained transcode of the raw source (scaled to 1080x1920)
      await this.runProcessAsync(jobId, [
        '-y',
        ...slice,
        '-i',
        rawInputPath,
        '-vf',
        REEL_SCALE_PAD_FILTER,
        ...constrainedArgs,
        '-an',
        rawSimPath
      ]);

      onProgress({
        jobId,
        stage: 'remuxing',
        progress: 96,
        statusMessage: 'Measuring raw baseline retention score...'
      });

      // 4. Raw score vs original source
      rawScore = await this.measureQualityScore(
        jobId,
        rawSimPath,
        rawInputPath,
        sliceStart,
        sliceDur,
        REEL_SCALE_PAD_FILTER
      );
    } finally {
      try {
        if (fs.existsSync(rawSimPath)) {
          fs.unlinkSync(rawSimPath);
        }
      } catch {
        // Ignore cleanup error
      }
    }

    return {
      rawScore: rawScore === null ? null : Number(rawScore.toFixed(1)),
      optimizedScore: optimizedScore === null ? null : Number(optimizedScore.toFixed(1)),
      simulatedPreviewPath: fs.existsSync(simPreviewPath) ? simPreviewPath : undefined
    };
  }

  /**
   * Computes perceptual quality score (0-100) using libvmaf or ssim fallback.
   */
  private async measureQualityScore(
    jobId: string,
    simPath: string,
    refPath: string,
    sliceStart: number,
    sliceDur: number,
    refFilter?: string
  ): Promise<number | null> {
    const hasVmaf = this.hasFilter('libvmaf');
    const hasSsim = this.hasFilter('ssim');

    // Attempt 1: libvmaf
    if (hasVmaf) {
      try {
        const filterComplex = refFilter
          ? `[1:v]${refFilter}[ref];[0:v][ref]libvmaf`
          : '[0:v][1:v]libvmaf';

        const args = [
          '-i',
          simPath,
          '-ss',
          sliceStart.toFixed(2),
          '-t',
          sliceDur.toFixed(2),
          '-i',
          refPath,
          '-filter_complex',
          filterComplex,
          '-f',
          'null',
          process.platform === 'win32' ? 'NUL' : '/dev/null'
        ];

        const output = await this.runProcessAsync(jobId, args);
        const match = output.match(/VMAF score:\s*([0-9.]+)/i);
        if (match) {
          const val = parseFloat(match[1]);
          if (Number.isFinite(val) && val > 0) {
            return Math.min(100, Math.max(0, val));
          }
        }
      } catch (err) {
        if (/cancel/i.test((err as Error).message ?? '')) throw err;
        // Fall back to SSIM
      }
    }

    // Attempt 2: ssim
    if (hasSsim) {
      try {
        const filterComplex = refFilter
          ? `[1:v]${refFilter}[ref];[0:v][ref]ssim`
          : '[0:v][1:v]ssim';

        const args = [
          '-i',
          simPath,
          '-ss',
          sliceStart.toFixed(2),
          '-t',
          sliceDur.toFixed(2),
          '-i',
          refPath,
          '-filter_complex',
          filterComplex,
          '-f',
          'null',
          process.platform === 'win32' ? 'NUL' : '/dev/null'
        ];

        const output = await this.runProcessAsync(jobId, args);
        const match = output.match(/SSIM.*?All:([0-9.]+)/i) || output.match(/SSIM.*?Y:([0-9.]+)/i);
        if (match) {
          const ssimVal = parseFloat(match[1]);
          if (Number.isFinite(ssimVal) && ssimVal > 0) {
            // Convert SSIM (0-1) to 0-100 perceptual retention score
            const perceptual = Math.min(99.0, Math.max(20.0, ssimVal * 100));
            return Number(perceptual.toFixed(1));
          }
        }
      } catch (err) {
        if (/cancel/i.test((err as Error).message ?? '')) throw err;
        // Fall back to null
      }
    }

    return null;
  }

  /**
   * Spawns an internal FFmpeg utility worker and drains stdout to prevent 64KB pipe stall.
   */
  private runProcessAsync(jobId: string, args: string[]): Promise<string> {
    const ffmpegBin = this.getFfmpegPath();

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      this.activeProcesses.set(jobId, proc);

      // Drain stdout immediately (critical: prevents 64KB pipe stall)
      proc.stdout?.resume();

      let fullStderr = '';

      proc.stderr.on('data', (chunk: Buffer) => {
        fullStderr += chunk.toString();
        if (fullStderr.length > 32768) {
          fullStderr = fullStderr.slice(-16384);
        }
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
          resolve(fullStderr);
        } else {
          const lastLine = fullStderr.trim().split(/\r?\n/).pop() || `Process exited with code ${code}`;
          reject(new Error(lastLine));
        }
      });
    });
  }
}
