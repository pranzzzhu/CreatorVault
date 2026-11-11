import React from 'react';
import {
  ChevronDown,
  Clock,
  Download,
  FolderOpen,
  Info,
  Scissors,
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

  const formatSummary = selectedQuality.startsWith('audio')
    ? editReadyMode || selectedQuality === 'audio-wav'
      ? 'WAV Audio (Best for editing)'
      : 'MP3 Audio'
    : editReadyMode
      ? 'MP4 Video (Ready to edit)'
      : 'Original MKV Video';

  const downloadButtonLabel =
    stemMode !== 'off'
      ? trimEnabled
        ? 'Cut & Split Stems'
        : 'Download & Split Stems'
      : trimEnabled
        ? 'Cut & Download Clip'
        : 'Download';

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
                  Preview mode
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
                Saves as: <strong className="text-base-content num">{formatSummary}</strong>
              </span>
              <div
                className="tooltip tooltip-right"
                data-tip="Automatically saves videos as standard MP4 and audio as WAV so they drop right into Premiere, Resolve, or FL Studio without lag."
              >
                <button
                  type="button"
                  aria-label="Format info"
                  className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quality Dropdown + Close Button */}
        <div className="flex items-start gap-2 shrink-0">
          <details className="dropdown dropdown-end">
            <summary className="btn btn-sm btn-outline gap-2 font-normal">
              <span>{activeQualityObj?.label || selectedQuality}</span>
              <span className="badge badge-xs badge-neutral num">
                {editReadyMode
                  ? activeQualityObj?.isAudioOnly
                    ? 'WAV'
                    : 'MP4'
                  : activeQualityObj?.codecBadge}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </summary>
            <ul className="dropdown-content menu bg-base-100 rounded-box z-20 w-64 p-2 shadow-xl border border-base-300 mt-1">
              <li className="menu-title text-xs">Choose quality</li>
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
                      {editReadyMode ? (q.isAudioOnly ? 'WAV' : 'MP4') : q.codecBadge}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <button
            type="button"
            onClick={clearStagedMedia}
            title="Close"
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
            <span>Split audio stems:</span>
          </span>

          <div className="join">
            {(
              [
                { id: 'off', label: 'Off' },
                { id: '2-stem', label: 'Vocals + Instrumental' },
                { id: '4-stem', label: 'Vocals, Drums, Bass, Other' }
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
            title={`Save folder: ${outputDir}`}
            className="btn btn-sm btn-ghost border border-base-300 gap-1.5 max-w-[220px] font-normal"
          >
            <FolderOpen className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate num text-xs">{outputDir || 'Save folder'}</span>
          </button>

          <button
            type="button"
            onClick={enqueueAndRunStagedJob}
            className="btn btn-sm btn-primary gap-2"
          >
            {trimEnabled ? <Scissors className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>{downloadButtonLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
