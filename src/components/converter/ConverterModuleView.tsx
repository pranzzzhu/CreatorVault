import React, { useState } from 'react';
import {
  Cpu,
  FileAudio,
  FileVideo,
  FolderPlus,
  Music,
  Play,
  Sparkles,
  Trash2,
  UploadCloud,
  Video,
  X,
  Zap
} from 'lucide-react';
import { useJobStore } from '../../store/useJobStore';
import type { ConverterTargetFormat } from '../../types/media';
import { JobQueueList } from '../ripper/JobQueueList';

const VIDEO_TARGETS: Array<{
  id: ConverterTargetFormat;
  label: string;
  desc: string;
}> = [
  { id: 'mp4', label: 'MP4', desc: 'Standard video (Works everywhere)' },
  { id: 'mov', label: 'MOV', desc: 'Apple QuickTime & Final Cut' },
  { id: 'mkv', label: 'MKV', desc: 'Multi-track video container' },
  { id: 'webm', label: 'WEBM', desc: 'Web & Discord video' },
  { id: 'gif', label: 'GIF', desc: 'Animated looping GIF' }
];

const AUDIO_TARGETS: Array<{
  id: ConverterTargetFormat;
  label: string;
  desc: string;
}> = [
  { id: 'wav', label: 'WAV', desc: 'Uncompressed studio audio' },
  { id: 'mp3', label: 'MP3', desc: 'Small, universal audio file' },
  { id: 'flac', label: 'FLAC', desc: 'Lossless studio audio' },
  { id: 'm4a', label: 'M4A', desc: 'Apple & mobile audio' },
  { id: 'ogg', label: 'OGG', desc: 'Game & web audio' }
];

export const ConverterModuleView: React.FC = () => {
  const stagedConverterMedia = useJobStore((s) => s.stagedConverterMedia);
  const converterTargetFormat = useJobStore((s) => s.converterTargetFormat);
  const converterSmartCopy = useJobStore((s) => s.converterSmartCopy);
  const converterSampleRate = useJobStore((s) => s.converterSampleRate);
  const converterNormalizeLoudness = useJobStore((s) => s.converterNormalizeLoudness);
  const converterAudioToVideoMode = useJobStore((s) => s.converterAudioToVideoMode);
  const useHardwareEncoder = useJobStore((s) => s.useHardwareEncoder);
  const converterError = useJobStore((s) => s.converterError);
  const isProbing = useJobStore((s) => s.isProbing);
  const isConvertingBatch = useJobStore((s) => s.isConvertingBatch);
  const diagnostics = useJobStore((s) => s.diagnostics);

  const setConverterTargetFormat = useJobStore((s) => s.setConverterTargetFormat);
  const setConverterSmartCopy = useJobStore((s) => s.setConverterSmartCopy);
  const setConverterSampleRate = useJobStore((s) => s.setConverterSampleRate);
  const setConverterNormalizeLoudness = useJobStore((s) => s.setConverterNormalizeLoudness);
  const setConverterAudioToVideoMode = useJobStore((s) => s.setConverterAudioToVideoMode);
  const setUseHardwareEncoder = useJobStore((s) => s.setUseHardwareEncoder);
  const browseAndStageConverterMedia = useJobStore((s) => s.browseAndStageConverterMedia);
  const stageConverterMediaPaths = useJobStore((s) => s.stageConverterMediaPaths);
  const removeStagedConverterMedia = useJobStore((s) => s.removeStagedConverterMedia);
  const clearStagedConverterMedia = useJobStore((s) => s.clearStagedConverterMedia);
  const enqueueAndRunConverterJobs = useJobStore((s) => s.enqueueAndRunConverterJobs);

  const [isDragOver, setIsDragOver] = useState(false);

  const hasNvenc = Boolean(diagnostics?.hardware.hasNvenc);
  const isAudioTarget = ['wav', 'mp3', 'flac', 'm4a', 'ogg'].includes(converterTargetFormat);
  const hasStagedAudio = stagedConverterMedia.some((m) => m.mediaType === 'audio');
  const isAudioToVideoActive = hasStagedAudio && !isAudioTarget && converterTargetFormat !== 'gif';

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
      await stageConverterMediaPaths(paths);
    }
  };

  const activeTargetInfo =
    [...VIDEO_TARGETS, ...AUDIO_TARGETS].find((t) => t.id === converterTargetFormat) ||
    VIDEO_TARGETS[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-base-content">
            Video & Audio Format Converter
          </h2>
          <span className="badge badge-xs badge-accent">4-Way Matrix</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge badge-xs badge-ghost num">
            Video ↔ Video · Video → Audio · Audio ↔ Audio · Audio → Video
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
                Drop any Video or Audio files (.mp4, .mkv, .mov, .webm, .wav, .mp3, .flac, .ogg, .m4a)
              </p>
              <p className="text-xs text-base-content/60 mt-0.5">
                Convert any video to audio, video to video, or audio to video in one click.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isProbing}
            onClick={browseAndStageConverterMedia}
            className="btn btn-sm btn-primary gap-1.5 shrink-0"
          >
            {isProbing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <FolderPlus className="w-4 h-4" />
            )}
            <span>{isProbing ? 'Probing...' : 'Select media'}</span>
          </button>
        </div>

        {/* Staged Media Files List */}
        {stagedConverterMedia.length > 0 && (
          <div className="mt-4 pt-4 border-t border-base-300 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-base-content/70">
                Staged media files ({stagedConverterMedia.length})
              </span>
              <button
                type="button"
                onClick={clearStagedConverterMedia}
                className="btn btn-ghost btn-xs text-base-content/60 hover:text-error gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear all</span>
              </button>
            </div>

            <div className="divide-y divide-base-300 border border-base-300 rounded-lg bg-base-100">
              {stagedConverterMedia.map((item) => (
                <div
                  key={item.filePath}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.mediaType === 'video' ? (
                      <FileVideo className="w-4 h-4 text-accent shrink-0" />
                    ) : (
                      <FileAudio className="w-4 h-4 text-success shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-base-content truncate">
                          {item.fileName}
                        </p>
                        <span className="badge badge-xs badge-ghost uppercase num">
                          {item.mediaType}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-base-content/60 num mt-0.5">
                        {item.mediaType === 'video' ? (
                          <>
                            <span>
                              {item.width}×{item.height}
                            </span>
                            <span>·</span>
                            <span>{item.fps} fps</span>
                            <span>·</span>
                            <span className="uppercase">{item.videoCodec}</span>
                          </>
                        ) : (
                          <>
                            <span>{(item.sampleRate / 1000).toFixed(1)} kHz</span>
                            <span>·</span>
                            <span className="uppercase">{item.audioCodec}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{item.duration.toFixed(1)}s</span>
                        <span>·</span>
                        <span>{item.fileSizeMB} MB</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeStagedConverterMedia(item.filePath)}
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

      {converterError && (
        <div role="alert" className="alert alert-error py-2 px-3 text-xs">
          <span>{converterError}</span>
        </div>
      )}

      {/* Target Format Selector Matrix (Video Containers vs Audio Formats) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Video Containers Card */}
        <div className="card bg-base-200 border border-base-300 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold text-base-content">
              <Video className="w-4 h-4 text-accent" />
              <span>Video & Animation Containers</span>
            </span>
            <span className="text-[11px] text-base-content/50 num">
              Video → Video / Audio → Video
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {VIDEO_TARGETS.map((fmt) => {
              const isGifDisabled = fmt.id === 'gif' && hasStagedAudio;
              const active = converterTargetFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  disabled={isGifDisabled}
                  onClick={() => setConverterTargetFormat(fmt.id)}
                  className={`btn btn-sm num ${
                    active ? 'btn-primary' : 'btn-outline border-base-300 bg-base-100'
                  } ${isGifDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  title={isGifDisabled ? 'GIF export unavailable for audio sources' : undefined}
                >
                  .{fmt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Audio Formats Card */}
        <div className="card bg-base-200 border border-base-300 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold text-base-content">
              <Music className="w-4 h-4 text-success" />
              <span>Studio Audio Formats</span>
            </span>
            <span className="text-[11px] text-base-content/50 num">
              Video → Audio / Audio → Audio
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {AUDIO_TARGETS.map((fmt) => {
              const active = converterTargetFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setConverterTargetFormat(fmt.id)}
                  className={`btn btn-sm num ${
                    active ? 'btn-primary' : 'btn-outline border-base-300 bg-base-100'
                  }`}
                >
                  .{fmt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pipeline Parameters & Execute Strip */}
      <div className="card bg-base-200 border border-base-300 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Active Target Pill Summary */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-base-content/70 block">
                Selected target
              </span>
              <div className="flex items-center gap-2">
                <span className="badge badge-sm badge-accent num">
                  .{activeTargetInfo.label}
                </span>
                <span className="text-xs text-base-content/70">
                  {activeTargetInfo.desc}
                </span>
              </div>
            </div>

            {/* Smart Copy Toggle (for Video containers) */}
            {!isAudioTarget && converterTargetFormat !== 'gif' && (
              <label
                className="label cursor-pointer gap-2 py-0"
                title="When enabled, remuxes compatible H.264/HEVC streams directly into the target container (-c copy) in <1 second with zero quality loss."
              >
                <Zap className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs text-base-content/80">Fast Copy (No quality loss)</span>
                <input
                  type="checkbox"
                  checked={converterSmartCopy}
                  onChange={(e) => setConverterSmartCopy(e.target.checked)}
                  className="toggle toggle-xs toggle-primary"
                />
              </label>
            )}

            {/* Sample Rate & Loudness Normalization (for Audio outputs or transcodes) */}
            {isAudioTarget && (
              <>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-base-content/70 block">
                    Sample rate
                  </span>
                  <div className="join">
                    <button
                      type="button"
                      onClick={() => setConverterSampleRate(48000)}
                      className={`btn btn-xs join-item num ${
                        converterSampleRate === 48000 ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      48 kHz (NLE)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConverterSampleRate(44100)}
                      className={`btn btn-xs join-item num ${
                        converterSampleRate === 44100 ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      44.1 kHz
                    </button>
                  </div>
                </div>

                <label
                  className="label cursor-pointer gap-2 py-0"
                  title="Normalizes audio loudness to streaming standard -14 LUFS (YouTube / Spotify)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span className="text-xs text-base-content/80">Even out volume</span>
                  <input
                    type="checkbox"
                    checked={converterNormalizeLoudness}
                    onChange={(e) => setConverterNormalizeLoudness(e.target.checked)}
                    className="toggle toggle-xs toggle-primary"
                  />
                </label>
              </>
            )}

            {/* Audio -> Video Visualizer Mode */}
            {isAudioToVideoActive && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Video background style
                </span>
                <div className="join">
                  <button
                    type="button"
                    onClick={() => setConverterAudioToVideoMode('waveform')}
                    className={`btn btn-xs join-item ${
                      converterAudioToVideoMode === 'waveform' ? 'btn-primary' : 'btn-outline'
                    }`}
                  >
                    Live Waveform
                  </button>
                  <button
                    type="button"
                    onClick={() => setConverterAudioToVideoMode('slate')}
                    className={`btn btn-xs join-item ${
                      converterAudioToVideoMode === 'slate' ? 'btn-primary' : 'btn-outline'
                    }`}
                  >
                    Studio Black Slate
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right side: Hardware Encoder toggle + Convert CTA */}
          <div className="flex items-center gap-3 shrink-0">
            {!isAudioTarget && converterTargetFormat !== 'gif' && (
              <label className="label cursor-pointer gap-2 py-0">
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
              disabled={
                stagedConverterMedia.length === 0 ||
                isConvertingBatch ||
                (hasStagedAudio && converterTargetFormat === 'gif')
              }
              onClick={enqueueAndRunConverterJobs}
              className="btn btn-sm btn-primary gap-1.5"
            >
              {isConvertingBatch ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>
                {isConvertingBatch
                  ? 'Converting Batch...'
                  : `Convert to .${converterTargetFormat.toUpperCase()}${
                      stagedConverterMedia.length > 0 ? ` (${stagedConverterMedia.length})` : ''
                    }`}
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
