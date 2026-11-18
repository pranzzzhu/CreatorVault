import React from 'react';
import {
  ArrowLeftRight,
  Cpu,
  Download,
  Film,
  Minus,
  PenTool,
  Plus,
  Settings,
  Zap
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { ButtonGroup } from '@astryxdesign/core/ButtonGroup';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Divider } from '@astryxdesign/core/Divider';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { useJobStore } from '../../store/useJobStore';
import type { ModuleId } from '../../types/media';

interface NavEntry {
  id: ModuleId;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavEntry[] = [
  {
    id: 'ripper',
    label: 'Download & Clip',
    subtitle: 'Save videos, clips & stems',
    icon: Download
  },
  {
    id: 'fixer',
    label: 'Video Quick Fixes',
    subtitle: 'Reels prep, size & cut pauses',
    icon: Film
  },
  {
    id: 'vectorizer',
    label: 'Image Tools',
    subtitle: 'Remove BG, upscale & SVG',
    icon: PenTool
  },
  {
    id: 'converter',
    label: 'Format Converter',
    subtitle: 'Convert any video or audio',
    icon: ArrowLeftRight
  }
];

export const SidebarRail: React.FC = () => {
  const activeModule = useJobStore((s) => s.activeModule);
  const setActiveModule = useJobStore((s) => s.setActiveModule);
  const diagnostics = useJobStore((s) => s.diagnostics);
  const editReadyMode = useJobStore((s) => s.editReadyMode);
  const setSettingsModalOpen = useJobStore((s) => s.setSettingsModalOpen);
  const zoomFactor = useJobStore((s) => s.zoomFactor);
  const zoomIn = useJobStore((s) => s.zoomIn);
  const zoomOut = useJobStore((s) => s.zoomOut);
  const resetZoom = useJobStore((s) => s.resetZoom);

  const totalCount = diagnostics ? Object.keys(diagnostics.binaries).length : 7;
  const missingCount = diagnostics
    ? Object.values(diagnostics.binaries).filter((b) => !b.available).length
    : 0;

  const hw = diagnostics?.hardware;

  return (
    <aside className="w-64 shrink-0 bg-surface border-r border-border flex flex-col justify-between select-none">
      {/* Top Draggable Brand Header & Navigation */}
      <div>
        <div className="h-12 px-4 flex items-center justify-between border-b border-border app-drag-region">
          <HStack vAlign="center" gap={2}>
            <div className="w-6 h-6 rounded-sm bg-muted border border-border flex items-center justify-center text-primary">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <Text weight="semibold" size="sm" color="primary">
              Vortex
            </Text>
          </HStack>
          <Badge variant="neutral" label="v0.3" />
        </div>

        <div className="p-3 space-y-2">
          <div className="px-2">
            <Text type="supporting" size="sm" weight="medium" color="secondary">
              Workspaces
            </Text>
          </div>

          <nav aria-label="Workspaces" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-muted text-primary font-medium border border-border'
                      : 'text-secondary hover:text-primary hover:bg-overlay-hover border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs leading-tight truncate">{item.label}</span>
                    <span className="text-[11px] text-secondary leading-tight truncate">
                      {item.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Telemetry Card & Settings/Zoom Footer */}
      <div>
        <Divider />
        <VStack gap={2} padding={3}>
          <ClickableCard
            label="Open engine diagnostics and settings"
            padding={2}
            variant="muted"
            onClick={() => setSettingsModalOpen(true)}
          >
            <VStack gap={1}>
              <HStack vAlign="center" hAlign="between" gap={2}>
                <HStack vAlign="center" gap={1.5} className="min-w-0">
                  <Cpu className="w-3.5 h-3.5 text-info shrink-0" />
                  <Text size="sm" weight="medium" color="primary" maxLines={1}>
                    {hw?.hasNvidiaCuda
                      ? 'RTX CUDA'
                      : hw?.hasAppleSilicon
                        ? 'Apple MPS'
                        : 'CPU Mode'}
                  </Text>
                </HStack>
                <Badge
                  variant="neutral"
                  label={editReadyMode ? 'Edit-Ready' : 'Raw'}
                />
              </HStack>

              <HStack vAlign="center" hAlign="between" gap={2}>
                <Text type="supporting" size="sm" color="secondary">
                  Built-in tools
                </Text>
                {diagnostics === null ? (
                  <Text size="sm" color="secondary" weight="medium">
                    Scanning...
                  </Text>
                ) : (
                  <Text
                    size="sm"
                    weight="medium"
                    className={missingCount > 0 ? 'text-warning' : 'text-success'}
                  >
                    {missingCount === 0
                      ? 'All ready'
                      : `${totalCount - missingCount}/${totalCount} installed`}
                  </Text>
                )}
              </HStack>
            </VStack>
          </ClickableCard>

          <HStack vAlign="center" hAlign="between" gap={2}>
            <Button
              label="Settings"
              variant="ghost"
              size="sm"
              icon={<Settings className="w-3.5 h-3.5" />}
              endContent={
                missingCount > 0 ? (
                  <Badge variant="warning" label={missingCount} />
                ) : undefined
              }
              onClick={() => setSettingsModalOpen(true)}
              className="shrink-0"
            />

            <ButtonGroup label="Workspace zoom" size="sm">
              <IconButton
                label="Zoom Out (Ctrl -)"
                icon={<Minus className="w-3 h-3" />}
                variant="secondary"
                onClick={zoomOut}
              />
              <Button
                label={`${Math.round(zoomFactor * 100)}%`}
                variant="secondary"
                tooltip="Reset Zoom (Ctrl 0)"
                onClick={resetZoom}
                className="tabular-nums"
              />
              <IconButton
                label="Zoom In (Ctrl +)"
                icon={<Plus className="w-3 h-3" />}
                variant="secondary"
                onClick={zoomIn}
              />
            </ButtonGroup>
          </HStack>
        </VStack>
      </div>
    </aside>
  );
};
