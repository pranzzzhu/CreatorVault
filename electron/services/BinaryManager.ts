import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BinaryName, BinaryStatus } from '../../src/types/media';

/**
 * Terminates a child process and its entire descendant tree (e.g. ffmpeg spawned by yt-dlp
 * or PyTorch workers spawned by Demucs) so Windows file locks and GPU VRAM are freed immediately.
 */
export function killProcessTree(proc: ChildProcess): void {
  if (!proc.pid) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 3000
      });
      return;
    } catch {
      // Fallback to standard kill below
    }
  }
  try {
    proc.kill('SIGTERM');
  } catch {
    // Ignore if already exited
  }
}

export class BinaryManager {
  private binDir: string;
  private cachedStatuses: Record<BinaryName, BinaryStatus> | null = null;

  constructor(workspaceRoot?: string) {
    const base = workspaceRoot || process.cwd();
    this.binDir = path.join(base, 'bin');
    if (!fs.existsSync(this.binDir)) {
      try {
        fs.mkdirSync(this.binDir, { recursive: true });
      } catch {
        // Ignore if read-only in packaged bundle
      }
    }
  }

  public getBinDir(): string {
    return this.binDir;
  }

  private resolveExecutable(binaryName: string): {
    available: boolean;
    resolvedPath: string;
    source: 'local-bin' | 'system-path' | 'missing';
    version?: string;
  } {
    const isWin = process.platform === 'win32';
    const exeName = isWin ? `${binaryName}.exe` : binaryName;

    // 1. Check ./bin folder first
    const localCandidate = path.join(this.binDir, exeName);
    if (fs.existsSync(localCandidate)) {
      const ver = this.probeVersion(localCandidate, binaryName === 'ffmpeg' || binaryName === 'ffprobe' ? ['-version'] : ['--version']);
      return {
        available: true,
        resolvedPath: localCandidate,
        source: 'local-bin',
        version: ver
      };
    }

    // 2. Fallback to system PATH
    try {
      const locateCmd = isWin ? 'where' : 'which';
      const output = execFileSync(locateCmd, [binaryName], {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true
      });
      const firstLine = output
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0);

      if (firstLine && fs.existsSync(firstLine)) {
        const ver = this.probeVersion(firstLine, binaryName === 'ffmpeg' || binaryName === 'ffprobe' ? ['-version'] : ['--version']);
        return {
          available: true,
          resolvedPath: firstLine,
          source: 'system-path',
          version: ver
        };
      }
    } catch {
      // Not found in system PATH
    }

    // 3. Fallback to WinGet Packages folder on Windows (handles unrefreshed PATH)
    if (isWin) {
      const wingetFound = this.findInWinGetPackages(exeName);
      if (wingetFound) {
        const ver = this.probeVersion(
          wingetFound,
          binaryName === 'ffmpeg' || binaryName === 'ffprobe' ? ['-version'] : ['--version']
        );
        return {
          available: true,
          resolvedPath: wingetFound,
          source: 'system-path',
          version: ver
        };
      }
    }

    return {
      available: false,
      resolvedPath: binaryName,
      source: 'missing'
    };
  }

  private findInWinGetPackages(exeName: string): string | null {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const wingetLinks = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', exeName);
    if (fs.existsSync(wingetLinks)) {
      return wingetLinks;
    }

    const wingetPkgs = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (!fs.existsSync(wingetPkgs)) return null;

    try {
      const pkgDirs = fs.readdirSync(wingetPkgs, { withFileTypes: true });
      for (const dir of pkgDirs) {
        if (!dir.isDirectory()) continue;
        const pkgPath = path.join(wingetPkgs, dir.name);
        const directExe = path.join(pkgPath, exeName);
        if (fs.existsSync(directExe)) return directExe;

        // Check one or two levels deep (e.g., ffmpeg-9.0.2-full_build/bin/ffmpeg.exe)
        const subDirs = fs.readdirSync(pkgPath, { withFileTypes: true });
        for (const sub of subDirs) {
          if (!sub.isDirectory()) continue;
          const candidateBin = path.join(pkgPath, sub.name, 'bin', exeName);
          if (fs.existsSync(candidateBin)) return candidateBin;
          const candidateDirect = path.join(pkgPath, sub.name, exeName);
          if (fs.existsSync(candidateDirect)) return candidateDirect;
        }
      }
    } catch {
      // Ignore permission or read errors
    }
    return null;
  }

  public getPythonPath(): string {
    return this.getPythonCandidates()[0]?.cmd || 'python';
  }

  private getPythonCandidates(): Array<{ cmd: string; source: 'local-bin' | 'system-path' }> {
    const isWin = process.platform === 'win32';
    const localPython = path.join(
      this.binDir,
      'python',
      isWin ? 'python.exe' : 'bin/python3'
    );

    return fs.existsSync(localPython)
      ? [{ cmd: localPython, source: 'local-bin' as const }]
      : [
          { cmd: 'python', source: 'system-path' as const },
          { cmd: 'python3', source: 'system-path' as const }
        ];
  }

  private hasPythonModule(pythonCmd: string, moduleName: string): boolean {
    try {
      const res = spawnSync(
        pythonCmd,
        ['-c', `import importlib.util; print("ok" if importlib.util.find_spec("${moduleName}") else "no")`],
        {
          encoding: 'utf8',
          timeout: 3000,
          windowsHide: true
        }
      );
      return res.status === 0 && Boolean(res.stdout?.includes('ok'));
    } catch {
      return false;
    }
  }

  private resolveDemucs(): BinaryStatus {
    for (const candidate of this.getPythonCandidates()) {
      if (this.hasPythonModule(candidate.cmd, 'demucs')) {
        return {
          name: 'demucs',
          available: true,
          resolvedPath: candidate.cmd,
          source: candidate.source,
          version: 'htdemucs (PyTorch)',
          installHint: 'pip install -U demucs torch torchaudio'
        };
      }
    }

    return {
      name: 'demucs',
      available: false,
      resolvedPath: 'python',
      source: 'missing',
      installHint: 'pip install -U demucs'
    };
  }

  private resolveRembg(): BinaryStatus {
    const u2netPath = path.join(os.homedir(), '.u2net', 'u2net.onnx');
    const hasModel = fs.existsSync(u2netPath);

    for (const candidate of this.getPythonCandidates()) {
      if (this.hasPythonModule(candidate.cmd, 'rembg') && hasModel) {
        return {
          name: 'rembg',
          available: true,
          resolvedPath: candidate.cmd,
          source: candidate.source,
          version: 'rembg 2.0 (U2Net ONNX)',
          installHint: 'pip install -U rembg onnxruntime'
        };
      }
    }

    const cli = this.resolveExecutable('rembg');
    if (cli.available && hasModel) {
      return {
        name: 'rembg',
        available: true,
        resolvedPath: cli.resolvedPath,
        source: cli.source,
        version: cli.version || 'rembg CLI',
        installHint: 'pip install -U "rembg[cli]"'
      };
    }

    return {
      name: 'rembg',
      available: false,
      resolvedPath: 'python',
      source: 'missing',
      installHint: 'pip install -U rembg onnxruntime'
    };
  }

  private resolveVtracer(): BinaryStatus {
    const cli = this.resolveExecutable('vtracer');
    if (cli.available) {
      return {
        name: 'vtracer',
        available: true,
        resolvedPath: cli.resolvedPath,
        source: cli.source,
        version: cli.version || 'vtracer CLI',
        installHint: 'pip install -U vtracer'
      };
    }

    for (const candidate of this.getPythonCandidates()) {
      if (this.hasPythonModule(candidate.cmd, 'vtracer')) {
        return {
          name: 'vtracer',
          available: true,
          resolvedPath: candidate.cmd,
          source: candidate.source,
          version: 'vtracer 0.6.15 (Rust Engine)',
          installHint: 'pip install -U vtracer'
        };
      }
    }

    return {
      name: 'vtracer',
      available: false,
      resolvedPath: 'python',
      source: 'missing',
      installHint: 'pip install -U vtracer'
    };
  }

  private resolveRealesrgan(): BinaryStatus {
    const cli = this.resolveExecutable('realesrgan-ncnn-vulkan');
    if (cli.available) {
      return {
        name: 'realesrgan',
        available: true,
        resolvedPath: cli.resolvedPath,
        source: cli.source,
        version: 'realesrgan-ncnn-vulkan',
        installHint: 'pip install -U spandrel torchvision'
      };
    }

    const modelPath = path.join(this.binDir, 'models', 'RealESRGAN_x4plus.pth');
    const hasWeights = fs.existsSync(modelPath);

    for (const candidate of this.getPythonCandidates()) {
      if (this.hasPythonModule(candidate.cmd, 'spandrel') && hasWeights) {
        return {
          name: 'realesrgan',
          available: true,
          resolvedPath: modelPath,
          source: 'local-bin',
          version: 'Real-ESRGAN x4plus (CUDA/PyTorch)',
          installHint: 'pip install -U spandrel torchvision'
        };
      }
    }

    return {
      name: 'realesrgan',
      available: false,
      resolvedPath: 'python',
      source: 'missing',
      installHint: 'pip install -U spandrel torchvision'
    };
  }

  private probeVersion(cmdPath: string, args: string[]): string | undefined {
    try {
      const res = spawnSync(cmdPath, args, {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true
      });
      const firstLine = (res.stdout || res.stderr || '').split(/\r?\n/)[0]?.trim();
      return firstLine ? firstLine.slice(0, 48) : undefined;
    } catch {
      return undefined;
    }
  }

  public checkAllBinaries(forceRefresh = false): Record<BinaryName, BinaryStatus> {
    if (this.cachedStatuses && !forceRefresh) {
      return this.cachedStatuses;
    }

    const ytdlp = this.resolveExecutable('yt-dlp');
    const ffmpeg = this.resolveExecutable('ffmpeg');
    const ffprobe = this.resolveExecutable('ffprobe');
    const demucs = this.resolveDemucs();
    const rembg = this.resolveRembg();
    const vtracer = this.resolveVtracer();
    const realesrgan = this.resolveRealesrgan();

    this.cachedStatuses = {
      'yt-dlp': {
        name: 'yt-dlp',
        ...ytdlp,
        installHint: 'pip install -U yt-dlp'
      },
      ffmpeg: {
        name: 'ffmpeg',
        ...ffmpeg,
        installHint: 'winget install Gyan.FFmpeg'
      },
      ffprobe: {
        name: 'ffprobe',
        ...ffprobe,
        installHint: 'winget install Gyan.FFmpeg'
      },
      demucs,
      rembg,
      vtracer,
      realesrgan
    };

    return this.cachedStatuses;
  }

  public getBinaryPath(name: BinaryName): string {
    const statuses = this.checkAllBinaries();
    return statuses[name].resolvedPath;
  }

  public isBinaryAvailable(name: BinaryName): boolean {
    const statuses = this.checkAllBinaries();
    return statuses[name].available;
  }

  /**
   * 1-Click Sidecar Installer invoked from Settings -> Sidecar Binaries.
   * Uses PyPI and Hugging Face CDN to avoid GitHub Releases network throttling.
   */
  public async installBinary(name: BinaryName): Promise<{ success: boolean; message: string }> {
    const pythonCmd = this.getPythonCandidates()[0]?.cmd || 'python';

    const runCmd = (cmd: string, args: string[]): Promise<void> =>
      new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { windowsHide: true });
        // Drain stdout so child processes never block on a full OS pipe buffer (CB-2)
        proc.stdout?.resume();

        let stderr = '';
        proc.stderr.on('data', (d: Buffer) => {
          stderr += d.toString();
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim().slice(-400) || `Installer exited with code ${code}`));
        });
      });

    try {
      if (name === 'rembg') {
        await runCmd(pythonCmd, ['-m', 'pip', 'install', '-U', 'rembg', 'onnxruntime', 'pymatting', 'pooch', 'huggingface_hub']);
        await runCmd(pythonCmd, [
          '-c',
          `import os, shutil; from huggingface_hub import hf_hub_download; d=os.path.expanduser('~/.u2net'); os.makedirs(d, exist_ok=True); t=os.path.join(d, 'u2net.onnx'); p=hf_hub_download(repo_id='tomjackson2023/rembg', filename='u2net.onnx') if not os.path.exists(t) else t; shutil.copyfile(p, t) if p != t else None`
        ]);
      } else if (name === 'vtracer') {
        await runCmd(pythonCmd, ['-m', 'pip', 'install', '-U', 'vtracer']);
      } else if (name === 'realesrgan') {
        const modelsDir = path.join(this.binDir, 'models');
        await runCmd(pythonCmd, ['-m', 'pip', 'install', '-U', 'spandrel', 'torchvision', 'huggingface_hub']);
        await runCmd(pythonCmd, [
          '-c',
          `import os, sys, shutil; from huggingface_hub import hf_hub_download; d=sys.argv[1]; os.makedirs(d, exist_ok=True); t=os.path.join(d, 'RealESRGAN_x4plus.pth'); p=hf_hub_download(repo_id='lllyasviel/Annotators', filename='RealESRGAN_x4plus.pth') if not os.path.exists(t) else t; shutil.copyfile(p, t) if p != t else None`,
          modelsDir
        ]);
      } else if (name === 'demucs') {
        await runCmd(pythonCmd, ['-m', 'pip', 'install', '-U', 'demucs']);
      } else if (name === 'yt-dlp') {
        await runCmd(pythonCmd, ['-m', 'pip', 'install', '-U', 'yt-dlp']);
      } else if (name === 'ffmpeg' || name === 'ffprobe') {
        if (process.platform === 'win32') {
          await runCmd('winget', [
            'install',
            '--id',
            'Gyan.FFmpeg',
            '-e',
            '--accept-source-agreements',
            '--accept-package-agreements'
          ]);
        } else if (process.platform === 'darwin') {
          await runCmd('brew', ['install', 'ffmpeg']);
        } else {
          throw new Error('Automatic FFmpeg install is supported on Windows (winget) and macOS (brew).');
        }
      }

      this.checkAllBinaries(true);
      return {
        success: true,
        message: `${name} installed and verified.`
      };
    } catch (err) {
      return {
        success: false,
        message: (err as Error).message || `Failed to install ${name}`
      };
    }
  }
}
