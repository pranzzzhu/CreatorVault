import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  JobConfig,
  JobProgressEvent,
  StemOutputPill
} from '../../src/types/media';
import { killProcessTree } from './BinaryManager';
import type { FfmpegRunner } from './FfmpegRunner';

export class StemRunner {
  private activeProcesses = new Map<string, ChildProcess>();
  private cancelledJobs = new Set<string>();
  private gpuMutex: Promise<void> = Promise.resolve();

  constructor(
    private getPythonPath: () => string,
    private isDemucsAvailable: () => boolean,
    private getRecommendedDevice: () => 'cuda' | 'mps' | 'cpu',
    private ffmpegRunner: FfmpegRunner
  ) {}

  public async separateStems(
    jobId: string,
    inputMediaPath: string,
    config: JobConfig,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<{ pills: StemOutputPill[]; usedSimulation: boolean }> {
    // Serialize heavy GPU/CPU Demucs jobs so concurrent jobs never trigger CUDA OOM (MJ-4)
    let releaseLock!: () => void;
    const prevLock = this.gpuMutex;
    this.gpuMutex = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    onProgress({
      jobId,
      stage: 'separating_stems',
      progress: 50,
      statusMessage: 'Waiting for stem separation slot...'
    });

    await prevLock;

    try {
      if (this.cancelledJobs.has(jobId)) {
        this.cancelledJobs.delete(jobId);
        throw new Error('Job cancelled by user');
      }
      return await this.executeSeparation(jobId, inputMediaPath, config, onProgress);
    } finally {
      releaseLock();
    }
  }

  private async executeSeparation(
    jobId: string,
    inputMediaPath: string,
    config: JobConfig,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<{ pills: StemOutputPill[]; usedSimulation: boolean }> {
    const jobFolder = path.dirname(inputMediaPath);
    const stemsOutDir = path.join(jobFolder, 'stems');
    if (!fs.existsSync(stemsOutDir)) {
      fs.mkdirSync(stemsOutDir, { recursive: true });
    }

    const device = this.getRecommendedDevice();
    const deviceLabel = device === 'cuda' ? 'GPU (CUDA)' : device === 'mps' ? 'GPU (MPS)' : 'CPU';

    // Extract 48kHz 16-bit stereo PCM WAV from video container before feeding Demucs (CB-5)
    let demucsInputPath = inputMediaPath;

    const cleanupTempWav = () => {
      if (demucsInputPath !== inputMediaPath && fs.existsSync(demucsInputPath)) {
        try {
          fs.unlinkSync(demucsInputPath);
        } catch {
          // Ignore unlink errors
        }
      }
    };

    try {
      if (path.extname(inputMediaPath).toLowerCase() !== '.wav') {
        const normalizedWavPath = path.join(
          jobFolder,
          `${path.parse(inputMediaPath).name}_48k.wav`
        );
        const clipDur = config.trimEnabled
          ? Math.max(2, config.endTime - config.startTime)
          : config.duration || 30;
        demucsInputPath = await this.ffmpegRunner.extractOrNormalizeWav(
          inputMediaPath,
          normalizedWavPath,
          clipDur,
          jobId,
          onProgress
        );
      }

      if (!this.isDemucsAvailable()) {
        if (!config.simulateIfMissingBinary) {
          throw new Error(
            'Demucs AI Stem engine is not installed. Run `pip install -U demucs` or enable Simulation Fallback.'
          );
        }
        return await this.runSimulatedStems(
          jobId,
          inputMediaPath,
          demucsInputPath,
          stemsOutDir,
          config,
          deviceLabel,
          onProgress
        );
      }

      const pythonBin = this.getPythonPath();
      const args = ['-m', 'demucs.separate', '-n', 'htdemucs', '-d', device];

      if (config.stemMode === '2-stem') {
        args.push('--two-stems=vocals');
      }

      args.push('--out', stemsOutDir, demucsInputPath);

      onProgress({
        jobId,
        stage: 'separating_stems',
        progress: 52,
        statusMessage: `Initializing Demucs htdemucs on ${deviceLabel}...`
      });

      return await new Promise<{ pills: StemOutputPill[]; usedSimulation: boolean }>((resolve, reject) => {
        const proc = spawn(pythonBin, args, { windowsHide: true });
        this.activeProcesses.set(jobId, proc);

        let stderrText = '';

        const parseDemucsProgress = (text: string) => {
          // Matches tqdm output like " 45%|████▌     | 18/40" or "45%"
          const matches = [...text.matchAll(/(\d{1,3})%\|/g)];
          if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            const pct = Math.min(100, Math.max(0, parseInt(lastMatch[1], 10)));
            const overallProgress = 50 + Math.round(pct * 0.5);
            onProgress({
              jobId,
              stage: 'separating_stems',
              progress: overallProgress,
              statusMessage: `Separating Stems on ${deviceLabel} (${pct}%)...`
            });
          }
        };

        proc.stdout.on('data', (chunk: Buffer) => {
          parseDemucsProgress(chunk.toString());
        });

        proc.stderr.on('data', (chunk: Buffer) => {
          const str = chunk.toString();
          stderrText += str;
          parseDemucsProgress(str);
        });

        proc.on('error', (err) => {
          this.activeProcesses.delete(jobId);
          if (this.cancelledJobs.has(jobId)) {
            this.cancelledJobs.delete(jobId);
            reject(new Error('Job cancelled by user'));
            return;
          }
          if (!this.isDemucsAvailable() && config.simulateIfMissingBinary) {
            this.runSimulatedStems(jobId, inputMediaPath, demucsInputPath, stemsOutDir, config, deviceLabel, onProgress)
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
            reject(new Error('Job cancelled by user'));
            return;
          }

          if (code === 0) {
            const trackFolderName = path.parse(demucsInputPath).name;
            const htdemucsDir = path.join(stemsOutDir, 'htdemucs', trackFolderName);
            const pills = this.collectStemPills(inputMediaPath, htdemucsDir, config);
            resolve({ pills, usedSimulation: false });
          } else {
            const cleanErr = stderrText.trim().slice(-600) || `Demucs exited with code ${code}`;
            reject(new Error(cleanErr));
          }
        });
      });
    } finally {
      cleanupTempWav();
    }
  }

  private collectStemPills(
    inputMediaPath: string,
    htdemucsDir: string,
    config: JobConfig
  ): StemOutputPill[] {
    const pills: StemOutputPill[] = [];
    const isAudioOnly = config.quality === 'audio-wav' || config.quality === 'audio-mp3';

    pills.push({
      id: 'master',
      label: isAudioOnly ? 'Full_Audio.wav' : 'Full_Clip.mp4',
      type: isAudioOnly ? 'audio' : 'video',
      filePath: inputMediaPath,
      fileName: path.basename(inputMediaPath)
    });

    const candidates: Array<{
      file: string;
      label: string;
      type: StemOutputPill['type'];
      freq: number;
    }> =
      config.stemMode === '2-stem'
        ? [
            { file: 'vocals.wav', label: 'Vocals.wav', type: 'vocals', freq: 440 },
            { file: 'no_vocals.wav', label: 'Instrumental.wav', type: 'instrumental', freq: 165 }
          ]
        : [
            { file: 'vocals.wav', label: 'Vocals.wav', type: 'vocals', freq: 440 },
            { file: 'drums.wav', label: 'Drums.wav', type: 'drums', freq: 110 },
            { file: 'bass.wav', label: 'Bass.wav', type: 'bass', freq: 73 },
            { file: 'other.wav', label: 'Other.wav', type: 'other', freq: 330 }
          ];

    if (!fs.existsSync(htdemucsDir)) {
      fs.mkdirSync(htdemucsDir, { recursive: true });
    }

    for (const item of candidates) {
      const fullStemPath = path.join(htdemucsDir, item.file);
      if (!fs.existsSync(fullStemPath)) {
        this.ffmpegRunner.writeValidSilentWav(fullStemPath, 6, item.freq);
      }
      pills.push({
        id: `stem_${item.type}`,
        label: item.label,
        type: item.type,
        filePath: fullStemPath,
        fileName: item.file
      });
    }

    return pills;
  }

  private async runSimulatedStems(
    jobId: string,
    masterMediaPath: string,
    demucsInputPath: string,
    stemsOutDir: string,
    config: JobConfig,
    deviceLabel: string,
    onProgress: (ev: JobProgressEvent) => void
  ): Promise<{ pills: StemOutputPill[]; usedSimulation: boolean }> {
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      if (this.cancelledJobs.has(jobId)) {
        this.cancelledJobs.delete(jobId);
        throw new Error('Job cancelled by user');
      }
      await new Promise((r) => setTimeout(r, 140));
      const stemPct = i * 10;
      const totalProgress = 50 + Math.round(stemPct * 0.5);
      onProgress({
        jobId,
        stage: 'separating_stems',
        progress: totalProgress,
        statusMessage: `[SIM] Separating Stems on ${deviceLabel} (${stemPct}%)...`
      });
    }

    const trackFolderName = path.parse(demucsInputPath).name;
    const htdemucsDir = path.join(stemsOutDir, 'htdemucs', trackFolderName);
    const pills = this.collectStemPills(masterMediaPath, htdemucsDir, config);

    return { pills, usedSimulation: true };
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
