import React from 'react';
import {
  Clock,
  Download,
  Scissors,
  Sliders,
  User,
  X
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { IconButton } from '@astryxdesign/core/IconButton';
import { InfoTip } from '@astryxdesign/core/InfoTip';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useJobStore } from '../../store/useJobStore';
import { OutputFolderButton } from '../shared/OutputFolderButton';
import { TimeRangeSlider, formatMmSsMs } from './TimeRangeSlider';
import type { QualityPreset, StemMode } from '../../types/media';

const STEM_OPTIONS: Array<{ value: StemMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: '2-stem', label: 'Vocals + Instrumental' },
  { value: '4-stem', label: 'Vocals, Drums, Bass, Other' }
];

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
  const clearStagedMedia = useJobStore((s) => s.clearStagedMedia);
  const enqueueAndRunStagedJob = useJobStore((s) => s.enqueueAndRunStagedJob);

  if (!stagedMedia) {
    return null;
  }

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

  const qualityOptions = stagedMedia.availableQualities.map((q) => {
    const codec = editReadyMode ? (q.isAudioOnly ? 'WAV' : 'MP4') : q.codecBadge;
    return {
      value: q.id,
      label: `${q.label} (${codec})`
    };
  });

  return (
    <Card padding={4} className="bg-surface">
      <VStack gap={4}>
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          <div className="flex gap-3.5 min-w-0">
            <div className="relative w-36 h-20 rounded-md overflow-hidden bg-muted border border-border shrink-0">
              <img
                src={stagedMedia.thumbnail}
                alt={stagedMedia.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1.5 right-1.5">
                <Badge variant="neutral" label={formatMmSsMs(stagedMedia.duration)} />
              </div>
            </div>

            <div className="flex flex-col justify-between min-w-0 py-0.5 gap-1">
              <HStack vAlign="center" gap={2} wrap="wrap">
                <Badge variant="info" label={stagedMedia.platform} />
                {stagedMedia.isSimulatedProbe && (
                  <Badge variant="warning" label="Preview mode" />
                )}
                <HStack vAlign="center" gap={1} className="min-w-0">
                  <User className="w-3 h-3 text-secondary shrink-0" />
                  <Text size="sm" color="secondary" maxLines={1}>
                    {stagedMedia.uploader}
                  </Text>
                </HStack>
              </HStack>

              <Text size="sm" weight="semibold" color="primary" maxLines={1}>
                {stagedMedia.title}
              </Text>

              <HStack vAlign="center" gap={1.5}>
                <Clock className="w-3.5 h-3.5 text-info shrink-0" />
                <Text size="sm" color="secondary">
                  Saves as:{' '}
                  <strong className="text-primary font-medium num">{formatSummary}</strong>
                </Text>
                <InfoTip
                  label="Format info"
                  size="xsm"
                  content="Automatically saves videos as standard MP4 and audio as WAV so they drop right into Premiere, Resolve, or FL Studio without lag."
                />
              </HStack>
            </div>
          </div>

          {/* Quality Selector + Close Button */}
          <HStack vAlign="start" gap={1.5} className="shrink-0">
            <Selector
              label="Choose quality"
              isLabelHidden
              size="sm"
              width={215}
              value={selectedQuality}
              onChange={(val) => setSelectedQuality(val as QualityPreset)}
              options={qualityOptions}
            />

            <IconButton
              label="Clear staged media"
              variant="ghost"
              size="sm"
              icon={<X className="w-4 h-4" />}
              onClick={clearStagedMedia}
            />
          </HStack>
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
          <HStack vAlign="center" gap={2} wrap="wrap">
            <HStack vAlign="center" gap={1.5}>
              <Sliders className="w-3.5 h-3.5 text-info" />
              <Text size="sm" weight="medium" color="secondary">
                Split audio stems:
              </Text>
            </HStack>

            <Selector
              label="Split audio stems"
              isLabelHidden
              size="sm"
              width={220}
              value={stemMode}
              onChange={(val) => setStemMode(val as StemMode)}
              options={STEM_OPTIONS}
            />
          </HStack>

          <HStack vAlign="center" gap={2}>
            <OutputFolderButton />

            <Button
              label={downloadButtonLabel}
              variant="primary"
              size="sm"
              icon={trimEnabled ? <Scissors className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              onClick={enqueueAndRunStagedJob}
            />
          </HStack>
        </div>
      </VStack>
    </Card>
  );
};
