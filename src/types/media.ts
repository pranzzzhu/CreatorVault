export type ModuleId = 'ripper' | 'fixer' | 'vectorizer';

export type ThemeMode = 'antigravity-dark' | 'antigravity-light';

export type SourcePlatform =
  | 'YouTube'
  | 'Instagram'
  | 'TikTok'
  | 'X'
  | 'SoundCloud'
  | 'Twitch'
  | 'Direct';

export type QualityPreset = '4K' | '1440p' | '1080p' | '720p' | 'audio-wav' | 'audio-mp3';

export type StemMode = 'off' | '2-stem' | '4-stem';

export type BrowserSource = 'none' | 'chrome' | 'brave' | 'edge' | 'firefox';

export type FixerPresetId =
  | 'deflicker'
  | 'target-size'
  | 'silence-xml'
  | 'prores-proxy'
  | 'reel-optimizer';

export type FixerPreset = FixerPresetId;

export interface ReelOptimizerOptions {
  platform: 'ig-reels' | 'tiktok' | 'yt-shorts';
  targetFps: 'keep' | '30' | '60';
  preSharpen: 'none' | 'subtle' | 'crisp';
  denoiseGrain: boolean;
  colorFixRec709: boolean;
  simulateIgCompression: boolean;
}

export type VectorPresetId = 'vtracer' | 'rmbg' | 'esrgan';

export interface LocalImageMetadata {
  filePath: string;
  fileName: string;
  fileSizeKB: number;
  width: number;
  height: number;
  format: string;
}

export interface VectorJobConfig {
  inputPath: string;
  fileName: string;
  width: number;
  height: number;
  preset: VectorPresetId;
  colorMode: 'color' | 'binary';
  detailLevel: 'low' | 'medium' | 'high';
  matteTolerance: number;
  upscaleFactor: 2 | 4;
  outputDir: string;
}

export interface LocalVideoMetadata {
  filePath: string;
  fileName: string;
  fileSizeMB: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
}

export interface FixerJobConfig {
  inputPath: string;
  fileName: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  preset: FixerPresetId;
  targetSizeMB: number;
  silenceThresholdDb: number;
  silenceMinDuration: number;
  deflickerWindow: number;
  useHardwareEncoder: boolean;
  outputDir: string;
  reelOptimizer?: ReelOptimizerOptions;
}

export interface MediaFormatOption {
  id: QualityPreset;
  label: string;
  resolution?: string;
  codecBadge: string;
  isAudioOnly: boolean;
}

export interface MediaMetadata {
  url: string;
  id: string;
  title: string;
  uploader: string;
  duration: number; // in seconds
  thumbnail: string;
  platform: SourcePlatform;
  webpageUrl: string;
  availableQualities: MediaFormatOption[];
  isSimulatedProbe?: boolean;
}

export interface StemOutputPill {
  id: string;
  label: string;
  type:
    | 'video'
    | 'vocals'
    | 'instrumental'
    | 'drums'
    | 'bass'
    | 'other'
    | 'audio'
    | 'xml'
    | 'proxy'
    | 'svg'
    | 'image';
  filePath: string;
  fileName: string;
}

export type JobStage =
  | 'queued'
  | 'downloading'
  | 'remuxing'
  | 'separating_stems'
  | 'completed'
  | 'error';

export interface JobConfig {
  url: string;
  title: string;
  thumbnail: string;
  platform: SourcePlatform;
  duration: number;
  quality: QualityPreset;
  editReadyMode: boolean;
  trimEnabled: boolean;
  startTime: number; // seconds
  endTime: number;   // seconds
  stemMode: StemMode;
  browserCookies: BrowserSource;
  outputDir: string;
  simulateIfMissingBinary: boolean;
}

export interface JobItem {
  id: string;
  createdAt: number;
  config: JobConfig;
  stage: JobStage;
  progress: number; // 0 to 100
  speed: string;
  eta: string;
  statusMessage: string;
  outputFilePath?: string;
  pills: StemOutputPill[];
  error?: string;
  usedSimulation?: boolean;
  vmafComparison?: {
    rawScore: number;
    optimizedScore: number;
    simulatedPreviewPath?: string;
  };
}

export type BinaryName =
  | 'yt-dlp'
  | 'ffmpeg'
  | 'ffprobe'
  | 'demucs'
  | 'rembg'
  | 'vtracer'
  | 'realesrgan';

export interface BinaryStatus {
  name: BinaryName;
  available: boolean;
  resolvedPath: string;
  source: 'local-bin' | 'system-path' | 'missing';
  version?: string;
  installHint: string;
}

export interface HardwareTelemetry {
  gpuName: string;
  hasNvidiaCuda: boolean;
  hasNvenc: boolean;
  hasAppleSilicon: boolean;
  acceleratorBadge: string;
  recommendedDevice: 'cuda' | 'mps' | 'cpu';
}

export interface SystemDiagnostics {
  binaries: Record<BinaryName, BinaryStatus>;
  hardware: HardwareTelemetry;
  defaultOutputDir: string;
  binDir: string;
}

export interface JobProgressEvent {
  jobId: string;
  stage: JobStage;
  progress: number;
  speed?: string;
  eta?: string;
  statusMessage: string;
}

export interface VortexApi {
  getDiagnostics: () => Promise<SystemDiagnostics>;
  refreshDiagnostics: () => Promise<SystemDiagnostics>;
  installBinary: (name: BinaryName) => Promise<{
    success: boolean;
    message: string;
    diagnostics: SystemDiagnostics;
  }>;
  probeUrl: (url: string, browserCookies: BrowserSource, simulateFallback: boolean) => Promise<MediaMetadata>;
  startJob: (jobId: string, config: JobConfig) => Promise<{
    outputFilePath: string;
    pills: StemOutputPill[];
    usedSimulation: boolean;
  }>;
  selectVideoFiles: () => Promise<string[]>;
  probeLocalVideo: (filePath: string) => Promise<LocalVideoMetadata>;
  startFixerJob: (jobId: string, config: FixerJobConfig) => Promise<{
    outputFilePath: string;
    pills: StemOutputPill[];
    vmafComparison?: {
      rawScore: number;
      optimizedScore: number;
      simulatedPreviewPath?: string;
    };
  }>;
  selectImageFiles: () => Promise<string[]>;
  probeLocalImage: (filePath: string) => Promise<LocalImageMetadata>;
  startVectorJob: (jobId: string, config: VectorJobConfig) => Promise<{
    outputFilePath: string;
    pills: StemOutputPill[];
  }>;
  getPathForDroppedFile: (file: File) => string;
  cancelJob: (jobId: string) => Promise<boolean>;
  startNativeDrag: (filePath: string) => void;
  openFolder: (filePath: string) => Promise<void>;
  selectOutputDirectory: () => Promise<string | null>;
  windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
  setZoomFactor: (factor: number) => Promise<number>;
  getZoomFactor: () => Promise<number>;
  onJobProgress: (callback: (data: JobProgressEvent) => void) => () => void;
}

declare global {
  interface Window {
    vortexApi: VortexApi;
  }
}
