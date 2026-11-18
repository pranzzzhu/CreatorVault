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
  Loader2,
  Mic,
  Music,
  Pause,
  PenTool,
  Play,
  ShieldCheck,
  Trash2,
  Volume2,
  VolumeX,
  XCircle
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { ButtonGroup } from '@astryxdesign/core/ButtonGroup';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { IconButton } from '@astryxdesign/core/IconButton';
import { InfoTip } from '@astryxdesign/core/InfoTip';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
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
  const stemPills = pills.filter(
    (p) =>
      p.type !== 'audio' &&
      p.type !== 'video' &&
      p.type !== 'proxy' &&
      (p.type === 'vocals' ||
        p.type === 'instrumental' ||
        p.type === 'drums' ||
        p.type === 'bass' ||
        p.type === 'other' ||
        (p.filePath.toLowerCase().endsWith('.wav') && !p.id.toLowerCase().includes('master')))
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [soloId, setSoloId] = useState<string | null>(null);
  const [mutedIds, setMutedIds] = useState<Record<string, boolean>>({});
  const [progressRatio, setProgressRatio] = useState(0);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Record<string, GainNode>>({});
  const mediaElementSourcesRef = useRef<Record<string, MediaElementAudioSourceNode>>({});

  useEffect(() => {
    const ctx = audioCtxRef.current;
    for (const pill of stemPills) {
      const gain = gainNodesRef.current[pill.id];
      const shouldMute = soloId ? pill.id !== soloId : Boolean(mutedIds[pill.id]);
      const targetVal = shouldMute ? 0 : 1;
      if (gain && ctx) {
        gain.gain.setTargetAtTime(targetVal, ctx.currentTime, 0.015);
      } else {
        const el = audioRefs.current[pill.id];
        if (el) el.muted = shouldMute;
      }
    }
  }, [soloId, mutedIds, stemPills]);

  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach((el) => {
        if (el) {
          el.pause();
        }
      });
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  if (stemPills.length <= 1) return null;

  const togglePlayAll = async () => {
    if (isPlaying) {
      Object.values(audioRefs.current).forEach((el) => el?.pause());
      setIsPlaying(false);
    } else {
      if (!audioCtxRef.current) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          audioCtxRef.current = new AudioCtxClass();
        }
      }
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      if (ctx) {
        for (const pill of stemPills) {
          const el = audioRefs.current[pill.id];
          if (el && !mediaElementSourcesRef.current[pill.id]) {
            try {
              const src = ctx.createMediaElementSource(el);
              const gain = ctx.createGain();
              const shouldMute = soloId ? pill.id !== soloId : Boolean(mutedIds[pill.id]);
              gain.gain.value = shouldMute ? 0 : 1;
              src.connect(gain);
              gain.connect(ctx.destination);
              mediaElementSourcesRef.current[pill.id] = src;
              gainNodesRef.current[pill.id] = gain;
            } catch {
              // Element already connected or fallback
            }
          }
        }
      }

      const masterEl = audioRefs.current[stemPills[0]?.id];
      const targetTime =
        masterEl && Number.isFinite(masterEl.currentTime) ? masterEl.currentTime : 0;
      Object.values(audioRefs.current).forEach((el) => {
        if (el) {
          el.currentTime = targetTime;
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
    <VStack gap={2} className="pt-2">
      <Divider />
      <HStack vAlign="center" hAlign="between">
        <HStack vAlign="center" gap={2}>
          <IconButton
            label={isPlaying ? 'Pause Stem Mixer' : 'Preview & Audition Stems'}
            variant="primary"
            size="sm"
            icon={isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            onClick={togglePlayAll}
          />
          <Text size="sm" weight="medium" color="primary">
            Preview split tracks
          </Text>
        </HStack>

        <Badge variant="neutral" label={soloId ? 'Solo active' : '48kHz PCM'} />
      </HStack>

      <div className="divide-y divide-border border-y border-border">
        {stemPills.map((pill, pillIdx) => {
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

              <Text size="sm" color="primary" maxLines={1} className="num min-w-0">
                {pill.label}
              </Text>

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
                        isPlaying && !isMuted && activeBar ? 'bg-info' : 'bg-border-strong'
                      }`}
                    />
                  );
                })}
              </div>

              <ButtonGroup label={`Controls for ${pill.label}`} size="sm" className="shrink-0">
                <Button
                  label="S"
                  variant={isSolo ? 'primary' : 'secondary'}
                  tooltip="Solo Stem"
                  onClick={() => toggleSolo(pill.id)}
                />
                <IconButton
                  label={isMuted ? 'Unmute Stem' : 'Mute Stem'}
                  variant={isMuted ? 'destructive' : 'secondary'}
                  icon={
                    isMuted ? (
                      <VolumeX className="w-3 h-3" />
                    ) : (
                      <Volume2 className="w-3 h-3" />
                    )
                  }
                  onClick={() => toggleMute(pill.id)}
                />
              </ButtonGroup>
            </div>
          );
        })}
      </div>
    </VStack>
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

  const progressVariant =
    job.stage === 'error' ? 'error' : job.stage === 'completed' ? 'success' : 'accent';

  return (
    <Card padding={4} className="bg-surface">
      <VStack gap={3}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {job.stage === 'completed' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : job.stage === 'error' ? (
              <XCircle className="w-4 h-4 text-error shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 text-info animate-spin shrink-0" />
            )}

            {job.config.thumbnail && (
              <img
                src={job.config.thumbnail}
                alt={job.config.title}
                className="w-8 h-8 rounded-sm object-cover bg-muted border border-border shrink-0"
              />
            )}

            <VStack gap={0.5} className="min-w-0 flex-1">
              <HStack vAlign="center" gap={2} wrap="wrap">
                <Text size="sm" weight="semibold" color="primary" maxLines={1}>
                  {job.config.title}
                </Text>
                <Badge variant="neutral" label={job.config.quality} />
                {job.config.duration > 0 && !job.config.trimEnabled && (
                  <Badge variant="neutral" label={`${job.config.duration.toFixed(1)}s`} />
                )}
                {job.config.trimEnabled && (
                  <Badge
                    variant="info"
                    label={`${(job.config.endTime - job.config.startTime).toFixed(1)}s clip`}
                  />
                )}
                {job.usedSimulation && <Badge variant="warning" label="Simulated" />}
              </HStack>

              <Text type="supporting" size="sm" color="secondary" maxLines={1}>
                {job.statusMessage}
              </Text>
            </VStack>
          </div>

          <HStack vAlign="center" gap={2} className="shrink-0">
            {isRunning && (
              <HStack vAlign="center" gap={2} className="num">
                {job.speed !== '—' && (
                  <Text size="sm" color="secondary">
                    {job.speed}
                  </Text>
                )}
                <Text size="sm" weight="semibold" color="primary">
                  {job.progress}%
                </Text>
              </HStack>
            )}

            {job.outputFilePath && (
              <IconButton
                label="Reveal in Explorer / Finder"
                variant="ghost"
                size="sm"
                icon={<FolderOpen className="w-3.5 h-3.5" />}
                onClick={() => window.vortexApi?.openFolder(job.outputFilePath!)}
              />
            )}

            {isRunning ? (
              <Button
                label="Abort"
                variant="destructive"
                size="sm"
                onClick={() => cancelJob(job.id)}
              />
            ) : (
              <IconButton
                label="Remove from queue"
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={() => removeJob(job.id)}
              />
            )}
          </HStack>
        </div>

        <ProgressBar
          label={job.config.title}
          isLabelHidden
          value={job.progress}
          max={100}
          variant={progressVariant}
        />

        {job.stage === 'completed' && job.pills.length > 0 && (
          <VStack gap={3} className="pt-1">
            {job.vmafComparison && (
              <div className="flex flex-wrap items-center gap-2.5 p-2.5 rounded-md bg-success-muted/30 border border-success text-xs">
                <HStack vAlign="center" gap={1.5}>
                  <ShieldCheck className="w-4 h-4 text-success shrink-0" />
                  <Text size="sm" weight="medium" className="text-success">
                    Compression Armor:
                  </Text>
                </HStack>

                <HStack vAlign="center" gap={2} className="num">
                  <Text size="sm" color="secondary">
                    Raw Upload:{' '}
                    <strong className="font-semibold text-primary">
                      {job.vmafComparison.rawScore.toFixed(1)}
                    </strong>
                  </Text>
                  <span className="text-success font-bold">&rarr;</span>
                  <Text size="sm" className="text-success">
                    Armored:{' '}
                    <strong className="font-bold">
                      {job.vmafComparison.optimizedScore.toFixed(1)}
                    </strong>
                  </Text>
                </HStack>

                <Badge
                  variant="success"
                  label={`+${(
                    job.vmafComparison.optimizedScore - job.vmafComparison.rawScore
                  ).toFixed(1)} Lift`}
                />

                {job.vmafComparison.simulatedPreviewPath && (
                  <Text size="sm" color="secondary" className="ml-auto num">
                    (Simulated platform transcode: 3.5Mbps CRF 25)
                  </Text>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Text size="sm" color="secondary" className="mr-1">
                Drag to timeline:
              </Text>

              {job.pills.map((pill) => {
                const Icon = getPillIcon(pill.type);
                return (
                  <div
                    key={pill.id}
                    draggable={true}
                    onDragStart={(e) => {
                      e.preventDefault();
                      window.vortexApi?.startNativeDrag(pill.filePath);
                    }}
                    title={`Click and drag "${pill.fileName}" straight into Premiere Pro, After Effects, DaVinci Resolve, FL Studio, or Desktop.\nPath: ${pill.filePath}`}
                    className="native-drag-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-info/50 bg-info-muted/30 hover:bg-info-muted/50 text-xs text-primary cursor-grab active:cursor-grabbing transition-colors num"
                  >
                    <GripVertical className="w-3 h-3 text-secondary pointer-events-none" />
                    <Icon className="w-3.5 h-3.5 text-info pointer-events-none" />
                    <span className="pointer-events-none">{pill.label}</span>
                  </div>
                );
              })}
            </div>

            <StemAudioMixer pills={job.pills} />
          </VStack>
        )}
      </VStack>
    </Card>
  );
};

export const JobQueueList: React.FC = () => {
  const jobs = useJobStore((s) => s.jobs);

  return (
    <VStack gap={3}>
      <HStack vAlign="center" hAlign="between" className="px-1">
        <HStack vAlign="center" gap={1.5}>
          <Text size="sm" weight="semibold" color="secondary">
            Finished Files & Downloads ({jobs.length})
          </Text>
          <InfoTip
            label="Native OS drag instructions"
            size="xsm"
            content="Completed stem pills use Electron's native OS file drag (startDrag). Drag any pill straight onto your Premiere Pro, Resolve, or FL Studio timeline."
          />
        </HStack>

        <Text size="sm" color="secondary">
          Drag any file button below into your editor
        </Text>
      </HStack>

      {jobs.length === 0 ? (
        <Card variant="muted" padding={2} className="border border-dashed border-border-strong">
          <EmptyState
            isCompact
            title="No files yet"
            description="Paste a link above or drop a file in any tab to get started."
          />
        </Card>
      ) : (
        <VStack gap={3}>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </VStack>
      )}
    </VStack>
  );
};
