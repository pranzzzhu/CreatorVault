import { spawn, spawnSync, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { BinaryName, BinaryStatus } from '../../src/types/media';

const execFileAsync = promisify(execFile);

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

  public getManagedVenvPythonPath(): string {
    const isWin = process.platform === 'win32';
    return isWin
      ? path.join(this.binDir, 'venv', 'Scripts', 'python.exe')
      : path.join(this.binDir, 'venv', 'bin', 'python3');
  }

  public getPythonCandidates(): Array<{ cmd: string; source: 'local-bin' | 'system-path' }> {
    const isWin = process.platform === 'win32';
    const portablePython = path.join(
      this.binDir,
      'python',
      isWin ? 'python.exe' : 'bin/python3'
    );
    const venvPython = this.getManagedVenvPythonPath();

    const candidates: Array<{ cmd: string; source: 'local-bin' | 'system-path' }> = [];

    // 1. Portable embedded python
    if (fs.existsSync(portablePython)) {
      candidates.push({ cmd: portablePython, source: 'local-bin' });
    }
    // 2. Managed isolated venv python
    if (fs.existsSync(venvPython)) {
      candidates.push({ cmd: venvPython, source: 'local-bin' });
    }
    // 3. System PATH python (read-only detection fallback)
    candidates.push({ cmd: 'python', source: 'system-path' });
    candidates.push({ cmd: 'python3', source: 'system-path' });

    return candidates;
  }

  public getPythonPath(): string {
    const available = this.getPythonCandidates().find((c) => c.source === 'local-bin');
    return available?.cmd || (process.platform === 'win32' ? 'python' : 'python3');
  }

  private async ensureManagedVenv(): Promise<string> {
    const isWin = process.platform === 'win32';
    const portablePython = path.join(
      this.binDir,
      'python',
      isWin ? 'python.exe' : 'bin/python3'
    );
    if (fs.existsSync(portablePython)) {
      return portablePython;
    }

    const venvPython = this.getManagedVenvPythonPath();
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }

    const venvDir = path.join(this.binDir, 'venv');
    const systemCandidate =
      this.getPythonCandidates().find((c) => c.source === 'system-path')?.cmd || 'python';

    try {
      await execFileAsync(systemCandidate, ['-m', 'venv', venvDir], {
        windowsHide: true,
        timeout: 60000
      });
      if (fs.existsSync(venvPython)) {
        try {
          await execFileAsync(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
            windowsHide: true,
            timeout: 60000
          });
        } catch {
          // Non-critical if pip upgrade fails
        }
        return venvPython;
      }
    } catch {
      // Fallback to system candidate if venv creation fails
    }
    return systemCandidate;
  }

  private async probeVersion(cmdPath: string, args: string[]): Promise<string | undefined> {
    try {
      const { stdout, stderr } = await execFileAsync(cmdPath, args, {
        timeout: 3000,
        windowsHide: true
      });
      const firstLine = (stdout || stderr || '').split(/\r?\n/)[0]?.trim();
      return firstLine ? firstLine.slice(0, 48) : undefined;
    } catch {
      return undefined;
    }
  }

  private async probePythonModules(
    pythonCmd: string
  ): Promise<Record<'demucs' | 'rembg' | 'vtracer' | 'spandrel', boolean>> {
    const def = { demucs: false, rembg: false, vtracer: false, spandrel: false };
    try {
      const code =
        'import importlib.util, json; mods = ["demucs", "rembg", "vtracer", "spandrel"]; print(json.dumps({m: bool(importlib.util.find_spec(m)) for m in mods}))';
      const { stdout } = await execFileAsync(pythonCmd, ['-c', code], {
        timeout: 4000,
        windowsHide: true
      });
      const parsed = JSON.parse(stdout.trim());
      return { ...def, ...parsed };
    } catch {
      return def;
    }
  }

  private async resolveExecutable(binaryName: string): Promise<{
    available: boolean;
    resolvedPath: string;
    source: 'local-bin' | 'system-path' | 'missing';
    version?: string;
  }> {
    const isWin = process.platform === 'win32';
    const exeName = isWin ? `${binaryName}.exe` : binaryName;
    const versionArgs =
      binaryName === 'ffmpeg' || binaryName === 'ffprobe' ? ['-version'] : ['--version'];

    // 1. Check ./bin folder first
    const localCandidate = path.join(this.binDir, exeName);
    if (fs.existsSync(localCandidate)) {
      const ver = await this.probeVersion(localCandidate, versionArgs);
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
      const { stdout } = await execFileAsync(locateCmd, [binaryName], {
        timeout: 3000,
        windowsHide: true
      });
      const firstLine = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0);

      if (firstLine && fs.existsSync(firstLine)) {
        const ver = await this.probeVersion(firstLine, versionArgs);
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

    // 3. Fallback to WinGet Packages folder on Windows
    if (isWin) {
      const wingetFound = this.findInWinGetPackages(exeName);
      if (wingetFound) {
        const ver = await this.probeVersion(wingetFound, versionArgs);
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

  public async checkAllBinaries(forceRefresh = false): Promise<Record<BinaryName, BinaryStatus>> {
    if (this.cachedStatuses && !forceRefresh) {
      return this.cachedStatuses;
    }

    const [ytdlp, ffmpeg, ffprobe, vtracerCli, realesrganCli] = await Promise.all([
      this.resolveExecutable('yt-dlp'),
      this.resolveExecutable('ffmpeg'),
      this.resolveExecutable('ffprobe'),
      this.resolveExecutable('vtracer'),
      this.resolveExecutable('realesrgan-ncnn-vulkan')
    ]);

    // Batch probe Python candidates
    const pythonCandidates = this.getPythonCandidates();
    let pythonWithDemucs: { cmd: string; source: 'local-bin' | 'system-path' } | null = null;
    let pythonWithRembg: { cmd: string; source: 'local-bin' | 'system-path' } | null = null;
    let pythonWithVtracer: { cmd: string; source: 'local-bin' | 'system-path' } | null = null;
    let pythonWithSpandrel: { cmd: string; source: 'local-bin' | 'system-path' } | null = null;

    for (const cand of pythonCandidates) {
      const mods = await this.probePythonModules(cand.cmd);
      if (mods.demucs && !pythonWithDemucs) pythonWithDemucs = cand;
      if (mods.rembg && !pythonWithRembg) pythonWithRembg = cand;
      if (mods.vtracer && !pythonWithVtracer) pythonWithVtracer = cand;
      if (mods.spandrel && !pythonWithSpandrel) pythonWithSpandrel = cand;
    }

    // Demucs status
    const demucs: BinaryStatus = pythonWithDemucs
      ? {
          name: 'demucs',
          available: true,
          resolvedPath: pythonWithDemucs.cmd,
          source: pythonWithDemucs.source,
          version: 'htdemucs (PyTorch)',
          installHint: 'pip install -U demucs torch torchaudio'
        }
      : {
          name: 'demucs',
          available: false,
          resolvedPath: 'python',
          source: 'missing',
          installHint: 'pip install -U demucs'
        };

    // Rembg status
    const u2netPath = path.join(os.homedir(), '.u2net', 'u2net.onnx');
    const hasU2net = fs.existsSync(u2netPath);
    let rembg: BinaryStatus;
    if (pythonWithRembg && hasU2net) {
      rembg = {
        name: 'rembg',
        available: true,
        resolvedPath: pythonWithRembg.cmd,
        source: pythonWithRembg.source,
        version: 'rembg 2.0 (U2Net ONNX)',
        installHint: 'pip install -U rembg onnxruntime'
      };
    } else {
      const cli = await this.resolveExecutable('rembg');
      if (cli.available && hasU2net) {
        rembg = {
          name: 'rembg',
          available: true,
          resolvedPath: cli.resolvedPath,
          source: cli.source,
          version: cli.version || 'rembg CLI',
          installHint: 'pip install -U "rembg[cli]"'
        };
      } else {
        rembg = {
          name: 'rembg',
          available: false,
          resolvedPath: 'python',
          source: 'missing',
          installHint: 'pip install -U rembg onnxruntime'
        };
      }
    }

    // VTracer status
    let vtracer: BinaryStatus;
    if (vtracerCli.available) {
      vtracer = {
        name: 'vtracer',
        available: true,
        resolvedPath: vtracerCli.resolvedPath,
        source: vtracerCli.source,
        version: vtracerCli.version || 'vtracer CLI',
        installHint: 'pip install -U vtracer'
      };
    } else if (pythonWithVtracer) {
      vtracer = {
        name: 'vtracer',
        available: true,
        resolvedPath: pythonWithVtracer.cmd,
        source: pythonWithVtracer.source,
        version: 'vtracer 0.6.15 (Rust Engine)',
        installHint: 'pip install -U vtracer'
      };
    } else {
      vtracer = {
        name: 'vtracer',
        available: false,
        resolvedPath: 'python',
        source: 'missing',
        installHint: 'pip install -U vtracer'
      };
    }

    // Real-ESRGAN status
    const modelPath = path.join(this.binDir, 'models', 'RealESRGAN_x4plus.pth');
    const hasWeights = fs.existsSync(modelPath);
    let realesrgan: BinaryStatus;
    if (realesrganCli.available) {
      realesrgan = {
        name: 'realesrgan',
        available: true,
        resolvedPath: realesrganCli.resolvedPath,
        source: realesrganCli.source,
        version: 'realesrgan-ncnn-vulkan',
        installHint: 'pip install -U spandrel torchvision'
      };
    } else if (pythonWithSpandrel && hasWeights) {
      realesrgan = {
        name: 'realesrgan',
        available: true,
        resolvedPath: modelPath,
        source: 'local-bin',
        version: 'Real-ESRGAN x4plus (CUDA/PyTorch)',
        installHint: 'Installed (spandrel + RealESRGAN_x4plus.pth)'
      };
    } else {
      realesrgan = {
        name: 'realesrgan',
        available: false,
        resolvedPath: 'python',
        source: 'missing',
        installHint: !hasWeights && pythonWithSpandrel
          ? 'Click 1-Click Install to download RealESRGAN_x4plus.pth weights into ./bin/models'
          : 'Click 1-Click Install or run: pip install -U spandrel torchvision'
      };
    }

    this.cachedStatuses = {
      'yt-dlp': {
        name: 'yt-dlp',
        ...ytdlp,
        installHint: 'Click 1-Click Install or place yt-dlp in ./bin'
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
    if (this.cachedStatuses && this.cachedStatuses[name]) {
      return this.cachedStatuses[name].resolvedPath;
    }
    const isWin = process.platform === 'win32';
    const localCandidate = path.join(this.binDir, isWin ? `${name}.exe` : name);
    return fs.existsSync(localCandidate) ? localCandidate : name;
  }

  public isBinaryAvailable(name: BinaryName): boolean {
    if (this.cachedStatuses && this.cachedStatuses[name]) {
      return this.cachedStatuses[name].available;
    }
    const isWin = process.platform === 'win32';
    const localCandidate = path.join(this.binDir, isWin ? `${name}.exe` : name);
    return fs.existsSync(localCandidate);
  }

  /**
   * 1-Click Sidecar Installer invoked from Settings -> Sidecar Binaries.
   * Installs Python packages into isolated ./bin/venv without mutating global environment.
   */
  public async installBinary(name: BinaryName): Promise<{ success: boolean; message: string }> {
    const runCmd = (cmd: string, args: string[]): Promise<void> =>
      new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { windowsHide: true });
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
      let pythonCmd = this.getPythonPath();
      if (name === 'rembg' || name === 'vtracer' || name === 'realesrgan' || name === 'demucs') {
        pythonCmd = await this.ensureManagedVenv();
      }

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
        const exeName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
        const targetPath = path.join(this.binDir, exeName);
        const tempPath = path.join(this.binDir, `${exeName}.tmp_${Date.now()}`);
        const url = process.platform === 'win32'
          ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
          : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);

        try {
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (!res.ok) throw new Error(`Failed to download yt-dlp binary (${res.status} ${res.statusText})`);
          if (!res.body) throw new Error('Download stream is empty.');

          const fileStream = fs.createWriteStream(tempPath);
          const { Readable } = await import('node:stream');
          const { pipeline } = await import('node:stream/promises');
          await pipeline(Readable.fromWeb(res.body as any), fileStream);

          const stat = fs.statSync(tempPath);
          if (stat.size < 1024 * 1024) {
            try { fs.unlinkSync(tempPath); } catch {}
            throw new Error(`Downloaded yt-dlp binary is incomplete (${Math.round(stat.size / 1024)} KB)`);
          }

          if (process.platform !== 'win32') {
            fs.chmodSync(tempPath, '755');
            if (process.platform === 'darwin') {
              try {
                execFileAsync('xattr', ['-d', 'com.apple.quarantine', tempPath]).catch(() => {});
              } catch {}
            }
          }

          if (fs.existsSync(targetPath)) {
            try {
              fs.unlinkSync(targetPath);
            } catch (unlinkErr) {
              const code = (unlinkErr as any)?.code;
              if (code === 'EBUSY' || code === 'EPERM') {
                throw new Error('yt-dlp binary is currently locked by another process or antivirus. Close active downloads and try again.');
              }
            }
          }
          fs.renameSync(tempPath, targetPath);
        } catch (downloadErr) {
          if (fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch {}
          }
          throw downloadErr;
        }
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

      await this.checkAllBinaries(true);
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
