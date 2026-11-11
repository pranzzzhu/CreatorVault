import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  BrowserSource,
  JobConfig,
  JobProgressEvent,
  MediaFormatOption,
  MediaMetadata,
  SourcePlatform
} from '../../src/types/media';
import { killProcessTree } from './BinaryManager';
import { getNonCollidingFilePath, releaseFilePath } from './FileUtils';
import type { FfmpegRunner } from './FfmpegRunner';

export class YtDlpRunner {
  private activeProcesses = new Map<string, ChildProcess>();
  private cancelledJobs = new Set<string>();

  constructor(
    private getYtDlpPath: () => string,
    private isYtDlpAvailable: () => boolean,
    private getFfmpegPath: () => string,
    private isFfmpegAvailable: () => boolean,
    private ffmpegRunner: FfmpegRunner
  ) {}

  public static detectPlatform(url: string): SourcePlatform {
    const lower = url.toLowerCase();
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
    if (lower.includes('instagram.com')) return 'Instagram';
    if (lower.includes('tiktok.com')) return 'TikTok';
    if (lower.includes('twitter.com') || lower.includes('x.com')) return 'X';
    if (lower.includes('soundcloud.com')) return 'SoundCloud';
    if (lower.includes('twitch.tv')) return 'Twitch';
    return 'Direct';
  }

  public static defaultQualities(editReadyMode = true): MediaFormatOption[] {
    return [
      {
        id: '4K',
        label: '4K Ultra HD (2160p)',
        resolution: '3840x2160',
        codecBadge: editReadyMode ? 'MP4' : 'MKV',
        isAudioOnly: false
      },
      {
        id: '1440p',
        label: '2K QHD (1440p)',
        resolution: '2560x1440',
        codecBadge: editReadyMode ? 'MP4' : 'WEBM',
        isAudioOnly: false
      },
      {
        id: '1080p',
        label: '1080p Full HD',
        resolution: '1920x1080',
        codecBadge: 'MP4',
        isAudioOnly: false
      },
      {
        id: '720p',
        label: '720p HD',
        resolution: '1280x720',
        codecBadge: 'MP4',
        isAudioOnly: false
      },
      {
        id: 'audio-wav',
        label: 'WAV Audio (Best for Editing)',
        codecBadge: 'WAV',
        isAudioOnly: true
      },
      {
        id: 'audio-mp3',
        label: 'MP3 Audio (Small Size)',
        codecBadge: 'MP3',
        isAudioOnly: true
      }
    ];
  }

  public static formatSecondsToTimestamp(seconds: number): string {
    const safe = Math.max(0, seconds);
    const totalHundredths = Math.round(safe * 100);
    const totalSecs = Math.floor(totalHundredths / 100);
    const hundredths = String(totalHundredths % 100).padStart(2, '0');
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${hundredths}`;
  }

  public async probeUrl(
    url: string,
    browserCookies: BrowserSource,
    simulateFallback: boolean
  ): Promise<MediaMetadata> {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      throw new Error('Please provide a valid media URL.');
    }

    if (!this.isYtDlpAvailable()) {
      if (simulateFallback) {
        return this.buildSimulatedMetadata(cleanUrl);
      }
      throw new Error(
        'yt-dlp binary not found in ./bin or system PATH. Enable Simulation Mode or install yt-dlp.'
      );
    }

    // Strip tracking query params on Instagram Reels/Posts that can trigger redirect blocks
    let normalizedUrl = cleanUrl;
    if (cleanUrl.includes('instagram.com/')) {
      try {
        const parsedUrl = new URL(cleanUrl);
        parsedUrl.search = '';
        normalizedUrl = parsedUrl.toString();
      } catch {
        normalizedUrl = cleanUrl;
      }
    }

    try {
      return await this.runYtDlpProbe(normalizedUrl, browserCookies);
    } catch (firstErr) {
      const msg = (firstErr as Error).message || '';

      // If browser cookie DB was locked (common on Windows Chrome/Brave/Edge while open)
      // retry once without cookies so public Instagram Reels still resolve
      if (
        browserCookies !== 'none' &&
        (msg.includes('Permission denied') ||
          msg.includes('Could not copy Chrome cookie database') ||
          msg.includes('database is locked'))
      ) {
        try {
          return await this.runYtDlpProbe(normalizedUrl, 'none');
        } catch (retryErr) {
          throw new Error(
            `${browserCookies.toUpperCase()} cookie database is locked while the browser is open on Windows. Close ${browserCookies} (or switch to Firefox cookies) and try again. (${(retryErr as Error).message})`
          );
        }
      }

      throw firstErr;
    }
  }

  private isNodeAvailable(): boolean {
    try {
      const res = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], {
        windowsHide: true,
        timeout: 1500
      });
      return res.status === 0;
    } catch {
      return false;
    }
  }

  private runYtDlpProbe(
    targetUrl: string,
    browserCookies: BrowserSource
  ): Promise<MediaMetadata> {
    const isYouTube =
      targetUrl.includes('youtube.com/') || targetUrl.includes('youtu.be/');
    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--ignore-no-formats-error'
    ];

    if (isYouTube && this.isNodeAvailable()) {
      args.push('--js-runtimes', 'node');
    } else if (!isYouTube) {
      // Pass a clean desktop User-Agent only for non-YouTube platforms (e.g. Instagram Reels)
      args.push(
        '--user-agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );
    }

    if (browserCookies && browserCookies !== 'none') {
      args.push('--cookies-from-browser', browserCookies);
    }
    args.push(targetUrl);

    const ytDlpBin = this.getYtDlpPath();

    return new Promise<MediaMetadata>((resolve, reject) => {
      const proc = spawn(ytDlpBin, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        reject(err);
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim().length > 0) {
          try {
            const raw = JSON.parse(stdout);
            const duration = typeof raw.duration === 'number' && raw.duration > 0 ? raw.duration : 30;
            const platform = YtDlpRunner.detectPlatform(targetUrl);
            resolve({
              url: targetUrl,
              id: raw.id || `vtx_${Date.now()}`,
              title: raw.title || raw.description?.slice(0, 72) || `${platform} Clip [${raw.id || 'Media'}]`,
              uploader: raw.uploader || raw.channel || raw.uploader_id || platform,
              duration,
              thumbnail:
                raw.thumbnail ||
                'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=900&auto=format&fit=crop&q=80',
              platform,
              webpageUrl: raw.webpage_url || targetUrl,
              availableQualities: YtDlpRunner.defaultQualities(true),
              isSimulatedProbe: false
            });
          } catch (parseErr) {
            reject(new Error(`Failed to parse metadata JSON: ${(parseErr as Error).message}`));
          }
        } else {
          const cleanErr = stderr
            .split(/\r?\n/)
            .filter((l) => l.trim().startsWith('ERROR:'))
            .join(' ')
            .replace(/^ERROR:\s*(\[[^\]]+\]\s*[^:]+:\s*)?/i, '')
            .trim();

          if (targetUrl.includes('instagram.com') && browserCookies === 'none') {
            reject(
              new Error(
                cleanErr
                  ? `Instagram blocked anonymous access (${cleanErr}). Select your browser in Settings -> Browser cookie authentication.`
                  : 'Instagram requires browser cookies for this Reel. Select your browser in Settings -> Browser cookie authentication.'
              )
            );
          } else {
            reject(new Error(cleanErr || stderr.trim() || `yt-dlp probe exited with code ${code}`));
          }
        }
      });
    });
  }

  private buildSimulatedMetadata(url: string): MediaMetadata {
    const platform = YtDlpRunner.detectPlatform(url);
    const idMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{6,15})/);
    const shortId = idMatch ? idMatch[1] : 'VTX8849K';
    return {
      url,
      id: shortId,
      title: `${platform} Production Reference — Studio Session [${shortId}]`,
      uploader: `${platform} Creator Lab`,
      duration: 214, // 03:34
      thumbnail:
        'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=900&auto=format&fit=crop&q=80',
      platform,
      webpageUrl: url,
      availableQualities: YtDlpRunner.defaultQualities(true),
      isSimulatedProbe: true
    };
  }

  private sanitizeFilename(title: string): string {
    return (
      title
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 64) || 'Vortex_Clip'
    );
  }

  public async executeDownload(
    jobId: string,
    config: JobConfig,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<{ outputFilePath: string; usedSimulation: boolean }> {
    if (this.cancelledJobs.has(jobId)) {
      this.cancelledJobs.delete(jobId);
      throw new Error('Job cancelled by user');
    }

    const isAudioOnly = config.quality === 'audio-wav' || config.quality === 'audio-mp3';
    const targetExt = isAudioOnly
      ? config.editReadyMode || config.quality === 'audio-wav'
        ? 'wav'
        : 'mp3'
      : config.editReadyMode
        ? 'mp4'
        : 'mkv';

    const baseFileName = `${this.sanitizeFilename(config.title)}${
      config.trimEnabled ? `_${Math.floor(config.startTime)}s-${Math.floor(config.endTime)}s` : ''
    }`;

    // If stemMode is off, export directly into config.outputDir with collision resolution (no extra subfolder)
    const isDirectExport = config.stemMode === 'off';
    const jobFolder = isDirectExport
      ? config.outputDir
      : path.join(config.outputDir, `${this.sanitizeFilename(config.title)}_${jobId.slice(0, 6)}`);

    if (!fs.existsSync(jobFolder)) {
      fs.mkdirSync(jobFolder, { recursive: true });
    }

    const expectedOutputPath = isDirectExport
      ? getNonCollidingFilePath(config.outputDir, baseFileName, targetExt)
      : path.join(jobFolder, `${baseFileName}.${targetExt}`);

    const chosenBaseName = path.parse(expectedOutputPath).name;

    // If yt-dlp is unavailable and simulation fallback is allowed, synthesize a real playable asset
    if (!this.isYtDlpAvailable()) {
      if (!config.simulateIfMissingBinary) {
        throw new Error('yt-dlp is not installed. Enable Simulation Fallback or install yt-dlp.');
      }
      return this.runSimulatedDownload(jobId, config, expectedOutputPath, onProgress);
    }

    const ytDlpBin = this.getYtDlpPath();
    const args: string[] = [];

    if ((config.url.includes('youtube.com/') || config.url.includes('youtu.be/')) && this.isNodeAvailable()) {
      args.push('--js-runtimes', 'node');
    }

    // Format & NLE Edit-Ready Safe Mode rules
    if (isAudioOnly) {
      args.push('-x');
      if (config.editReadyMode || config.quality === 'audio-wav') {
        args.push('--audio-format', 'wav', '--postprocessor-args', 'ffmpeg:-ar 48000 -ac 2');
      } else {
        args.push('--audio-format', 'mp3', '--audio-quality', '0');
      }
    } else {
      const heightMap: Record<string, number> = {
        '4K': 2160,
        '1440p': 1440,
        '1080p': 1080,
        '720p': 720
      };
      const maxH = heightMap[config.quality] || 1080;

      if (config.editReadyMode) {
        // For 4K/1440p, YouTube provides VP9/AV1. Recode to H.264 MP4 so NLEs (Premiere/DaVinci) can import.
        // For 1080p/720p, YouTube already provides native H.264 (avc1), so use --remux-video mp4 for instant lossless copy.
        if (maxH >= 1440) {
          args.push(
            '-f',
            `bestvideo[height<=${maxH}]+bestaudio/best`,
            '--merge-output-format',
            'mp4',
            '--recode-video',
            'mp4'
          );
        } else {
          // Prefers native H.264/AAC for instant copy; recodes to standard MP4 if falling back to VP9/Opus
          args.push(
            '-f',
            `bestvideo[height<=${maxH}][ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=${maxH}]+bestaudio/best`,
            '--merge-output-format',
            'mp4',
            '--recode-video',
            'mp4'
          );
        }
      } else {
        args.push(
          '-f',
          `bestvideo[height<=${maxH}]+bestaudio/best`,
          '--merge-output-format',
          'mkv'
        );
      }
    }

    // Always use 4 parallel fragment connections for speed
    args.push('--concurrent-fragments', '4');

    // Visual Section Clipper: Downloads ONLY the requested timestamp slice over HTTP range requests
    if (config.trimEnabled) {
      if (config.endTime <= config.startTime) {
        throw new Error(
          `Invalid trim range: end time (${config.endTime}s) must be greater than start time (${config.startTime}s)`
        );
      }
      const startStr = YtDlpRunner.formatSecondsToTimestamp(config.startTime);
      const endStr = YtDlpRunner.formatSecondsToTimestamp(config.endTime);
      args.push(
        '--download-sections',
        `*${startStr}-${endStr}`,
        '--force-keyframes-at-cuts'
      );
    }

    // Edit-Ready PNG Thumbnail conversion
    if (config.editReadyMode) {
      args.push('--convert-thumbnails', 'png');
    }

    // Browser Cookie Bypass
    if (config.browserCookies && config.browserCookies !== 'none') {
      args.push('--cookies-from-browser', config.browserCookies);
    }

    // FFmpeg binary location
    if (this.isFfmpegAvailable()) {
      args.push('--ffmpeg-location', this.getFfmpegPath());
    }

    const outputTemplate = path.join(jobFolder, `${chosenBaseName}.%(ext)s`);
    args.push(
      '--newline',
      '--no-playlist',
      '--progress-template',
      'download:{"percent":"%(progress._percent_str)s","speed":"%(progress._speed_str)s","eta":"%(progress._eta_str)s"}',
      '-o',
      outputTemplate,
      config.url
    );

    const scaleFactor = config.stemMode === 'off' ? 1 : 0.5;

    return new Promise<{ outputFilePath: string; usedSimulation: boolean }>((resolve, reject) => {
      const proc = spawn(ytDlpBin, args, { windowsHide: true });
      this.activeProcesses.set(jobId, proc);

      let stderrLog = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('download:{')) {
            try {
              const jsonStr = trimmed.slice('download:'.length);
              const parsed = JSON.parse(jsonStr);
              const rawPct = parseFloat(String(parsed.percent || '0').replace('%', '').trim());
              const pct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0;
              onProgress({
                jobId,
                stage: 'downloading',
                progress: Math.round(pct * scaleFactor),
                speed: String(parsed.speed || '').trim() || '—',
                eta: String(parsed.eta || '').trim() || '—',
                statusMessage: config.trimEnabled
                  ? `Clipping section (${pct.toFixed(0)}%)...`
                  : `Downloading stream (${pct.toFixed(0)}%)...`
              });
            } catch {
              // fallback regex parse below
            }
          } else {
            const pctMatch = trimmed.match(/(\d+(?:\.\d+)?)%/);
            if (pctMatch) {
              const rawPct = parseFloat(pctMatch[1]);
              onProgress({
                jobId,
                stage: 'downloading',
                progress: Math.round(rawPct * scaleFactor),
                statusMessage: `Downloading stream (${rawPct.toFixed(0)}%)...`
              });
            }
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrLog += chunk.toString();
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(jobId);
        if (isDirectExport) {
          releaseFilePath(expectedOutputPath);
          this.cleanupPartialFiles(jobFolder, chosenBaseName);
        }
        if (this.cancelledJobs.has(jobId)) {
          this.cancelledJobs.delete(jobId);
          reject(new Error('Job cancelled by user'));
          return;
        }
        if (!this.isYtDlpAvailable() && config.simulateIfMissingBinary) {
          this.runSimulatedDownload(jobId, config, expectedOutputPath, onProgress)
            .then(resolve)
            .catch(reject);
        } else {
          reject(err);
        }
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(jobId);

        if (this.cancelledJobs.has(jobId)) {
          this.cancelledJobs.delete(jobId);
          if (isDirectExport) {
            releaseFilePath(expectedOutputPath);
            this.cleanupPartialFiles(jobFolder, chosenBaseName);
          }
          reject(new Error('Job cancelled by user'));
          return;
        }

        if (code === 0) {
          const mediaExts = new Set([
            '.mp4',
            '.mkv',
            '.webm',
            '.wav',
            '.mp3',
            '.m4a',
            '.flac',
            '.opus',
            '.ogg'
          ]);

          let finalPath = '';
          if (fs.existsSync(expectedOutputPath)) {
            finalPath = expectedOutputPath;
          } else {
            const files = fs.existsSync(jobFolder) ? fs.readdirSync(jobFolder) : [];
            let mediaFile = files.find((f) => {
              const parsed = path.parse(f);
              return (
                parsed.name === chosenBaseName &&
                mediaExts.has(parsed.ext.toLowerCase()) &&
                !f.endsWith('.part') &&
                !f.endsWith('.ytdl')
              );
            });

            if (!mediaFile && !isDirectExport) {
              mediaFile = files.find(
                (f) =>
                  !f.endsWith('.part') &&
                  !f.endsWith('.ytdl') &&
                  !f.endsWith('.png') &&
                  !f.endsWith('.webp') &&
                  mediaExts.has(path.extname(f).toLowerCase())
              );
            }

            finalPath = mediaFile ? path.join(jobFolder, mediaFile) : expectedOutputPath;
          }

          if (isDirectExport) {
            releaseFilePath(expectedOutputPath);
          }

          if (!fs.existsSync(finalPath)) {
            reject(new Error('Download completed, but output media file was not found on disk.'));
            return;
          }

          resolve({ outputFilePath: finalPath, usedSimulation: false });
        } else {
          if (isDirectExport) {
            releaseFilePath(expectedOutputPath);
            this.cleanupPartialFiles(jobFolder, chosenBaseName);
          }
          const fullErr = stderrLog.trim();
          const isCookieLocked =
            /(cookie.*locked|cannot access.*cookie|Could not copy Chrome cookie database|database is locked)/i.test(
              fullErr
            );

          // Fallback if browser cookie database is locked during download
          if (
            config.browserCookies &&
            config.browserCookies !== 'none' &&
            isCookieLocked
          ) {
            const retryConfig = { ...config, browserCookies: 'none' as const };
            onProgress({
              jobId,
              stage: 'downloading',
              progress: 0,
              statusMessage: 'Browser cookie database locked. Retrying anonymously...'
            });
            // Recursive retry with cookies disabled and cloned config
            this.executeDownload(jobId, retryConfig, onProgress).then(resolve).catch(reject);
            return;
          }
          reject(new Error(fullErr || `yt-dlp exited with code ${code}`));
        }
      });
    });
  }

  private async runSimulatedDownload(
    jobId: string,
    config: JobConfig,
    outputPath: string,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<{ outputFilePath: string; usedSimulation: boolean }> {
    const scaleFactor = config.stemMode === 'off' ? 1 : 0.5;
    const steps = 10;

    for (let i = 1; i <= steps; i++) {
      if (this.cancelledJobs.has(jobId)) {
        this.cancelledJobs.delete(jobId);
        throw new Error('Job cancelled by user');
      }
      await new Promise((r) => setTimeout(r, 120));
      const rawPct = i * 10;
      onProgress({
        jobId,
        stage: 'downloading',
        progress: Math.round(rawPct * scaleFactor),
        speed: '18.4 MiB/s',
        eta: `00:0${Math.max(0, steps - i)}`,
        statusMessage: config.trimEnabled
          ? `[SIM] Clipping keyframe section (${rawPct}%)...`
          : `[SIM] Pulling NLE stream (${rawPct}%)...`
      });
    }

    const clipLen = config.trimEnabled
      ? Math.max(3, Math.min(12, config.endTime - config.startTime))
      : 6;
    const writtenPath = this.ffmpegRunner.writeValidSimulatedMedia(outputPath, clipLen, 220);

    if (config.stemMode === 'off') {
      releaseFilePath(outputPath);
    }

    return { outputFilePath: writtenPath, usedSimulation: true };
  }

  private cleanupPartialFiles(folder: string, baseName: string): void {
    try {
      if (!fs.existsSync(folder)) return;
      for (const f of fs.readdirSync(folder)) {
        if (
          f.startsWith(baseName) &&
          (f.endsWith('.part') || f.endsWith('.ytdl') || f.endsWith('.temp'))
        ) {
          try {
            fs.unlinkSync(path.join(folder, f));
          } catch {}
        }
      }
    } catch {}
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
