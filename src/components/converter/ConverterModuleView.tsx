import React from 'react';
import {
  Cpu,
  FileAudio,
  FileVideo,
  Play,
  Sparkles,
  X,
  Zap
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { useJobStore } from '../../store/useJobStore';
import type { ConverterTargetFormat } from '../../types/media';
import { JobQueueList } from '../ripper/JobQueueList';
import { MediaDropzone } from '../shared/MediaDropzone';
import { OutputFolderButton } from '../shared/OutputFolderButton';

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

const SAMPLE_RATE_OPTIONS = [
  { value: '48000', label: '48 kHz (NLE)' },
  { value: '44100', label: '44.1 kHz' }
];

const AUDIO_TO_VIDEO_OPTIONS = [
  { value: 'waveform', label: 'Live Waveform' },
  { value: 'slate', label: 'Studio Black Slate' }
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

  const hasNvenc = Boolean(diagnostics?.hardware.hasNvenc);
  const isAudioTarget = ['wav', 'mp3', 'flac', 'm4a', 'ogg'].includes(converterTargetFormat);
  const hasStagedAudio = stagedConverterMedia.some((m) => m.mediaType === 'audio');
  const isAudioToVideoActive = hasStagedAudio && !isAudioTarget && converterTargetFormat !== 'gif';

  const activeTargetInfo =
    [...VIDEO_TARGETS, ...AUDIO_TARGETS].find((t) => t.id === converterTargetFormat) ||
    VIDEO_TARGETS[0];

  const targetFormatOptions = [
    {
      type: 'section' as const,
      title: 'Video & Animation Containers',
      options: VIDEO_TARGETS.map((fmt) => ({
        value: fmt.id,
        label: `.${fmt.label} — ${fmt.desc}`,
        disabled: fmt.id === 'gif' && hasStagedAudio
      }))
    },
    {
      type: 'section' as const,
      title: 'Studio Audio Formats',
      options: AUDIO_TARGETS.map((fmt) => ({
        value: fmt.id,
        label: `.${fmt.label} — ${fmt.desc}`
      }))
    }
  ];

  return (
    <VStack gap={6}>
      {/* Header */}
      <HStack vAlign="center" hAlign="between" gap={3} wrap="wrap">
        <HStack vAlign="center" gap={2}>
          <Heading level={3}>Video & Audio Format Converter</Heading>
          <Badge variant="info" label="4-Way Matrix" />
        </HStack>

        <Badge
          variant="neutral"
          label="Video ↔ Video · Video → Audio · Audio ↔ Audio · Audio → Video"
        />
      </HStack>

      {/* Dropzone & Staged Media */}
      <MediaDropzone
        title="Drop any Video or Audio files (.mp4, .mkv, .mov, .webm, .wav, .mp3, .flac, .ogg, .m4a)"
        subtitle="Convert any video to audio, video to video, or audio to video in one click."
        buttonLabel="Select media"
        loadingLabel="Probing..."
        isProbing={isProbing}
        onBrowse={browseAndStageConverterMedia}
        onDropPaths={stageConverterMediaPaths}
        stagedCount={stagedConverterMedia.length}
        stagedHeading="Staged media files"
        onClearAll={clearStagedConverterMedia}
      >
        {stagedConverterMedia.map((item) => (
          <div
            key={item.filePath}
            className="px-3.5 py-2.5 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {item.mediaType === 'video' ? (
                <FileVideo className="w-4 h-4 text-info shrink-0" />
              ) : (
                <FileAudio className="w-4 h-4 text-success shrink-0" />
              )}
              <div className="min-w-0">
                <HStack vAlign="center" gap={2}>
                  <Text size="sm" weight="medium" color="primary" maxLines={1}>
                    {item.fileName}
                  </Text>
                  <Badge variant="neutral" label={item.mediaType.toUpperCase()} />
                </HStack>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-secondary num mt-0.5">
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

            <IconButton
              label={`Remove ${item.fileName}`}
              variant="ghost"
              size="sm"
              icon={<X className="w-3.5 h-3.5" />}
              onClick={() => removeStagedConverterMedia(item.filePath)}
            />
          </div>
        ))}
      </MediaDropzone>

      {converterError && <Banner status="error" title={converterError} role="alert" />}

      {/* Format Dropdown, Pipeline Parameters & Execute Strip */}
      <Card padding={4} className="bg-surface">
        <VStack gap={4}>
          <div className="flex flex-wrap items-end gap-4">
            <Selector
              label="Target format"
              size="sm"
              width={290}
              value={converterTargetFormat}
              onChange={(val) => setConverterTargetFormat(val as ConverterTargetFormat)}
              options={targetFormatOptions}
            />

            {isAudioTarget && (
              <Selector
                label="Sample rate"
                size="sm"
                width={150}
                value={String(converterSampleRate)}
                onChange={(val) => setConverterSampleRate(Number(val) as 48000 | 44100)}
                options={SAMPLE_RATE_OPTIONS}
              />
            )}

            {isAudioToVideoActive && (
              <Selector
                label="Video background style"
                size="sm"
                width={185}
                value={converterAudioToVideoMode}
                onChange={(val) =>
                  setConverterAudioToVideoMode(val as 'waveform' | 'slate')
                }
                options={AUDIO_TO_VIDEO_OPTIONS}
              />
            )}

            <HStack vAlign="center" gap={3} wrap="wrap" className="pb-1">
              {!isAudioTarget && converterTargetFormat !== 'gif' && (
                <Switch
                  label="Fast Copy (No quality loss)"
                  labelIcon={<Zap className="w-3.5 h-3.5 text-info" />}
                  labelTooltip="Remuxes compatible H.264/HEVC streams directly into the target container (-c copy) in under 1 second."
                  size="sm"
                  value={converterSmartCopy}
                  onChange={(checked) => setConverterSmartCopy(checked)}
                />
              )}

              {isAudioTarget && (
                <Switch
                  label="Even out volume"
                  labelIcon={<Sparkles className="w-3.5 h-3.5 text-info" />}
                  labelTooltip="Normalizes audio loudness to streaming standard -14 LUFS (YouTube / Spotify)"
                  size="sm"
                  value={converterNormalizeLoudness}
                  onChange={(checked) => setConverterNormalizeLoudness(checked)}
                />
              )}
            </HStack>
          </div>

          <Divider />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <HStack vAlign="center" gap={3} wrap="wrap">
              <Badge variant="info" label={`.${activeTargetInfo.label}`} />
              <Text size="sm" color="secondary">
                {activeTargetInfo.desc}
              </Text>

              {!isAudioTarget && converterTargetFormat !== 'gif' && (
                <Switch
                  label={hasNvenc ? 'NVENC GPU' : 'Hardware'}
                  labelIcon={<Cpu className="w-3.5 h-3.5 text-secondary" />}
                  size="sm"
                  value={useHardwareEncoder}
                  onChange={(checked) => setUseHardwareEncoder(checked)}
                />
              )}
            </HStack>

            <HStack vAlign="center" gap={2} className="shrink-0">
              <OutputFolderButton />
              <Button
                label={
                  isConvertingBatch
                    ? 'Converting Batch...'
                    : `Convert to .${converterTargetFormat.toUpperCase()}${
                        stagedConverterMedia.length > 0
                          ? ` (${stagedConverterMedia.length})`
                          : ''
                      }`
                }
                variant="primary"
                size="sm"
                isLoading={isConvertingBatch}
                isDisabled={
                  stagedConverterMedia.length === 0 ||
                  isConvertingBatch ||
                  (hasStagedAudio && converterTargetFormat === 'gif')
                }
                icon={<Play className="w-3.5 h-3.5" />}
                onClick={enqueueAndRunConverterJobs}
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
