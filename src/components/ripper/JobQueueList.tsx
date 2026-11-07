import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Disc,
  Drum,
  FileCode2,
  Film,
  FolderOpen,
  GripVertical,
  Guitar,
  Image as ImageIcon,
  Info,
  Loader2,
  Mic,
  Music,
  Pause,
  PenTool,
  Play,
  Trash2,
  Volume2,
  VolumeX,
  XCircle
} from 'lucide-react';
import { useJobStore } from '../../store/useJobStore';
import type { JobItem, StemOutputPill } from '../../types/media';

function getPillIcon(type: StemOutputPill['type']) {
  switch (type) {
    case 'video':
    case 'proxy':
      return Film;
    case 'xml':
      return FileCode2;
    case 'svg':
      return PenTool;
    case 'image':
      return ImageIcon;
    case 'vocals':
      return Mic;
    case 'instrumental':
      return Music;
    case 'drums':
      return Drum;
    case 'bass':
      return Guitar;
    default:
      return Disc;
  }
}

interface StemAudioMixerProps {
  pills: StemOutputPill[];
}

const StemAudioMixer: React.FC<StemAudioMixerProps> = ({ pills }) => {
  const audioPills = pills.filter(
    (p) =>
      p.filePath.toLowerCase().endsWith('.wav') ||
      p.filePath.toLowerCase().endsWith('.mp3')
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [soloId, setSoloId] = useState<string | null>(null);
  const [mutedIds, setMutedIds] = useState<Record<string, boolean>>({});
  const [progressRatio, setProgressRatio] = useState(0);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    for (const pill of audioPills) {
      const el = audioRefs.current[pill.id];
      if (!el) continue;
      if (soloId) {
        el.muted = pill.id !== soloId;
      } else {
        el.muted = Boolean(mutedIds[pill.id]);
      }
    }
  }, [soloId, mutedIds, audioPills]);

  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach((el) => {
        if (el) {
          el.pause();
        }
      });
    };
  }, []);

  if (audioPills.length === 0) return null;

  const togglePlayAll = () => {
    if (isPlaying) {
      Object.values(audioRefs.current).forEach((el) => el?.pause());
      setIsPlaying(false);
    } else {
      Object.values(audioRefs.current).forEach((el) => {
        if (el) {
          el.currentTime = 0;
          el.play().catch(() => {});
        }
      });
      setIsPlaying(true);
    }
  };

  const toggleMute = (id: string) => {
    setSoloId(null);
    setMutedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSolo = (id: string) => {
    setSoloId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="border-t border-base-300 pt-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={togglePlayAll}
            className="btn btn-xs btn-circle btn-primary"
            title={isPlaying ? 'Pause Stem Mixer' : 'Preview & Audition Stems'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <span className="text-xs font-medium text-base-content">
            Stem audition mixer
          </span>
        </div>

        <span className="badge badge-xs badge-ghost num">
          {soloId ? 'Solo active' : '48kHz PCM'}
        </span>
      </div>

      <div className="divide-y divide-base-300 border-y border-base-300">
        {audioPills.map((pill, pillIdx) => {
          const isMuted = soloId ? pill.id !== soloId : Boolean(mutedIds[pill.id]);
          const isSolo = soloId === pill.id;
          const fileUrl = `vortex-media://local/${encodeURIComponent(pill.filePath)}`;

          return (
            <div
              key={pill.id}
              className={`flex items-center justify-between py-2 transition-opacity duration-150 ${
                isMuted ? 'opacity-45' : 'opacity-100'
              }`}
            >
              <audio
                ref={(el) => {
                  audioRefs.current[pill.id] = el;
                }}
                src={fileUrl}
                onTimeUpdate={(e) => {
                  if (pillIdx === 0) {
                    const el = e.currentTarget;
                    if (el.duration > 0) {
                      setProgressRatio(el.currentTime / el.duration);
                    }
                    // Keep sibling stem tracks phase-aligned within 35ms (MJ-2)
                    Object.entries(audioRefs.current).forEach(([id, sibling]) => {
                      if (id !== pill.id && sibling && !sibling.paused) {
                        if (Math.abs(sibling.currentTime - el.currentTime) > 0.035) {
                          sibling.currentTime = el.currentTime;
                        }
                      }
                    });
                  }
                }}
                onEnded={() => {
                  if (pillIdx === 0) {
                    setIsPlaying(false);
                    setProgressRatio(0);
                  }
                }}
              />

              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-base-content truncate num">
                  {pill.label}
                </span>
              </div>

              <div className="flex items-center gap-[2px] h-4 mx-2">
                {Array.from({ length: 16 }).map((_, barIdx) => {
                  const activeBar = progressRatio * 16 >= barIdx;
                  return (
                    <span
                      key={barIdx}
                      style={{
                        height: `${25 + ((barIdx * 23 + pillIdx * 11) % 75)}%`
                      }}
                      className={`w-[2px] rounded-full transition-colors duration-150 ${
                        isPlaying && !isMuted && activeBar
                          ? 'bg-accent'
                          : 'bg-base-300'
                      }`}
                    />
                  );
                })}
              </div>

              <div className="join shrink-0">
                <button
                  type="button"
                  onClick={() => toggleSolo(pill.id)}
                  title="Solo Stem (S)"
                  className={`btn btn-xs join-item ${
                    isSolo ? 'btn-primary' : 'btn-outline'
                  }`}
                >
                  S
                </button>
                <button
                  type="button"
                  onClick={() => toggleMute(pill.id)}
                  title="Mute Stem (M)"
                  className={`btn btn-xs join-item ${
                    isMuted ? 'btn-error' : 'btn-outline'
                  }`}
                >
                  {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const JobCard: React.FC<{ job: JobItem }> = ({ job }) => {
  const cancelJob = useJobStore((s) => s.cancelJob);
  const removeJob = useJobStore((s) => s.removeJob);

  const isRunning =
    job.stage === 'queued' ||
    job.stage === 'downloading' ||
    job.stage === 'remuxing' ||
    job.stage === 'separating_stems';

  return (
    <div className="card bg-base-200 border border-base-300 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {job.stage === 'completed' ? (
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          ) : job.stage === 'error' ? (
            <XCircle className="w-4 h-4 text-error shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
          )}

          {job.config.thumbnail && (
            <img
              src={job.config.thumbnail}
              alt={job.config.title}
              className="w-8 h-8 rounded object-cover bg-base-300 border border-base-300 shrink-0"
            />
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-base-content truncate">
                {job.config.title}
              </h4>
              <span className="badge badge-xs badge-neutral shrink-0 num">
                {job.config.quality}
              </span>
              {job.config.duration > 0 && !job.config.trimEnabled && (
                <span className="badge badge-xs badge-ghost shrink-0 num">
                  {job.config.duration.toFixed(1)}s
                </span>
              )}
              {job.config.trimEnabled && (
                <span className="badge badge-xs badge-accent shrink-0 num">
                  {(job.config.endTime - job.config.startTime).toFixed(1)}s clip
                </span>
              )}
              {job.usedSimulation && (
                <span className="badge badge-xs badge-warning shrink-0">
                  Simulated
                </span>
              )}
            </div>
            <p className="text-xs text-base-content/60 truncate mt-0.5">
              {job.statusMessage}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRunning && (
            <div className="flex items-center gap-2 text-xs text-base-content/60 num">
              {job.speed !== '—' && <span>{job.speed}</span>}
              <span className="text-base-content font-semibold">{job.progress}%</span>
            </div>
          )}

          {job.outputFilePath && (
            <button
              type="button"
              onClick={() => window.vortexApi?.openFolder(job.outputFilePath!)}
              title="Reveal in Explorer / Finder"
              className="btn btn-xs btn-ghost btn-square"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}

          {isRunning ? (
            <button
              type="button"
              onClick={() => cancelJob(job.id)}
              title="Cancel Job"
              className="btn btn-xs btn-error btn-outline"
            >
              Abort
            </button>
          ) : (
            <button
              type="button"
              onClick={() => removeJob(job.id)}
              title="Remove from queue"
              className="btn btn-xs btn-ghost btn-square text-base-content/60 hover:text-error"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <progress
        className={`progress w-full h-1.5 ${
          job.stage === 'error'
            ? 'progress-error'
            : job.stage === 'completed'
              ? 'progress-success'
              : 'progress-accent'
        }`}
        value={job.progress}
        max={100}
      />

      {job.stage === 'completed' && job.pills.length > 0 && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-base-content/60 mr-1">
              Drag to timeline:
            </span>

            {job.pills.map((pill) => {
              const Icon = getPillIcon(pill.type);
              return (
                <div
                  key={pill.id}
                  draggable
                  onDragStart={(e) => {
                    e.preventDefault();
                    window.vortexApi?.startNativeDrag(pill.filePath);
                  }}
                  title={`Click and drag "${pill.fileName}" straight into Premiere Pro, After Effects, DaVinci Resolve, FL Studio, or Desktop.\nPath: ${pill.filePath}`}
                  className="btn btn-xs btn-outline gap-1.5 cursor-grab active:cursor-grabbing font-normal num"
                >
                  <GripVertical className="w-3 h-3 opacity-60" />
                  <Icon className="w-3.5 h-3.5 text-accent" />
                  <span>{pill.label}</span>
                </div>
              );
            })}
          </div>

          <StemAudioMixer pills={job.pills} />
        </div>
      )}
    </div>
  );
};

export const JobQueueList: React.FC = () => {
  const jobs = useJobStore((s) => s.jobs);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-base-content/80">
            Timeline queue ({jobs.length})
          </span>
          <div
            className="tooltip tooltip-right"
            data-tip="Completed stem pills use Electron's native OS file drag (startDrag). Drag any pill straight onto your Premiere Pro, Resolve, or FL Studio timeline."
          >
            <button
              type="button"
              aria-label="Native OS drag instructions"
              className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <span className="text-xs text-base-content/50">
          Native OS drag-out active
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="card bg-base-200 border border-dashed border-base-300 p-6 flex flex-row items-center justify-between">
          <div>
            <p className="text-xs font-medium text-base-content">
              No media jobs in queue yet
            </p>
            <p className="text-xs text-base-content/60 mt-0.5">
              Paste a URL above or pick a sample preset to stage a clip.
            </p>
          </div>
          <span className="badge badge-sm badge-ghost">Idle</span>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
};
