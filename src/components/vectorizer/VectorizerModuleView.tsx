import React from 'react';
import {
  Eraser,
  GripVertical,
  Image as ImageIcon,
  Maximize2,
  PenTool,
  Play,
  X
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Code } from '@astryxdesign/core/Code';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { InfoTip } from '@astryxdesign/core/InfoTip';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useJobStore } from '../../store/useJobStore';
import type { VectorPresetId } from '../../types/media';
import { JobQueueList } from '../ripper/JobQueueList';
import { MediaDropzone } from '../shared/MediaDropzone';
import { OutputFolderButton } from '../shared/OutputFolderButton';

const VECTOR_TOOLS: Array<{
  id: VectorPresetId;
  title: string;
  badge: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'vtracer',
    title: 'Turn Image into Vector (SVG)',
    badge: 'Clean scalable shapes',
    desc: 'Turns flat PNG/JPG logos, icons, and sketches into editable SVG vector shapes for Illustrator, Figma, or After Effects.',
    icon: PenTool
  },
  {
    id: 'rmbg',
    title: 'Remove Background',
    badge: 'Transparent PNG cutout',
    desc: 'Automatically cuts out people, products, or logos onto a clean transparent background in about a second.',
    icon: Eraser
  },
  {
    id: 'esrgan',
    title: 'AI Image Upscaler (2x / 4x)',
    badge: 'Sharpen & boost resolution',
    desc: 'Enlarges small or blurry images up to 4x their original size while keeping edges and transparency sharp.',
    icon: Maximize2
  }
];

const COLOR_MODE_OPTIONS = [
  { value: 'color', label: 'Multi-Color' },
  { value: 'binary', label: 'Mono Ink' }
];

const DETAIL_OPTIONS = [
  { value: 'low', label: 'Clean (Low)' },
  { value: 'medium', label: 'Balanced' },
  { value: 'high', label: 'Fine Detail' }
];

const TOLERANCE_OPTIONS = [
  { value: '12', label: '12% Tight' },
  { value: '24', label: '24% Studio' },
  { value: '38', label: '38% Wide' }
];

const UPSCALE_OPTIONS = [
  { value: '2', label: '2x Scale' },
  { value: '4', label: '4x Ultra' }
];

export const VectorizerModuleView: React.FC = () => {
  const stagedLocalImages = useJobStore((s) => s.stagedLocalImages);
  const selectedVectorPreset = useJobStore((s) => s.selectedVectorPreset);
  const vectorColorMode = useJobStore((s) => s.vectorColorMode);
  const vectorDetailLevel = useJobStore((s) => s.vectorDetailLevel);
  const matteTolerance = useJobStore((s) => s.matteTolerance);
  const upscaleFactor = useJobStore((s) => s.upscaleFactor);
  const vectorError = useJobStore((s) => s.vectorError);
  const isProbing = useJobStore((s) => s.isProbing);
  const isVectorBatch = useJobStore((s) => s.isVectorBatch);
  const lastVectorPreview = useJobStore((s) => s.lastVectorPreview);

  const setSelectedVectorPreset = useJobStore((s) => s.setSelectedVectorPreset);
  const setVectorColorMode = useJobStore((s) => s.setVectorColorMode);
  const setVectorDetailLevel = useJobStore((s) => s.setVectorDetailLevel);
  const setMatteTolerance = useJobStore((s) => s.setMatteTolerance);
  const setUpscaleFactor = useJobStore((s) => s.setUpscaleFactor);
  const browseAndStageLocalImages = useJobStore((s) => s.browseAndStageLocalImages);
  const stageLocalImagePaths = useJobStore((s) => s.stageLocalImagePaths);
  const removeStagedLocalImage = useJobStore((s) => s.removeStagedLocalImage);
  const clearStagedLocalImages = useJobStore((s) => s.clearStagedLocalImages);
  const enqueueAndRunVectorJobs = useJobStore((s) => s.enqueueAndRunVectorJobs);

  const primaryImage = stagedLocalImages[0];

  return (
    <VStack gap={6}>
      {/* Header */}
      <HStack vAlign="center" hAlign="between" gap={3} wrap="wrap">
        <HStack vAlign="center" gap={2}>
          <Heading level={3}>Image Cutout, Upscale & Vector Tools</Heading>
          <Badge variant="info" label="Active" />
        </HStack>
        <Badge variant="neutral" label="SVG / 32-bit RGBA / 4x PNG" />
      </HStack>

      {/* Dropzone & Staged Images */}
      <MediaDropzone
        title="Drop PNG, JPG, or WEBP images here, or click Select images"
        subtitle={
          <>
            Outputs draggable <Code size="inherit">Vector_Trace.svg</Code>,{' '}
            <Code size="inherit">Alpha_Matte.png</Code>, and{' '}
            <Code size="inherit">Upscaled_4x.png</Code> pills.
          </>
        }
        buttonLabel="Select images"
        loadingLabel="Probing..."
        isProbing={isProbing}
        onBrowse={browseAndStageLocalImages}
        onDropPaths={stageLocalImagePaths}
        stagedCount={stagedLocalImages.length}
        stagedHeading="Staged image assets"
        onClearAll={clearStagedLocalImages}
      >
        {stagedLocalImages.map((img) => {
          const thumbUrl = `vortex-media://local/${encodeURIComponent(img.filePath)}`;
          return (
            <div
              key={img.filePath}
              className="px-3.5 py-2.5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={thumbUrl}
                  alt={img.fileName}
                  className="w-9 h-9 rounded-sm object-cover bg-muted border border-border shrink-0"
                />
                <div className="min-w-0">
                  <Text size="sm" weight="medium" color="primary" maxLines={1}>
                    {img.fileName}
                  </Text>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-secondary num mt-0.5">
                    <span>
                      {img.width}×{img.height}
                    </span>
                    <span>·</span>
                    <span>{img.format}</span>
                    <span>·</span>
                    <span>{img.fileSizeKB} KB</span>
                  </div>
                </div>
              </div>

              <IconButton
                label={`Remove ${img.fileName}`}
                variant="ghost"
                size="sm"
                icon={<X className="w-3.5 h-3.5" />}
                onClick={() => removeStagedLocalImage(img.filePath)}
              />
            </div>
          );
        })}
      </MediaDropzone>

      {vectorError && <Banner status="error" title={vectorError} role="alert" />}

      {/* 3 Selectable Tool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {VECTOR_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isSelected = selectedVectorPreset === tool.id;
          return (
            <ClickableCard
              key={tool.id}
              label={tool.title}
              padding={3}
              variant={isSelected ? 'default' : 'muted'}
              onClick={() => setSelectedVectorPreset(tool.id)}
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
                    <Text size="sm" weight="semibold" color="primary" maxLines={1}>
                      {tool.title}
                    </Text>
                    <Text size="sm" color="secondary" maxLines={1} className="num">
                      {tool.badge}
                    </Text>
                  </VStack>
                </HStack>

                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <InfoTip
                    label={`Details for ${tool.title}`}
                    size="xsm"
                    content={tool.desc}
                  />
                </div>
              </HStack>
            </ClickableCard>
          );
        })}
      </div>

      {/* Parameter Strip & Execute Button */}
      <Card padding={4} className="bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-4">
          {selectedVectorPreset === 'vtracer' && (
            <div className="flex flex-wrap items-end gap-3">
              <Selector
                label="Color mode"
                size="sm"
                width={150}
                value={vectorColorMode}
                onChange={(val) => setVectorColorMode(val as 'color' | 'binary')}
                options={COLOR_MODE_OPTIONS}
              />

              <Selector
                label="Detail level"
                size="sm"
                width={150}
                value={vectorDetailLevel}
                onChange={(val) =>
                  setVectorDetailLevel(val as 'low' | 'medium' | 'high')
                }
                options={DETAIL_OPTIONS}
              />
            </div>
          )}

          {selectedVectorPreset === 'rmbg' && (
            <Selector
              label="Edge softness"
              size="sm"
              width={160}
              value={String(matteTolerance)}
              onChange={(val) => setMatteTolerance(Number(val))}
              options={TOLERANCE_OPTIONS}
            />
          )}

          {selectedVectorPreset === 'esrgan' && (
            <div className="flex flex-wrap items-end gap-4">
              <Selector
                label="Upscale factor"
                size="sm"
                width={140}
                value={String(upscaleFactor)}
                onChange={(val) => setUpscaleFactor(Number(val) as 2 | 4)}
                options={UPSCALE_OPTIONS}
              />

              {primaryImage && (
                <VStack gap={1}>
                  <Text size="sm" weight="medium" color="secondary">
                    Target output dimensions
                  </Text>
                  <Badge
                    variant="neutral"
                    label={`${primaryImage.width * upscaleFactor}×${
                      primaryImage.height * upscaleFactor
                    } px`}
                  />
                </VStack>
              )}
            </div>
          )}

          <HStack vAlign="center" gap={2} className="shrink-0">
            <OutputFolderButton />
            <Button
              label={
                isVectorBatch
                  ? 'Processing Batch...'
                  : `Process Image${stagedLocalImages.length > 0 ? ` (${stagedLocalImages.length})` : ''}`
              }
              variant="primary"
              size="sm"
              isLoading={isVectorBatch}
              isDisabled={stagedLocalImages.length === 0 || isVectorBatch}
              icon={<Play className="w-3.5 h-3.5" />}
              onClick={enqueueAndRunVectorJobs}
            />
          </HStack>
        </div>
      </Card>

      {/* Before / After Visual Inspector Card */}
      {lastVectorPreview && (
        <Card padding={4} className="bg-surface">
          <VStack gap={3}>
            <HStack vAlign="center" hAlign="between" gap={3} wrap="wrap">
              <HStack vAlign="center" gap={2}>
                <ImageIcon className="w-4 h-4 text-info" />
                <Text size="sm" weight="semibold" color="primary">
                  Before / After Visual Inspector
                </Text>
              </HStack>

              <div
                draggable={true}
                onDragStart={(e) => {
                  e.preventDefault();
                  window.vortexApi?.startNativeDrag(lastVectorPreview.outputPath);
                }}
                className="native-drag-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-info/50 bg-info-muted/30 hover:bg-info-muted/50 text-xs text-primary cursor-grab active:cursor-grabbing transition-colors num"
                title="Drag processed output directly into Illustrator, Figma, After Effects, or Explorer"
              >
                <GripVertical className="w-3 h-3 text-secondary pointer-events-none" />
                <span className="pointer-events-none">Drag result to canvas</span>
              </div>
            </HStack>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card padding={3} className="bg-body">
                <VStack gap={2}>
                  <Badge variant="neutral" label="Original source" />
                  <div className="h-44 flex items-center justify-center overflow-hidden rounded-sm bg-muted">
                    <img
                      src={`vortex-media://local/${encodeURIComponent(lastVectorPreview.sourcePath)}`}
                      alt="Source asset"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </VStack>
              </Card>

              <Card padding={3} className="bg-body">
                <VStack gap={2}>
                  <Badge
                    variant="info"
                    label={
                      lastVectorPreview.preset === 'vtracer'
                        ? 'SVG Vector Output'
                        : lastVectorPreview.preset === 'rmbg'
                          ? '32-bit Alpha Matte'
                          : 'Upscaled Master'
                    }
                  />
                  <div className="h-44 flex items-center justify-center overflow-hidden rounded-sm bg-checkerboard">
                    <img
                      src={`vortex-media://local/${encodeURIComponent(lastVectorPreview.outputPath)}`}
                      alt="Processed output"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </VStack>
              </Card>
            </div>
          </VStack>
        </Card>
      )}

      {/* Shared Queue & Native OS Drag-to-Timeline Pills */}
      <JobQueueList />
    </VStack>
  );
};
