import { create } from 'zustand';
import type {
  BinaryName,
  BrowserSource,
  FixerJobConfig,
  FixerPresetId,
  JobConfig,
  JobItem,
  JobProgressEvent,
  LocalImageMetadata,
  LocalVideoMetadata,
  MediaMetadata,
  ModuleId,
  QualityPreset,
  StemMode,
  SystemDiagnostics,
  ThemeMode,
  VectorJobConfig,
  VectorPresetId
} from '../types/media';

interface JobStoreState {
  activeModule: ModuleId;
  themeMode: ThemeMode;
  zoomFactor: number;
  editReadyMode: boolean;
  browserCookies: BrowserSource;
  simulateIfMissingBinary: boolean;
  outputDir: string;

  diagnostics: SystemDiagnostics | null;
  isSettingsModalOpen: boolean;
  installingBinaries: Record<string, boolean>;

  // URL Command Bar & Staging Card state
  urlInput: string;
  isProbing: boolean;
  probeError: string | null;
  stagedMedia: MediaMetadata | null;

  // Staging Configuration
  selectedQuality: QualityPreset;
  trimEnabled: boolean;
  startTime: number;
  endTime: number;
  stemMode: StemMode;

  // Phase 2: Video Fixer & Proxy Deck State
  stagedLocalVideos: LocalVideoMetadata[];
  selectedFixerPreset: FixerPresetId;
  targetSizeMB: number;
  silenceThresholdDb: number;
  silenceMinDuration: number;
  deflickerWindow: number;
  useHardwareEncoder: boolean;
  fixerError: string | null;

  // Phase 3: Vector, Background & Upscale State
  stagedLocalImages: LocalImageMetadata[];
  selectedVectorPreset: VectorPresetId;
  vectorColorMode: 'color' | 'binary';
  vectorDetailLevel: 'low' | 'medium' | 'high';
  matteTolerance: number;
  upscaleFactor: 2 | 4;
  vectorError: string | null;
  lastVectorPreview: {
    sourcePath: string;
    outputPath: string;
    preset: VectorPresetId;
  } | null;

  // Active & Completed Queue
  jobs: JobItem[];

  // Actions
  setActiveModule: (mod: ModuleId) => void;
  setThemeMode: (theme: ThemeMode) => void;
  setZoomFactor: (factor: number) => Promise<void>;
  zoomIn: () => Promise<void>;
  zoomOut: () => Promise<void>;
  resetZoom: () => Promise<void>;
  setEditReadyMode: (enabled: boolean) => void;
  setBrowserCookies: (browser: BrowserSource) => void;
  setSimulateIfMissingBinary: (enabled: boolean) => void;
  setOutputDir: (dir: string) => void;
  setSettingsModalOpen: (open: boolean) => void;

  setUrlInput: (url: string) => void;
  setSelectedQuality: (q: QualityPreset) => void;
  setTrimEnabled: (enabled: boolean) => void;
  setTimeRange: (start: number, end: number) => void;
  setStemMode: (mode: StemMode) => void;
  clearStagedMedia: () => void;

  // Phase 2 Actions
  setSelectedFixerPreset: (preset: FixerPresetId) => void;
  setTargetSizeMB: (mb: number) => void;
  setSilenceThresholdDb: (db: number) => void;
  setSilenceMinDuration: (sec: number) => void;
  setDeflickerWindow: (win: number) => void;
  setUseHardwareEncoder: (enabled: boolean) => void;
  browseAndStageLocalVideos: () => Promise<void>;
  stageLocalVideoPaths: (paths: string[]) => Promise<void>;
  removeStagedLocalVideo: (filePath: string) => void;
  clearStagedLocalVideos: () => void;
  enqueueAndRunFixerJobs: () => Promise<void>;

  // Phase 3 Actions
  setSelectedVectorPreset: (preset: VectorPresetId) => void;
  setVectorColorMode: (mode: 'color' | 'binary') => void;
  setVectorDetailLevel: (level: 'low' | 'medium' | 'high') => void;
  setMatteTolerance: (tol: number) => void;
  setUpscaleFactor: (scale: 2 | 4) => void;
  browseAndStageLocalImages: () => Promise<void>;
  stageLocalImagePaths: (paths: string[]) => Promise<void>;
  removeStagedLocalImage: (filePath: string) => void;
  clearStagedLocalImages: () => void;
  enqueueAndRunVectorJobs: () => Promise<void>;

  initDiagnostics: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  installSidecarBinary: (name: BinaryName) => Promise<{ success: boolean; message: string }>;
  chooseOutputDirectory: () => Promise<void>;
  probeUrl: (urlOverride?: string) => Promise<void>;
  enqueueAndRunStagedJob: () => Promise<void>;
  handleProgressEvent: (ev: JobProgressEvent) => void;
  cancelJob: (jobId: string) => Promise<void>;
  removeJob: (jobId: string) => void;
}

export const useJobStore = create<JobStoreState>((set, get) => ({
  activeModule: 'ripper',
  themeMode: 'antigravity-dark',
  zoomFactor: 1,
  editReadyMode: true,
  browserCookies: 'none',
  simulateIfMissingBinary: true,
  outputDir: '',

  diagnostics: null,
  isSettingsModalOpen: false,
  installingBinaries: {},

  urlInput: '',
  isProbing: false,
  probeError: null,
  stagedMedia: null,

  selectedQuality: '1080p',
  trimEnabled: false,
  startTime: 0,
  endTime: 30,
  stemMode: 'off',

  stagedLocalVideos: [],
  selectedFixerPreset: 'deflicker',
  targetSizeMB: 10,
  silenceThresholdDb: -30,
  silenceMinDuration: 0.5,
  deflickerWindow: 7,
  useHardwareEncoder: true,
  fixerError: null,

  stagedLocalImages: [],
  selectedVectorPreset: 'vtracer',
  vectorColorMode: 'color',
  vectorDetailLevel: 'medium',
  matteTolerance: 24,
  upscaleFactor: 4,
  vectorError: null,
  lastVectorPreview: null,

  jobs: [],

  setActiveModule: (activeModule) => set({ activeModule }),
  setThemeMode: (themeMode) => {
    document.documentElement.setAttribute('data-theme', themeMode);
    set({ themeMode });
  },
  setZoomFactor: async (factor: number) => {
    const clamped = Math.min(1.5, Math.max(0.75, Math.round(factor * 100) / 100));
    if (window.vortexApi?.setZoomFactor) {
      const applied = await window.vortexApi.setZoomFactor(clamped);
      set({ zoomFactor: applied });
    } else {
      set({ zoomFactor: clamped });
    }
  },
  zoomIn: async () => {
    await get().setZoomFactor(get().zoomFactor + 0.1);
  },
  zoomOut: async () => {
    await get().setZoomFactor(get().zoomFactor - 0.1);
  },
  resetZoom: async () => {
    await get().setZoomFactor(1);
  },
  setEditReadyMode: (editReadyMode) => set({ editReadyMode }),
  setBrowserCookies: (browserCookies) => set({ browserCookies }),
  setSimulateIfMissingBinary: (simulateIfMissingBinary) => set({ simulateIfMissingBinary }),
  setOutputDir: (outputDir) => set({ outputDir }),
  setSettingsModalOpen: (isSettingsModalOpen) => set({ isSettingsModalOpen }),

  setUrlInput: (urlInput) => set({ urlInput, probeError: null }),
  setSelectedQuality: (selectedQuality) => set({ selectedQuality }),
  setTrimEnabled: (trimEnabled) => set({ trimEnabled }),
  setTimeRange: (start, end) => {
    const media = get().stagedMedia;
    const maxDur = media ? media.duration : 3600;
    const clampedStart = Math.max(0, Math.min(start, maxDur - 1));
    const clampedEnd = Math.max(clampedStart + 1, Math.min(end, maxDur));
    set({ startTime: Number(clampedStart.toFixed(2)), endTime: Number(clampedEnd.toFixed(2)) });
  },
  setStemMode: (stemMode) => set({ stemMode }),
  clearStagedMedia: () =>
    set({
      stagedMedia: null,
      urlInput: '',
      probeError: null,
      trimEnabled: false
    }),

  setSelectedFixerPreset: (selectedFixerPreset) => set({ selectedFixerPreset, fixerError: null }),
  setTargetSizeMB: (targetSizeMB) => set({ targetSizeMB }),
  setSilenceThresholdDb: (silenceThresholdDb) => set({ silenceThresholdDb }),
  setSilenceMinDuration: (silenceMinDuration) => set({ silenceMinDuration }),
  setDeflickerWindow: (deflickerWindow) => set({ deflickerWindow }),
  setUseHardwareEncoder: (useHardwareEncoder) => set({ useHardwareEncoder }),

  browseAndStageLocalVideos: async () => {
    if (!window.vortexApi?.selectVideoFiles) return;
    const paths = await window.vortexApi.selectVideoFiles();
    if (paths && paths.length > 0) {
      await get().stageLocalVideoPaths(paths);
    }
  },

  stageLocalVideoPaths: async (paths: string[]) => {
    if (!window.vortexApi?.probeLocalVideo || paths.length === 0) return;
    set({ fixerError: null, isProbing: true });

    const existingPaths = new Set(get().stagedLocalVideos.map((v) => v.filePath));
    const newlyProbed: LocalVideoMetadata[] = [];

    for (const p of paths) {
      if (!p || existingPaths.has(p)) continue;
      try {
        const meta = await window.vortexApi.probeLocalVideo(p);
        newlyProbed.push(meta);
        existingPaths.add(p);
      } catch (err) {
        set({ fixerError: (err as Error).message || `Failed to probe ${p}` });
      }
    }

    set((prev) => ({
      isProbing: false,
      stagedLocalVideos:
        newlyProbed.length > 0
          ? [...prev.stagedLocalVideos, ...newlyProbed]
          : prev.stagedLocalVideos
    }));
  },

  removeStagedLocalVideo: (filePath: string) =>
    set((prev) => ({
      stagedLocalVideos: prev.stagedLocalVideos.filter((v) => v.filePath !== filePath)
    })),

  clearStagedLocalVideos: () => set({ stagedLocalVideos: [], fixerError: null }),

  enqueueAndRunFixerJobs: async () => {
    const state = get();
    if (state.stagedLocalVideos.length === 0 || !window.vortexApi?.startFixerJob) return;

    const presetBadgeMap: Record<FixerPresetId, QualityPreset> = {
      deflicker: '1080p',
      'target-size': '720p',
      'prores-proxy': '1080p',
      'silence-xml': '1080p'
    };

    const videosToProcess = [...state.stagedLocalVideos];
    // Clear staged videos immediately so re-clicks cannot submit duplicates (MJ-1)
    set({ stagedLocalVideos: [], fixerError: null });

    // Execute sequentially to respect consumer GPU NVENC session limits (CB-1)
    for (const video of videosToProcess) {
      const jobId = `fix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const fixerConfig: FixerJobConfig = {
        inputPath: video.filePath,
        fileName: video.fileName,
        duration: video.duration,
        width: video.width,
        height: video.height,
        fps: video.fps,
        preset: state.selectedFixerPreset,
        targetSizeMB: state.targetSizeMB,
        silenceThresholdDb: state.silenceThresholdDb,
        silenceMinDuration: state.silenceMinDuration,
        deflickerWindow: state.deflickerWindow,
        useHardwareEncoder: state.useHardwareEncoder,
        outputDir: state.outputDir || state.diagnostics?.defaultOutputDir || './exports'
      };

      const newJob: JobItem = {
        id: jobId,
        createdAt: Date.now(),
        config: {
          url: video.filePath,
          title: `[${state.selectedFixerPreset.toUpperCase()}] ${video.fileName}`,
          thumbnail: '',
          platform: 'Direct',
          duration: video.duration,
          quality: presetBadgeMap[state.selectedFixerPreset],
          editReadyMode: true,
          trimEnabled: false,
          startTime: 0,
          endTime: video.duration,
          stemMode: 'off',
          browserCookies: 'none',
          outputDir: fixerConfig.outputDir,
          simulateIfMissingBinary: false
        },
        stage: 'remuxing',
        progress: 2,
        speed: '—',
        eta: '—',
        statusMessage: `Starting FFmpeg ${state.selectedFixerPreset} pipeline...`,
        pills: []
      };

      set((prev) => ({
        jobs: [newJob, ...prev.jobs]
      }));

      try {
        const result = await window.vortexApi.startFixerJob(jobId, fixerConfig);
        set((prev) => ({
          jobs: prev.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  stage: 'completed',
                  progress: 100,
                  statusMessage: 'Ready — Drag processed media to timeline',
                  outputFilePath: result.outputFilePath,
                  pills: result.pills,
                  usedSimulation: false
                }
              : j
          )
        }));
      } catch (err) {
        const msg = (err as Error).message || 'FFmpeg fixer job failed';
        const isCancelled = msg.toLowerCase().includes('cancelled by user');
        set((prev) => ({
          jobs: prev.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  stage: 'error',
                  statusMessage: isCancelled ? 'Cancelled by user' : msg,
                  error: msg
                }
              : j
          )
        }));
      }
    }
  },

  setSelectedVectorPreset: (selectedVectorPreset) =>
    set({ selectedVectorPreset, vectorError: null }),
  setVectorColorMode: (vectorColorMode) => set({ vectorColorMode }),
  setVectorDetailLevel: (vectorDetailLevel) => set({ vectorDetailLevel }),
  setMatteTolerance: (matteTolerance) => set({ matteTolerance }),
  setUpscaleFactor: (upscaleFactor) => set({ upscaleFactor }),

  browseAndStageLocalImages: async () => {
    if (!window.vortexApi?.selectImageFiles) return;
    const paths = await window.vortexApi.selectImageFiles();
    if (paths && paths.length > 0) {
      await get().stageLocalImagePaths(paths);
    }
  },

  stageLocalImagePaths: async (paths: string[]) => {
    if (!window.vortexApi?.probeLocalImage || paths.length === 0) return;
    set({ vectorError: null, isProbing: true });

    const existingPaths = new Set(get().stagedLocalImages.map((img) => img.filePath));
    const newlyProbed: LocalImageMetadata[] = [];

    for (const p of paths) {
      if (!p || existingPaths.has(p)) continue;
      try {
        const meta = await window.vortexApi.probeLocalImage(p);
        newlyProbed.push(meta);
        existingPaths.add(p);
      } catch (err) {
        set({ vectorError: (err as Error).message || `Failed to inspect image ${p}` });
      }
    }

    set((prev) => ({
      isProbing: false,
      stagedLocalImages:
        newlyProbed.length > 0
          ? [...prev.stagedLocalImages, ...newlyProbed]
          : prev.stagedLocalImages
    }));
  },

  removeStagedLocalImage: (filePath: string) =>
    set((prev) => ({
      stagedLocalImages: prev.stagedLocalImages.filter((img) => img.filePath !== filePath)
    })),

  clearStagedLocalImages: () =>
    set({ stagedLocalImages: [], vectorError: null, lastVectorPreview: null }),

  enqueueAndRunVectorJobs: async () => {
    const state = get();
    if (state.stagedLocalImages.length === 0 || !window.vortexApi?.startVectorJob) return;

    const imagesToProcess = [...state.stagedLocalImages];
    // Clear staged images immediately so re-clicks cannot submit duplicates (MJ-1)
    set({ stagedLocalImages: [], vectorError: null });

    // Execute sequentially to prevent PyTorch/ONNX VRAM spikes (CB-1)
    for (const img of imagesToProcess) {
      const jobId = `vec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const vecConfig: VectorJobConfig = {
        inputPath: img.filePath,
        fileName: img.fileName,
        width: img.width,
        height: img.height,
        preset: state.selectedVectorPreset,
        colorMode: state.vectorColorMode,
        detailLevel: state.vectorDetailLevel,
        matteTolerance: state.matteTolerance,
        upscaleFactor: state.upscaleFactor,
        outputDir: state.outputDir || state.diagnostics?.defaultOutputDir || './exports'
      };

      const newJob: JobItem = {
        id: jobId,
        createdAt: Date.now(),
        config: {
          url: img.filePath,
          title: `[${state.selectedVectorPreset.toUpperCase()}] ${img.fileName}`,
          thumbnail: `vortex-media://local/${encodeURIComponent(img.filePath)}`,
          platform: 'Direct',
          duration: 0,
          quality: state.selectedVectorPreset === 'esrgan' && state.upscaleFactor === 4 ? '4K' : '1080p',
          editReadyMode: true,
          trimEnabled: false,
          startTime: 0,
          endTime: 0,
          stemMode: 'off',
          browserCookies: 'none',
          outputDir: vecConfig.outputDir,
          simulateIfMissingBinary: false
        },
        stage: 'remuxing',
        progress: 5,
        speed: '—',
        eta: '—',
        statusMessage: `Running ${state.selectedVectorPreset} asset pipeline...`,
        pills: []
      };

      set((prev) => ({
        jobs: [newJob, ...prev.jobs]
      }));

      try {
        const result = await window.vortexApi.startVectorJob(jobId, vecConfig);
        set((prev) => ({
          lastVectorPreview: {
            sourcePath: img.filePath,
            outputPath: result.outputFilePath,
            preset: state.selectedVectorPreset
          },
          jobs: prev.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  stage: 'completed',
                  progress: 100,
                  statusMessage: 'Ready — Drag vector or image asset to canvas',
                  outputFilePath: result.outputFilePath,
                  pills: result.pills,
                  usedSimulation: false
                }
              : j
          )
        }));
      } catch (err) {
        const msg = (err as Error).message || 'Asset pipeline failed';
        const isCancelled = msg.toLowerCase().includes('cancelled by user');
        set((prev) => ({
          jobs: prev.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  stage: 'error',
                  statusMessage: isCancelled ? 'Cancelled by user' : msg,
                  error: msg
                }
              : j
          )
        }));
      }
    }
  },

  initDiagnostics: async () => {
    if (!window.vortexApi) return;
    const diag = await window.vortexApi.getDiagnostics();
    set({
      diagnostics: diag,
      outputDir: get().outputDir || diag.defaultOutputDir
    });
  },

  refreshDiagnostics: async () => {
    if (!window.vortexApi) return;
    const diag = await window.vortexApi.refreshDiagnostics();
    set({
      diagnostics: diag,
      outputDir: get().outputDir || diag.defaultOutputDir
    });
  },

  installSidecarBinary: async (name: BinaryName) => {
    if (!window.vortexApi?.installBinary) {
      return { success: false, message: 'Installer bridge unavailable' };
    }
    set((prev) => ({
      installingBinaries: { ...prev.installingBinaries, [name]: true }
    }));
    try {
      const res = await window.vortexApi.installBinary(name);
      set((prev) => ({
        diagnostics: res.diagnostics || prev.diagnostics,
        installingBinaries: { ...prev.installingBinaries, [name]: false }
      }));
      return { success: res.success, message: res.message };
    } catch (err) {
      set((prev) => ({
        installingBinaries: { ...prev.installingBinaries, [name]: false }
      }));
      return { success: false, message: (err as Error).message || `Failed to install ${name}` };
    }
  },

  chooseOutputDirectory: async () => {
    if (!window.vortexApi) return;
    const picked = await window.vortexApi.selectOutputDirectory();
    if (picked) {
      set({ outputDir: picked });
    }
  },

  probeUrl: async (urlOverride?: string) => {
    const targetUrl = (urlOverride ?? get().urlInput).trim();
    if (!targetUrl) return;

    set({
      urlInput: targetUrl,
      isProbing: true,
      probeError: null
    });

    try {
      const metadata = await window.vortexApi.probeUrl(
        targetUrl,
        get().browserCookies,
        get().simulateIfMissingBinary
      );
      const defaultEnd = Math.min(metadata.duration, Math.max(15, Math.round(metadata.duration * 0.25)));
      set({
        stagedMedia: metadata,
        isProbing: false,
        trimEnabled: false,
        startTime: 0,
        endTime: defaultEnd
      });
    } catch (err) {
      set({
        isProbing: false,
        probeError: (err as Error).message || 'Failed to inspect URL.'
      });
    }
  },

  enqueueAndRunStagedJob: async () => {
    const state = get();
    const media = state.stagedMedia;
    if (!media) return;

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const config: JobConfig = {
      url: media.url,
      title: media.title,
      thumbnail: media.thumbnail,
      platform: media.platform,
      duration: media.duration,
      quality: state.selectedQuality,
      editReadyMode: state.editReadyMode,
      trimEnabled: state.trimEnabled,
      startTime: state.startTime,
      endTime: state.endTime,
      stemMode: state.stemMode,
      browserCookies: state.browserCookies,
      outputDir: state.outputDir || state.diagnostics?.defaultOutputDir || './exports',
      simulateIfMissingBinary: state.simulateIfMissingBinary
    };

    const newJob: JobItem = {
      id: jobId,
      createdAt: Date.now(),
      config,
      stage: 'downloading',
      progress: 2,
      speed: '—',
      eta: '—',
      statusMessage: 'Spawning worker pipeline...',
      pills: []
    };

    set((prev) => ({
      jobs: [newJob, ...prev.jobs]
    }));

    try {
      const result = await window.vortexApi.startJob(jobId, config);
      set((prev) => ({
        jobs: prev.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                stage: 'completed',
                progress: 100,
                statusMessage: 'Ready — Drag pills to timeline',
                outputFilePath: result.outputFilePath,
                pills: result.pills,
                usedSimulation: result.usedSimulation
              }
            : j
        )
      }));
    } catch (err) {
      const msg = (err as Error).message || 'Pipeline execution failed';
      const isCancelled = msg.toLowerCase().includes('cancelled by user');
      set((prev) => ({
        jobs: prev.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                stage: 'error',
                statusMessage: isCancelled ? 'Cancelled by user' : msg,
                error: msg
              }
            : j
        )
      }));
    }
  },

  handleProgressEvent: (ev: JobProgressEvent) => {
    set((prev) => ({
      jobs: prev.jobs.map((j) =>
        j.id === ev.jobId
          ? {
              ...j,
              stage: ev.stage,
              progress: ev.progress,
              speed: ev.speed ?? j.speed,
              eta: ev.eta ?? j.eta,
              statusMessage: ev.statusMessage
            }
          : j
      )
    }));
  },

  cancelJob: async (jobId: string) => {
    if (window.vortexApi) {
      await window.vortexApi.cancelJob(jobId);
    }
    set((prev) => ({
      jobs: prev.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              stage: 'error',
              statusMessage: 'Cancelled by user'
            }
          : j
      )
    }));
  },

  removeJob: (jobId: string) => {
    set((prev) => ({
      jobs: prev.jobs.filter((j) => j.id !== jobId)
    }));
  }
}));
