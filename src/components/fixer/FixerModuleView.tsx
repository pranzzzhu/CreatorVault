import React, { useState } from 'react';
import {
  Cpu,
  FileVideo,
  Film,
  Flame,
  FolderPlus,
  Gauge,
  Info,
  Play,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import { useJobStore } from '../../store/useJobStore';
import type { FixerPresetId } from '../../types/media';
import { JobQueueList } from '../ripper/JobQueueList';

const FIXER_PRESETS: Array<{
  id: FixerPresetId;
  title: string;
  badge: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'reel-optimizer',
    title: 'Social Compression Armor (IG Reels / TikTok)',
    badge: '1080×1920 Lanczos + Rec.709',
    desc: 'Pre-compensates for aggressive platform re-compression using 1080×1920 Lanczos scaling, grain denoising, unsharp pre-emphasis, Rec.709 color lock, and post-upload simulation.',
    icon: ShieldCheck
  },
  {
    id: 'deflicker',
    title: 'LED Deflicker & De-Band',
    badge: 'deflicker=mode=pm:size=7',
    desc: 'Eliminates high-speed shutter banding and PWM studio lighting flicker using temporal predictive-mean filtering and gradfun de-banding.',
    icon: Flame
  },
  {
    id: 'target-size',
    title: 'Exact Target Size Compressor',
    badge: 'Bitrate Solver (8MB–100MB)',
    desc: 'Calculates exact video/audio bitrates from ffprobe duration to fit Discord, WhatsApp, or client review upload caps without guesswork.',
    icon: Gauge
  },
  {
    id: 'silence-xml',
    title: 'Dead-Air Silence Chopper → Premiere XML',
    badge: 'silencedetect + xmeml v5',
    desc: 'Detects dialogue pauses and exports both a non-destructive Final Cut Pro 7 / Premiere Pro / Resolve .xml timeline and a jump-cut MP4.',
    icon: Scissors
  },
  {
    id: 'prores-proxy',
    title: 'Instant ProRes 422 Proxy Deck',
    badge: 'prores_ks -profile:v 0',
    desc: 'Transcodes laggy drone or action-cam HEVC/VFR footage into scrub-friendly 1080p Apple ProRes 422 Proxy (.mov) with 48kHz PCM audio.',
    icon: Film
  }
];

const TARGET_SIZE_OPTIONS = [8, 10, 25, 50, 100];
const DEFLICKER_WINDOW_OPTIONS = [5, 7, 11];
const SILENCE_DB_OPTIONS = [-25, -30, -35, -40];
const SILENCE_DUR_OPTIONS = [0.3, 0.5, 0.8];

export const FixerModuleView: React.FC = () => {
  const stagedLocalVideos = useJobStore((s) => s.stagedLocalVideos);
  const selectedFixerPreset = useJobStore((s) => s.selectedFixerPreset);
  const targetSizeMB = useJobStore((s) => s.targetSizeMB);
  const silenceThresholdDb = useJobStore((s) => s.silenceThresholdDb);
  const silenceMinDuration = useJobStore((s) => s.silenceMinDuration);
  const deflickerWindow = useJobStore((s) => s.deflickerWindow);
  const useHardwareEncoder = useJobStore((s) => s.useHardwareEncoder);
  const fixerError = useJobStore((s) => s.fixerError);
  const isProbing = useJobStore((s) => s.isProbing);
  const diagnostics = useJobStore((s) => s.diagnostics);
  const jobs = useJobStore((s) => s.jobs);

  const reelPlatform = useJobStore((s) => s.reelPlatform);
  const reelTargetFps = useJobStore((s) => s.reelTargetFps);
  const reelPreSharpen = useJobStore((s) => s.reelPreSharpen);
  const reelDenoiseGrain = useJobStore((s) => s.reelDenoiseGrain);
  const reelColorFixRec709 = useJobStore((s) => s.reelColorFixRec709);
  const reelSimulateIgCompression = useJobStore((s) => s.reelSimulateIgCompression);

  const setSelectedFixerPreset = useJobStore((s) => s.setSelectedFixerPreset);
  const setTargetSizeMB = useJobStore((s) => s.setTargetSizeMB);
  const setSilenceThresholdDb = useJobStore((s) => s.setSilenceThresholdDb);
  const setSilenceMinDuration = useJobStore((s) => s.setSilenceMinDuration);
  const setDeflickerWindow = useJobStore((s) => s.setDeflickerWindow);
  const setUseHardwareEncoder = useJobStore((s) => s.setUseHardwareEncoder);
  const setReelPlatform = useJobStore((s) => s.setReelPlatform);
  const setReelTargetFps = useJobStore((s) => s.setReelTargetFps);
  const setReelPreSharpen = useJobStore((s) => s.setReelPreSharpen);
  const setReelDenoiseGrain = useJobStore((s) => s.setReelDenoiseGrain);
  const setReelColorFixRec709 = useJobStore((s) => s.setReelColorFixRec709);
  const setReelSimulateIgCompression = useJobStore((s) => s.setReelSimulateIgCompression);
  const browseAndStageLocalVideos = useJobStore((s) => s.browseAndStageLocalVideos);
  const stageLocalVideoPaths = useJobStore((s) => s.stageLocalVideoPaths);
  const removeStagedLocalVideo = useJobStore((s) => s.removeStagedLocalVideo);
  const clearStagedLocalVideos = useJobStore((s) => s.clearStagedLocalVideos);
  const enqueueAndRunFixerJobs = useJobStore((s) => s.enqueueAndRunFixerJobs);

  const [isDragOver, setIsDragOver] = useState(false);

  const hasNvenc = Boolean(diagnostics?.hardware.hasNvenc);
  const completedVideoPaths = jobs
    .filter(
      (j) =>
        j.stage === 'completed' &&
        j.outputFilePath &&
        /\.(mp4|mov|mkv|webm)$/i.test(j.outputFilePath)
    )
    .map((j) => j.outputFilePath!);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const paths: string[] = [];
    for (const file of files) {
      const p = window.vortexApi?.getPathForDroppedFile?.(file);
      if (p) paths.push(p);
    }
    if (paths.length > 0) {
      await stageLocalVideoPaths(paths);
    }
  };

  // Calculate preview bitrate for first staged video when Target Size Compressor is active
  const primaryVideo = stagedLocalVideos[0];
  const estimatedKbps = primaryVideo
    ? Math.max(
        150,
        Math.floor(
          (targetSizeMB * 8192 * 0.94) / Math.max(1, primaryVideo.duration) - 128
        )
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-base-content">
            FFmpeg Video Fixer & Proxy Deck
          </h2>
          <span className="badge badge-xs badge-accent">Active</span>
        </div>

        <div className="flex items-center gap-2">
          {completedVideoPaths.length > 0 && (
            <button
              type="button"
              onClick={() => stageLocalVideoPaths([completedVideoPaths[0]])}
              className="btn btn-xs btn-ghost border border-base-300 gap-1.5"
              title="Stage the most recent video clip from the queue"
            >
              <Sparkles className="w-3 h-3 text-accent" />
              <span>Stage latest ripped clip</span>
            </button>
          )}
          <span className="badge badge-xs badge-ghost num">
            {hasNvenc ? 'NVIDIA NVENC ready' : 'CPU libx264 ready'}
          </span>
        </div>
      </div>

      {/* Dropzone & File Browser */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`card bg-base-200 border border-dashed p-5 transition-colors ${
          isDragOver ? 'border-accent bg-base-300/40' : 'border-base-300'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <UploadCloud className="w-5 h-5 text-accent shrink-0" />
            <div>
              <p className="text-xs font-medium text-base-content">
                Drop local camera footage (.mp4, .mov, .mkv, .mxf) or browse files
              </p>
              <p className="text-xs text-base-content/60 mt-0.5">
                Probes resolution, frame rate, and duration via <code className="num">ffprobe</code> for frame-accurate processing.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isProbing}
            onClick={browseAndStageLocalVideos}
            className="btn btn-sm btn-primary gap-1.5 shrink-0"
          >
            {isProbing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <FolderPlus className="w-4 h-4" />
            )}
            <span>{isProbing ? 'Probing...' : 'Select footage'}</span>
          </button>
        </div>

        {/* Staged Local Videos List */}
        {stagedLocalVideos.length > 0 && (
          <div className="mt-4 pt-4 border-t border-base-300 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-base-content/70">
                Staged source files ({stagedLocalVideos.length})
              </span>
              <button
                type="button"
                onClick={clearStagedLocalVideos}
                className="btn btn-ghost btn-xs text-base-content/60 hover:text-error gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear all</span>
              </button>
            </div>

            <div className="divide-y divide-base-300 border border-base-300 rounded-lg bg-base-100">
              {stagedLocalVideos.map((vid) => (
                <div
                  key={vid.filePath}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileVideo className="w-4 h-4 text-accent shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-base-content truncate">
                        {vid.fileName}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-base-content/60 num mt-0.5">
                        <span>
                          {vid.width}×{vid.height}
                        </span>
                        <span>·</span>
                        <span>{vid.fps} fps</span>
                        <span>·</span>
                        <span>{vid.duration.toFixed(1)}s</span>
                        <span>·</span>
                        <span>{vid.fileSizeMB} MB</span>
                        <span>·</span>
                        <span className="uppercase">{vid.videoCodec}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeStagedLocalVideo(vid.filePath)}
                    className="btn btn-ghost btn-xs btn-square text-base-content/50 hover:text-error shrink-0"
                    title="Remove file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {fixerError && (
        <div role="alert" className="alert alert-error py-2 px-3 text-xs">
          <span>{fixerError}</span>
        </div>
      )}

      {/* 4 Selectable Fixer Preset Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FIXER_PRESETS.map((preset, idx) => {
          const Icon = preset.icon;
          const isSelected = selectedFixerPreset === preset.id;
          // Left column opens tooltip upward so it never clips under the left sidebar rail
          const tooltipDir = idx % 2 === 0 ? 'tooltip-top' : 'tooltip-left';
          return (
            <div
              key={preset.id}
              onClick={() => setSelectedFixerPreset(preset.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedFixerPreset(preset.id);
                }
              }}
              className={`card p-4 flex flex-row items-center justify-between gap-3 cursor-pointer transition-colors border ${
                isSelected
                  ? 'bg-base-300/70 border-base-content/40'
                  : 'bg-base-200 border-base-300 hover:bg-base-200/80'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isSelected ? 'text-accent' : 'text-base-content/60'
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-base-content truncate">
                      {preset.title}
                    </h3>
                    {isSelected && (
                      <span className="badge badge-xs badge-primary">Selected</span>
                    )}
                  </div>
                  <span className="text-xs text-base-content/50 block truncate mt-0.5 num">
                    {preset.badge}
                  </span>
                </div>
              </div>

              <div
                className={`tooltip ${tooltipDir} shrink-0`}
                data-tip={preset.desc}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  aria-label={`Details for ${preset.title}`}
                  className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preset Parameter Controls & Execute Bar */}
      <div className="card bg-base-200 border border-base-300 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Dynamic Controls per Selected Preset */}
          {selectedFixerPreset === 'reel-optimizer' && (
            <div className="flex flex-wrap items-center gap-4">
              {/* Target Platform */}
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Platform
                </span>
                <div className="join">
                  {(
                    [
                      { id: 'ig-reels', label: 'IG Reels' },
                      { id: 'tiktok', label: 'TikTok' },
                      { id: 'yt-shorts', label: 'Shorts' }
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setReelPlatform(p.id)}
                      className={`btn btn-xs join-item num ${
                        reelPlatform === p.id ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target FPS */}
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Target FPS
                </span>
                <div className="join">
                  {(
                    [
                      { id: 'keep', label: 'Source' },
                      { id: '30', label: '30' },
                      { id: '60', label: '60' }
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setReelTargetFps(f.id)}
                      className={`btn btn-xs join-item num ${
                        reelTargetFps === f.id ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pre-Sharpen */}
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Pre-Sharpen
                </span>
                <div className="join">
                  {(
                    [
                      { id: 'none', label: 'None' },
                      { id: 'subtle', label: 'Subtle' },
                      { id: 'crisp', label: 'Crisp' }
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setReelPreSharpen(s.id)}
                      className={`btn btn-xs join-item num ${
                        reelPreSharpen === s.id ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sleek Toggles */}
              <div className="flex flex-wrap items-center gap-3 pt-1 sm:pt-0">
                <label className="label cursor-pointer gap-2 py-0" title="Reduces high-frequency noise that causes macroblocking under platform compression">
                  <span className="text-xs text-base-content/80">Grain Saver</span>
                  <input
                    type="checkbox"
                    checked={reelDenoiseGrain}
                    onChange={(e) => setReelDenoiseGrain(e.target.checked)}
                    className="toggle toggle-xs toggle-primary"
                  />
                </label>

                <label className="label cursor-pointer gap-2 py-0" title="Tags bt709 primaries and TV range to prevent washed-out colors on mobile. For SDR sources only; HDR/HLG footage needs tone-mapping in your NLE.">
                  <span className="text-xs text-base-content/80">Rec.709 Lock</span>
                  <input
                    type="checkbox"
                    checked={reelColorFixRec709}
                    onChange={(e) => setReelColorFixRec709(e.target.checked)}
                    className="toggle toggle-xs toggle-primary"
                  />
                </label>

                <label className="label cursor-pointer gap-2 py-0" title="Simulates constrained 3.5Mbps platform re-compression and calculates VMAF retention lift">
                  <span className="text-xs text-base-content/80">IG Simulation</span>
                  <input
                    type="checkbox"
                    checked={reelSimulateIgCompression}
                    onChange={(e) => setReelSimulateIgCompression(e.target.checked)}
                    className="toggle toggle-xs toggle-primary"
                  />
                </label>
              </div>
            </div>
          )}

          {selectedFixerPreset === 'deflicker' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Temporal PM window (frames)
                </span>
                <div className="join">
                  {DEFLICKER_WINDOW_OPTIONS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setDeflickerWindow(w)}
                      className={`btn btn-xs join-item num ${
                        deflickerWindow === w ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      {w}f
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedFixerPreset === 'target-size' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Target file size cap
                </span>
                <div className="join">
                  {TARGET_SIZE_OPTIONS.map((mb) => (
                    <button
                      key={mb}
                      type="button"
                      onClick={() => setTargetSizeMB(mb)}
                      className={`btn btn-xs join-item num ${
                        targetSizeMB === mb ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      {mb} MB
                    </button>
                  ))}
                </div>
              </div>

              {estimatedKbps !== null && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-base-content/70 block">
                    Solved video bitrate
                  </span>
                  <span className="badge badge-sm badge-neutral num">
                    {estimatedKbps} kbps + 128k AAC
                  </span>
                </div>
              )}
            </div>
          )}

          {selectedFixerPreset === 'silence-xml' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Silence threshold
                </span>
                <div className="join">
                  {SILENCE_DB_OPTIONS.map((db) => (
                    <button
                      key={db}
                      type="button"
                      onClick={() => setSilenceThresholdDb(db)}
                      className={`btn btn-xs join-item num ${
                        silenceThresholdDb === db ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      {db} dB
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Min pause duration
                </span>
                <div className="join">
                  {SILENCE_DUR_OPTIONS.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setSilenceMinDuration(sec)}
                      className={`btn btn-xs join-item num ${
                        silenceMinDuration === sec ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedFixerPreset === 'prores-proxy' && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-base-content">
                1080p Apple ProRes 422 Proxy (<code className="num">prores_ks -profile:v 0</code>)
              </span>
              <p className="text-xs text-base-content/60">
                Outputs constant-frame-rate <code className="num">yuv422p10le .mov</code> with uncompressed 48kHz 16-bit PCM stereo audio.
              </p>
            </div>
          )}

          {/* Right side: Hardware Encoder toggle + Execute CTA */}
          <div className="flex items-center gap-3 shrink-0">
            {selectedFixerPreset !== 'prores-proxy' && (
              <label
                className="label cursor-pointer gap-2 py-0"
                title={
                  selectedFixerPreset === 'reel-optimizer'
                    ? useHardwareEncoder
                      ? 'NVENC GPU active. Turn off for maximum quality tuned libx264 CPU encode.'
                      : 'Maximum quality tuned libx264 CPU encode active. Turn on for faster NVENC GPU encode.'
                    : undefined
                }
              >
                <Cpu className="w-3.5 h-3.5 text-base-content/70" />
                <span className="text-xs text-base-content/80">
                  {hasNvenc ? 'NVENC GPU' : 'Hardware'}
                </span>
                <input
                  type="checkbox"
                  checked={useHardwareEncoder}
                  onChange={(e) => setUseHardwareEncoder(e.target.checked)}
                  className="toggle toggle-xs toggle-primary"
                />
              </label>
            )}

            <button
              type="button"
              disabled={stagedLocalVideos.length === 0}
              onClick={enqueueAndRunFixerJobs}
              className="btn btn-sm btn-primary gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                Run Fixer{stagedLocalVideos.length > 0 ? ` (${stagedLocalVideos.length})` : ''}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Shared Queue & Native OS Drag-to-Timeline Pills */}
      <JobQueueList />
    </div>
  );
};
