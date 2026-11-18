import React from 'react';
import {
  Cpu,
  FileVideo,
  Film,
  Flame,
  Gauge,
  Play,
  Scissors,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Code } from '@astryxdesign/core/Code';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { InfoTip } from '@astryxdesign/core/InfoTip';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { useJobStore } from '../../store/useJobStore';
import type { FixerPresetId } from '../../types/media';
import { JobQueueList } from '../ripper/JobQueueList';
import { MediaDropzone } from '../shared/MediaDropzone';
import { OutputFolderButton } from '../shared/OutputFolderButton';

const FIXER_PRESETS: Array<{
  id: FixerPresetId;
  title: string;
  badge: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'reel-optimizer',
    title: 'Social Media Quality Guard (Reels / TikTok)',
    badge: '1080×1920 + Crisp Color',
    desc: 'Resizes to vertical 9:16, cleans up grain, sharpens details, and locks colors so Instagram and TikTok do not make your upload blurry.',
    icon: ShieldCheck
  },
  {
    id: 'deflicker',
    title: 'Fix Flickering Lights',
    badge: 'Smooths indoor LED flicker',
    desc: 'Removes annoying light pulsing and color banding caused by indoor LED lights or fast camera shutter speeds.',
    icon: Flame
  },
  {
    id: 'target-size',
    title: 'Shrink to Exact File Size',
    badge: 'Fit 8MB, 10MB, 25MB or 50MB',
    desc: 'Automatically shrinks your video to fit right under Discord, WhatsApp, or email file size limits.',
    icon: Gauge
  },
  {
    id: 'silence-xml',
    title: 'Auto-Cut Awkward Pauses',
    badge: 'Premiere / Resolve XML + MP4',
    desc: 'Finds silent pauses in talking videos and gives you both an editable Premiere/Resolve timeline and a finished jump-cut video.',
    icon: Scissors
  },
  {
    id: 'prores-proxy',
    title: 'Make Smooth Editing Proxy',
    badge: '1080p Apple ProRes (.mov)',
    desc: 'Converts heavy, laggy 4K or drone footage into a smooth 1080p ProRes file that scrubs without lag in your editor.',
    icon: Film
  }
];

const PLATFORM_OPTIONS = [
  { value: 'ig-reels', label: 'IG Reels' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'yt-shorts', label: 'YouTube Shorts' }
];

const FPS_OPTIONS = [
  { value: 'keep', label: 'Source FPS' },
  { value: '30', label: '30 fps' },
  { value: '60', label: '60 fps' }
];

const SHARPEN_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'crisp', label: 'Crisp' }
];

const DEFLICKER_WINDOW_OPTIONS = [
  { value: '5', label: '5 frames (Light)' },
  { value: '7', label: '7 frames (Balanced)' },
  { value: '11', label: '11 frames (Strong)' }
];

const TARGET_SIZE_OPTIONS = [8, 10, 25, 50, 100].map((mb) => ({
  value: String(mb),
  label: `${mb} MB`
}));

const SILENCE_DB_OPTIONS = [-25, -30, -35, -40].map((db) => ({
  value: String(db),
  label: `${db} dB`
}));

const SILENCE_DUR_OPTIONS = [0.3, 0.5, 0.8].map((sec) => ({
  value: String(sec),
  label: `${sec}s`
}));

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
  const isFixingBatch = useJobStore((s) => s.isFixingBatch);
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

  const hasNvenc = Boolean(diagnostics?.hardware.hasNvenc);
  const completedVideoPaths = jobs
    .filter(
      (j) =>
        j.stage === 'completed' &&
        j.outputFilePath &&
        /\.(mp4|mov|mkv|webm)$/i.test(j.outputFilePath)
    )
    .map((j) => j.outputFilePath!);

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
    <VStack gap={6}>
      {/* Header */}
      <HStack vAlign="center" hAlign="between" gap={3} wrap="wrap">
        <HStack vAlign="center" gap={2}>
          <Heading level={3}>Video Quick Fixes & Reels Prep</Heading>
          <Badge variant="info" label="Active" />
        </HStack>

        <HStack vAlign="center" gap={2}>
          {completedVideoPaths.length > 0 && (
            <Button
              label="Use latest downloaded video"
              variant="secondary"
              size="sm"
              tooltip="Stage the most recent video clip from the queue"
              icon={<Sparkles className="w-3 h-3 text-info" />}
              onClick={() => stageLocalVideoPaths([completedVideoPaths[0]])}
            />
          )}
          <Badge
            variant="neutral"
            label={hasNvenc ? 'NVIDIA NVENC ready' : 'CPU libx264 ready'}
          />
        </HStack>
      </HStack>

      {/* Dropzone & Staged Local Videos */}
      <MediaDropzone
        title="Drop one or more videos here, or click Select videos"
        subtitle="Pick a quick-fix tool below and drag the finished video right into your editing timeline."
        buttonLabel="Select videos"
        loadingLabel="Loading..."
        isProbing={isProbing}
        onBrowse={browseAndStageLocalVideos}
        onDropPaths={stageLocalVideoPaths}
        stagedCount={stagedLocalVideos.length}
        stagedHeading="Selected videos"
        onClearAll={clearStagedLocalVideos}
      >
        {stagedLocalVideos.map((vid) => (
          <div
            key={vid.filePath}
            className="px-3.5 py-2.5 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FileVideo className="w-4 h-4 text-info shrink-0" />
              <div className="min-w-0">
                <Text size="sm" weight="medium" color="primary" maxLines={1}>
                  {vid.fileName}
                </Text>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-secondary num mt-0.5">
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

            <IconButton
              label={`Remove ${vid.fileName}`}
              variant="ghost"
              size="sm"
              icon={<X className="w-3.5 h-3.5" />}
              onClick={() => removeStagedLocalVideo(vid.filePath)}
            />
          </div>
        ))}
      </MediaDropzone>

      {fixerError && <Banner status="error" title={fixerError} role="alert" />}

      {/* 5 Selectable Fixer Preset Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FIXER_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isSelected = selectedFixerPreset === preset.id;
          return (
            <ClickableCard
              key={preset.id}
              label={preset.title}
              padding={3}
              variant={isSelected ? 'default' : 'muted'}
              onClick={() => setSelectedFixerPreset(preset.id)}
              className={
                isSelected ? 'ring-2 ring-info bg-surface' : 'border border-border'
              }
            >
              <HStack vAlign="center" hAlign="between" gap={3}>
                <HStack vAlign="center" gap={3} className="min-w-0 flex-1">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-info' : 'text-secondary'
                    }`}
                  />
                  <VStack gap={0.5} className="min-w-0 flex-1">
                    <HStack vAlign="center" gap={2}>
                      <Text size="sm" weight="semibold" color="primary" maxLines={1}>
                        {preset.title}
                      </Text>
                      {isSelected && <Badge variant="info" label="Selected" />}
                    </HStack>
                    <Text size="sm" color="secondary" maxLines={1} className="num">
                      {preset.badge}
                    </Text>
                  </VStack>
                </HStack>

                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <InfoTip
                    label={`Details for ${preset.title}`}
                    size="xsm"
                    content={preset.desc}
                  />
                </div>
              </HStack>
            </ClickableCard>
          );
        })}
      </div>

      {/* Preset Parameter Controls & Execute Bar */}
      <Card padding={4} className="bg-surface">
        <VStack gap={4}>
          {selectedFixerPreset === 'reel-optimizer' && (
            <VStack gap={3}>
              <div className="flex flex-wrap items-end gap-3">
                <Selector
                  label="Platform"
                  size="sm"
                  width={150}
                  value={reelPlatform}
                  onChange={(val) =>
                    setReelPlatform(val as 'ig-reels' | 'tiktok' | 'yt-shorts')
                  }
                  options={PLATFORM_OPTIONS}
                />

                <Selector
                  label="Target FPS"
                  size="sm"
                  width={135}
                  value={reelTargetFps}
                  onChange={(val) => setReelTargetFps(val as 'keep' | '30' | '60')}
                  options={FPS_OPTIONS}
                />

                <Selector
                  label="Pre-Sharpen"
                  size="sm"
                  width={130}
                  value={reelPreSharpen}
                  onChange={(val) =>
                    setReelPreSharpen(val as 'none' | 'subtle' | 'crisp')
                  }
                  options={SHARPEN_OPTIONS}
                />
              </div>

              <HStack vAlign="center" gap={4} wrap="wrap">
                <Switch
                  label="Grain Saver"
                  labelTooltip="Reduces high-frequency noise that causes macroblocking under platform compression"
                  size="sm"
                  value={reelDenoiseGrain}
                  onChange={(checked) => setReelDenoiseGrain(checked)}
                />
                <Switch
                  label="Rec.709 Lock"
                  labelTooltip="Tags bt709 primaries and TV range to prevent washed-out colors on mobile. For SDR sources only."
                  size="sm"
                  value={reelColorFixRec709}
                  onChange={(checked) => setReelColorFixRec709(checked)}
                />
                <Switch
                  label="IG Simulation"
                  labelTooltip="Simulates constrained 3.5Mbps platform re-compression and calculates VMAF retention lift"
                  size="sm"
                  value={reelSimulateIgCompression}
                  onChange={(checked) => setReelSimulateIgCompression(checked)}
                />
              </HStack>
            </VStack>
          )}

          {selectedFixerPreset === 'deflicker' && (
            <Selector
              label="Smoothing strength"
              size="sm"
              width={200}
              value={String(deflickerWindow)}
              onChange={(val) => setDeflickerWindow(Number(val))}
              options={DEFLICKER_WINDOW_OPTIONS}
            />
          )}

          {selectedFixerPreset === 'target-size' && (
            <HStack vAlign="end" gap={4} wrap="wrap">
              <Selector
                label="Target file size cap"
                size="sm"
                width={150}
                value={String(targetSizeMB)}
                onChange={(val) => setTargetSizeMB(Number(val))}
                options={TARGET_SIZE_OPTIONS}
              />

              {estimatedKbps !== null && (
                <VStack gap={1}>
                  <Text size="sm" weight="medium" color="secondary">
                    Target quality
                  </Text>
                  <Badge variant="neutral" label={`${estimatedKbps} kbps + 128k AAC`} />
                </VStack>
              )}
            </HStack>
          )}

          {selectedFixerPreset === 'silence-xml' && (
            <HStack vAlign="end" gap={3} wrap="wrap">
              <Selector
                label="Silence threshold"
                size="sm"
                width={150}
                value={String(silenceThresholdDb)}
                onChange={(val) => setSilenceThresholdDb(Number(val))}
                options={SILENCE_DB_OPTIONS}
              />

              <Selector
                label="Min pause duration"
                size="sm"
                width={150}
                value={String(silenceMinDuration)}
                onChange={(val) => setSilenceMinDuration(Number(val))}
                options={SILENCE_DUR_OPTIONS}
              />
            </HStack>
          )}

          {selectedFixerPreset === 'prores-proxy' && (
            <VStack gap={0.5}>
              <Text size="sm" weight="medium" color="primary">
                1080p Apple ProRes 422 Proxy (<Code size="inherit">prores_ks -profile:v 0</Code>)
              </Text>
              <Text type="supporting" size="sm" color="secondary">
                Outputs constant-frame-rate <Code size="inherit">yuv422p10le .mov</Code> with
                uncompressed 48kHz 16-bit PCM stereo audio.
              </Text>
            </VStack>
          )}

          <Divider />

          {/* Save Folder, Hardware Encoder Toggle & Execute CTA */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {selectedFixerPreset !== 'prores-proxy' && (
                <Switch
                  label={hasNvenc ? 'NVENC GPU' : 'Hardware'}
                  labelIcon={<Cpu className="w-3.5 h-3.5 text-secondary" />}
                  labelTooltip={
                    selectedFixerPreset === 'reel-optimizer'
                      ? useHardwareEncoder
                        ? 'NVENC GPU active. Turn off for maximum quality tuned libx264 CPU encode.'
                        : 'Maximum quality tuned libx264 CPU encode active. Turn on for faster NVENC GPU encode.'
                      : undefined
                  }
                  size="sm"
                  value={useHardwareEncoder}
                  onChange={(checked) => setUseHardwareEncoder(checked)}
                />
              )}
            </div>

            <HStack vAlign="center" gap={2}>
              <OutputFolderButton />
              <Button
                label={
                  isFixingBatch
                    ? 'Processing Batch...'
                    : `Fix Video${stagedLocalVideos.length > 0 ? ` (${stagedLocalVideos.length})` : ''}`
                }
                variant="primary"
                size="sm"
                isLoading={isFixingBatch}
                isDisabled={stagedLocalVideos.length === 0 || isFixingBatch}
                icon={<Play className="w-3.5 h-3.5" />}
                onClick={enqueueAndRunFixerJobs}
              />
            </HStack>
          </div>
        </VStack>
      </Card>

      {/* Shared Queue & Native OS Drag-to-Timeline Pills */}
      <JobQueueList />
    </VStack>
  );
};
