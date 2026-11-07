import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  FixerJobConfig,
  JobProgressEvent,
  LocalVideoMetadata,
  StemOutputPill
} from '../../src/types/media';
import { killProcessTree } from './BinaryManager';

export class FfmpegRunner {
  private activeProcesses = new Map<string, ChildProcess>();
  private cancelledJobs = new Set<string>();

  constructor(private getFfmpegPath: () => string, private isAvailable: () => boolean) {}

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
  public probeLocalVideo(
    filePath: string,
    ffprobePath: string,
    isFfprobeAvailable: boolean
  ): LocalVideoMetadata {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    const fileSizeMB = Number((stat.size / (1024 * 1024)).toFixed(2));
    const fileName = path.basename(filePath);

    let duration = 30;
    let width = 1920;
    let height = 1080;
    let fps = 30;
    let videoCodec = 'h264';
    let audioCodec = 'aac';

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
          const vStream = streams.find((s) => s.codec_type === 'video');
          const aStream = streams.find((s) => s.codec_type === 'audio');

          if (vStream) {
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
          }
          if (aStream && typeof aStream.codec_name === 'string') {
            audioCodec = aStream.codec_name;
          }
        }
      } catch {
        // Fallback to defaults if ffprobe fails on an unusual container
      }
    }

    return {
      filePath,
      fileName,
      fileSizeMB,
      duration,
      width,
      height,
      fps,
      videoCodec,
      audioCodec
    };
  }

  /**
   * Executes one of the 4 Phase 2 Video Fixer & Proxy Deck presets:
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
  ): Promise<{ outputFilePath: string; pills: StemOutputPill[] }> {
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

    const jobFolder = path.join(config.outputDir, `${baseName}_${jobId.slice(0, 6)}`);
    if (!fs.existsSync(jobFolder)) {
      fs.mkdirSync(jobFolder, { recursive: true });
    }

    const useNvenc = hasNvenc && config.useHardwareEncoder;
    const safeDur = Math.max(1, config.duration || 15);

    if (config.preset === 'deflicker') {
      const outPath = path.join(jobFolder, `${baseName}_Deflickered.mp4`);
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
      const outPath = path.join(jobFolder, `${baseName}_${targetMB}MB.mp4`);
      const audioKbps = 128;
      // Reserve 6% container overhead margin so output strictly stays under the cap
      const totalTargetKbits = targetMB * 8192 * 0.94;
      const videoKbps = Math.max(150, Math.floor(totalTargetKbits / safeDur - audioKbps));
      const maxRateKbps = Math.round(videoKbps * 1.12);
      const bufSizeKbps = videoKbps * 2;

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
            '-c:a',
            'aac',
            '-b:a',
            `${audioKbps}k`,
            outPath
          ],
          safeDur,
          0,
          100,
          `Compressing to ${targetMB}MB (${videoKbps} kbps NVENC)`,
          onProgress
        );
      } else {
        // 2-Pass CPU libx264 with isolated per-job passlogfile (fixes DS-6 collision risk)
        const passLogPrefix = path.join(jobFolder, `ffmpeg2pass_${jobId}`);
        const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null';

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
            '-c:a',
            'aac',
            '-b:a',
            `${audioKbps}k`,
            outPath
          ],
          safeDur,
          50,
          100,
          `Pass 2/2: Encoding ${targetMB}MB master (${videoKbps} kbps)`,
          onProgress
        );

        // Clean up temporary 2-pass log artifacts
        try {
          for (const f of fs.readdirSync(jobFolder)) {
            if (f.startsWith(`ffmpeg2pass_${jobId}`)) {
              fs.unlinkSync(path.join(jobFolder, f));
            }
          }
        } catch {
          // Ignore cleanup errors
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
      const outPath = path.join(jobFolder, `${baseName}_ProRes_Proxy.mov`);
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

    // Preset: 'silence-xml' (Dead-Air Silence Chopper -> Premiere Pro FCP7 XML + Jump-Cut Preview MP4)
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
    const totalSourceFrames = Math.max(1, Math.round(config.duration * rawFps));
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
      const inFrame = Math.max(0, Math.round(seg.start * rawFps));
      const outFrame = Math.max(inFrame + 1, Math.round(seg.end * rawFps));
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
}
