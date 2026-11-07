import React from 'react';
import {
  ChevronDown,
  Clock,
  FolderOpen,
  Info,
  Rocket,
  Sliders,
  User,
  X
} from 'lucide-react';
import { useJobStore } from '../../store/useJobStore';
import { TimeRangeSlider, formatMmSsMs } from './TimeRangeSlider';
import type { StemMode } from '../../types/media';

export const StagingCard: React.FC = () => {
  const stagedMedia = useJobStore((s) => s.stagedMedia);
  const selectedQuality = useJobStore((s) => s.selectedQuality);
  const setSelectedQuality = useJobStore((s) => s.setSelectedQuality);
  const editReadyMode = useJobStore((s) => s.editReadyMode);
  const trimEnabled = useJobStore((s) => s.trimEnabled);
  const setTrimEnabled = useJobStore((s) => s.setTrimEnabled);
  const startTime = useJobStore((s) => s.startTime);
  const endTime = useJobStore((s) => s.endTime);
  const setTimeRange = useJobStore((s) => s.setTimeRange);
  const stemMode = useJobStore((s) => s.stemMode);
  const setStemMode = useJobStore((s) => s.setStemMode);
  const outputDir = useJobStore((s) => s.outputDir);
  const chooseOutputDirectory = useJobStore((s) => s.chooseOutputDirectory);
  const clearStagedMedia = useJobStore((s) => s.clearStagedMedia);
  const enqueueAndRunStagedJob = useJobStore((s) => s.enqueueAndRunStagedJob);

  if (!stagedMedia) {
    return null;
  }

  const activeQualityObj =
    stagedMedia.availableQualities.find((q) => q.id === selectedQuality) ||
    stagedMedia.availableQualities[0];

  const codecSummary = selectedQuality.startsWith('audio')
    ? editReadyMode || selectedQuality === 'audio-wav'
      ? '48kHz 16-bit PCM (.wav)'
      : '320kbps (.mp3)'
    : editReadyMode
      ? 'H.264 + AAC (.mp4 NLE safe)'
      : 'Native stream (.mkv)';

  return (
    <div className="card bg-base-200 border border-base-300 p-4 space-y-4">
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="flex gap-3.5 min-w-0">
          <div className="relative w-36 h-20 rounded-lg overflow-hidden bg-base-300 shrink-0">
            <img
              src={stagedMedia.thumbnail}
              alt={stagedMedia.title}
              className="w-full h-full object-cover"
            />
            <span className="badge badge-xs badge-neutral absolute bottom-1.5 right-1.5 num">
              {formatMmSsMs(stagedMedia.duration)}
            </span>
          </div>

          <div className="flex flex-col justify-between min-w-0 py-0.5">
            <div className="flex items-center gap-2">
              <span className="badge badge-xs badge-accent">
                {stagedMedia.platform}
              </span>
              {stagedMedia.isSimulatedProbe && (
                <span className="badge badge-xs badge-warning">
                  Simulated probe
                </span>
              )}
              <span className="text-xs text-base-content/60 flex items-center gap-1 truncate">
                <User className="w-3 h-3" /> {stagedMedia.uploader}
              </span>
            </div>

            <h3 className="text-sm font-semibold text-base-content truncate pr-4">
              {stagedMedia.title}
            </h3>

            <div className="flex items-center gap-2 text-xs text-base-content/60">
              <Clock className="w-3.5 h-3.5 text-accent" />
              <span>
                Target container: <strong className="text-base-content num">{codecSummary}</strong>
              </span>
              <div
                className="tooltip tooltip-right"
                data-tip="Edit-Ready mode remuxes VP9/WebM into constant-frame-rate H.264 MP4 or 48kHz PCM WAV so Premiere Pro and DaVinci Resolve never drop frames."
              >
                <button
                  type="button"
                  aria-label="Container pipeline details"
                  className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stream Quality daisyUI Dropdown + Close Button */}
        <div className="flex items-start gap-2 shrink-0">
          <details className="dropdown dropdown-end">
            <summary className="btn btn-sm btn-outline gap-2 font-normal">
              <span>{activeQualityObj?.label || selectedQuality}</span>
              <span className="badge badge-xs badge-neutral num">
                {editReadyMode
                  ? activeQualityObj?.isAudioOnly
                    ? 'PCM WAV'
                    : 'H.264 MP4'
                  : activeQualityObj?.codecBadge}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </summary>
            <ul className="dropdown-content menu bg-base-100 rounded-box z-20 w-64 p-2 shadow-xl border border-base-300 mt-1">
              <li className="menu-title text-xs">Select stream format</li>
              {stagedMedia.availableQualities.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      setSelectedQuality(q.id);
                      const details = e.currentTarget.closest('details');
                      if (details) details.removeAttribute('open');
                    }}
                    className={`flex items-center justify-between ${
                      selectedQuality === q.id ? 'menu-active' : ''
                    }`}
                  >
                    <span>{q.label}</span>
                    <span className="badge badge-xs badge-ghost num">
                      {editReadyMode ? (q.isAudioOnly ? 'PCM WAV' : 'H.264 MP4') : q.codecBadge}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <button
            type="button"
            onClick={clearStagedMedia}
            title="Dismiss staging card"
            className="btn btn-sm btn-ghost btn-square"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <TimeRangeSlider
        duration={stagedMedia.duration}
        startTime={startTime}
        endTime={endTime}
        trimEnabled={trimEnabled}
        onToggleTrim={setTrimEnabled}
        onChangeRange={setTimeRange}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-base-content/80 mr-1">
            <Sliders className="w-3.5 h-3.5 text-accent" />
            <span>AI stems:</span>
          </span>

          <div className="join">
            {(
              [
                { id: 'off', label: 'Off' },
                { id: '2-stem', label: '2-Stem (Vocals + BGM)' },
                { id: '4-stem', label: '4-Stem (Studio)' }
              ] as Array<{ id: StemMode; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStemMode(opt.id)}
                className={`btn btn-xs join-item ${
                  stemMode === opt.id ? 'btn-primary' : 'btn-outline'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={chooseOutputDirectory}
            title={`Export Folder: ${outputDir}`}
            className="btn btn-sm btn-ghost border border-base-300 gap-1.5 max-w-[220px] font-normal"
          >
            <FolderOpen className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate num text-xs">{outputDir || 'Export folder'}</span>
          </button>

          <button
            type="button"
            onClick={enqueueAndRunStagedJob}
            className="btn btn-sm btn-primary gap-2"
          >
            <Rocket className="w-4 h-4" />
            <span>
              {stemMode === 'off'
                ? trimEnabled
                  ? 'Clip & rip to disk'
                  : 'Rip stream'
                : 'Rip & split AI stems'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
