import React, { useState } from 'react';
import {
  Eraser,
  FolderPlus,
  GripVertical,
  Image as ImageIcon,
  Info,
  Maximize2,
  PenTool,
  Play,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import { useJobStore } from '../../store/useJobStore';
import type { VectorPresetId } from '../../types/media';
import { JobQueueList } from '../ripper/JobQueueList';

const VECTOR_TOOLS: Array<{
  id: VectorPresetId;
  title: string;
  badge: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'vtracer',
    title: 'Raster-to-SVG Vectorizer',
    badge: 'vtracer 0.6.15 (Rust Spline)',
    desc: 'Converts flat logos, icons, sketches, and typography into clean, editable SVG Bézier spline geometry for Illustrator, Figma, and After Effects.',
    icon: PenTool
  },
  {
    id: 'rmbg',
    title: 'Studio Background Remover',
    badge: 'rembg 2.0 (U2Net ONNX)',
    desc: 'Extracts subjects from complex outdoor, portrait, and product photos into a 32-bit transparent PNG alpha matte using U2Net ONNX segmentation.',
    icon: Eraser
  },
  {
    id: 'esrgan',
    title: 'Super-Resolution Asset Upscaler',
    badge: 'Real-ESRGAN x4plus (CUDA)',
    desc: 'Restores low-resolution textures, UI assets, and archival stills at 2x or 4x resolution using Real-ESRGAN neural weights on GPU.',
    icon: Maximize2
  }
];

const DETAIL_OPTIONS: Array<{ id: 'low' | 'medium' | 'high'; label: string }> = [
  { id: 'low', label: 'Clean (Low)' },
  { id: 'medium', label: 'Balanced' },
  { id: 'high', label: 'Fine Detail' }
];

const TOLERANCE_OPTIONS: Array<{ val: number; label: string }> = [
  { val: 12, label: '12% Tight' },
  { val: 24, label: '24% Studio' },
  { val: 38, label: '38% Wide' }
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

  const [isDragOver, setIsDragOver] = useState(false);

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
      await stageLocalImagePaths(paths);
    }
  };

  const primaryImage = stagedLocalImages[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-base-content">
            Vectorizer, Background & Upscale Dock
          </h2>
          <span className="badge badge-xs badge-accent">Active</span>
        </div>
        <span className="badge badge-xs badge-ghost num">
          SVG / 32-bit RGBA / 4x PNG
        </span>
      </div>

      {/* Dropzone & Asset Picker */}
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
                Drop PNG, JPG, or WEBP assets for local vectorization, alpha matting & upscaling
              </p>
              <p className="text-xs text-base-content/60 mt-0.5">
                Outputs draggable <code className="num text-base-content">Vector_Trace.svg</code>, <code className="num text-base-content">Alpha_Matte.png</code>, and <code className="num text-base-content">Upscaled_4x.png</code> pills.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isProbing}
            onClick={browseAndStageLocalImages}
            className="btn btn-sm btn-primary gap-1.5 shrink-0"
          >
            {isProbing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <FolderPlus className="w-4 h-4" />
            )}
            <span>{isProbing ? 'Probing...' : 'Select images'}</span>
          </button>
        </div>

        {/* Staged Image Assets List */}
        {stagedLocalImages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-base-300 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-base-content/70">
                Staged image assets ({stagedLocalImages.length})
              </span>
              <button
                type="button"
                onClick={clearStagedLocalImages}
                className="btn btn-ghost btn-xs text-base-content/60 hover:text-error gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear all</span>
              </button>
            </div>

            <div className="divide-y divide-base-300 border border-base-300 rounded-lg bg-base-100">
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
                        className="w-9 h-9 rounded object-cover bg-base-300 border border-base-300 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-base-content truncate">
                          {img.fileName}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-base-content/60 num mt-0.5">
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

                    <button
                      type="button"
                      onClick={() => removeStagedLocalImage(img.filePath)}
                      className="btn btn-ghost btn-xs btn-square text-base-content/50 hover:text-error shrink-0"
                      title="Remove asset"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {vectorError && (
        <div role="alert" className="alert alert-error py-2 px-3 text-xs">
          <span>{vectorError}</span>
        </div>
      )}

      {/* 3 Selectable Tool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {VECTOR_TOOLS.map((tool, idx) => {
          const Icon = tool.icon;
          const isSelected = selectedVectorPreset === tool.id;
          // Prevent leftmost tooltip from clipping under the left sidebar rail
          const tooltipDir = idx === 0 ? 'tooltip-top' : idx === 1 ? 'tooltip-top' : 'tooltip-left';
          return (
            <div
              key={tool.id}
              onClick={() => setSelectedVectorPreset(tool.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedVectorPreset(tool.id);
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
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-semibold text-base-content truncate">
                      {tool.title}
                    </h3>
                  </div>
                  <span className="text-xs text-base-content/50 block truncate mt-0.5 num">
                    {tool.badge}
                  </span>
                </div>
              </div>

              <div
                className={`tooltip ${tooltipDir} shrink-0`}
                data-tip={tool.desc}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  aria-label={`Details for ${tool.title}`}
                  className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Parameter Strip & Execute Button */}
      <div className="card bg-base-200 border border-base-300 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {selectedVectorPreset === 'vtracer' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Color mode
                </span>
                <div className="join">
                  <button
                    type="button"
                    onClick={() => setVectorColorMode('color')}
                    className={`btn btn-xs join-item ${
                      vectorColorMode === 'color' ? 'btn-primary' : 'btn-outline'
                    }`}
                  >
                    Multi-Color
                  </button>
                  <button
                    type="button"
                    onClick={() => setVectorColorMode('binary')}
                    className={`btn btn-xs join-item ${
                      vectorColorMode === 'binary' ? 'btn-primary' : 'btn-outline'
                    }`}
                  >
                    Mono Ink
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Path fidelity
                </span>
                <div className="join">
                  {DETAIL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setVectorDetailLevel(opt.id)}
                      className={`btn btn-xs join-item ${
                        vectorDetailLevel === opt.id ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedVectorPreset === 'rmbg' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Backdrop keying tolerance
                </span>
                <div className="join">
                  {TOLERANCE_OPTIONS.map((t) => (
                    <button
                      key={t.val}
                      type="button"
                      onClick={() => setMatteTolerance(t.val)}
                      className={`btn btn-xs join-item num ${
                        matteTolerance === t.val ? 'btn-primary' : 'btn-outline'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedVectorPreset === 'esrgan' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-base-content/70 block">
                  Upscale factor
                </span>
                <div className="join">
                  <button
                    type="button"
                    onClick={() => setUpscaleFactor(2)}
                    className={`btn btn-xs join-item num ${
                      upscaleFactor === 2 ? 'btn-primary' : 'btn-outline'
                    }`}
                  >
                    2x Scale
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpscaleFactor(4)}
                    className={`btn btn-xs join-item num ${
                      upscaleFactor === 4 ? 'btn-primary' : 'btn-outline'
                    }`}
                  >
                    4x Ultra
                  </button>
                </div>
              </div>

              {primaryImage && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-base-content/70 block">
                    Target output dimensions
                  </span>
                  <span className="badge badge-sm badge-neutral num">
                    {primaryImage.width * upscaleFactor}×{primaryImage.height * upscaleFactor} px
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={stagedLocalImages.length === 0}
            onClick={enqueueAndRunVectorJobs}
            className="btn btn-sm btn-primary gap-1.5 shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>
              Process Asset{stagedLocalImages.length > 0 ? ` (${stagedLocalImages.length})` : ''}
            </span>
          </button>
        </div>
      </div>

      {/* Before / After Visual Inspector Card */}
      {lastVectorPreview && (
        <div className="card bg-base-200 border border-base-300 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-base-content">
                Before / After Visual Inspector
              </span>
            </div>

            <div
              draggable
              onDragStart={(e) => {
                e.preventDefault();
                window.vortexApi?.startNativeDrag(lastVectorPreview.outputPath);
              }}
              className="btn btn-xs btn-outline gap-1.5 cursor-grab active:cursor-grabbing num"
              title="Drag processed output directly into Illustrator, Figma, After Effects, or Explorer"
            >
              <GripVertical className="w-3 h-3 opacity-60" />
              <span>Drag result to canvas</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-base-300 bg-base-100 p-3 space-y-2">
              <span className="badge badge-xs badge-ghost">Original source</span>
              <div className="h-44 flex items-center justify-center overflow-hidden rounded bg-base-300/40">
                <img
                  src={`vortex-media://local/${encodeURIComponent(lastVectorPreview.sourcePath)}`}
                  alt="Source asset"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>

            <div className="rounded-lg border border-base-300 bg-base-100 p-3 space-y-2">
              <span className="badge badge-xs badge-accent">
                {lastVectorPreview.preset === 'vtracer'
                  ? 'SVG Vector Output'
                  : lastVectorPreview.preset === 'rmbg'
                    ? '32-bit Alpha Matte'
                    : 'Upscaled Master'}
              </span>
              <div className="h-44 flex items-center justify-center overflow-hidden rounded bg-checkerboard">
                <img
                  src={`vortex-media://local/${encodeURIComponent(lastVectorPreview.outputPath)}`}
                  alt="Processed output"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shared Queue & Native OS Drag-to-Timeline Pills */}
      <JobQueueList />
    </div>
  );
};
