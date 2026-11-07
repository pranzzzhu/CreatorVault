import React from 'react';
import {
  Cpu,
  Download,
  Film,
  Minus,
  PenTool,
  Plus,
  RotateCcw,
  Settings,
  Zap
} from 'lucide-react';
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
    label: 'Ripper & Stem Lab',
    subtitle: 'Clip, rip & split stems',
    icon: Download
  },
  {
    id: 'fixer',
    label: 'Video Fixer Deck',
    subtitle: 'Deflicker & NLE proxies',
    icon: Film
  },
  {
    id: 'vectorizer',
    label: 'Vector & Upscale',
    subtitle: 'SVG trace & alpha matte',
    icon: PenTool
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
    <aside className="w-60 shrink-0 bg-base-100 border-r border-base-300 flex flex-col justify-between select-none">
      {/* Top Draggable Brand Header */}
      <div>
        <div className="h-12 px-4 flex items-center justify-between border-b border-base-300 app-drag-region">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-base-300 flex items-center justify-center text-base-content">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-base-content">
              Vortex
            </span>
          </div>
          <span className="badge badge-xs badge-ghost num">v0.1</span>
        </div>

        {/* Workspace Navigation Menu */}
        <div className="p-3">
          <div className="px-2 pb-1.5 text-xs font-medium text-base-content/50">
            Workspaces
          </div>
          <ul className="menu menu-sm p-0 gap-1 w-full">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActiveModule(item.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                      isActive
                        ? 'bg-base-300 text-base-content font-medium'
                        : 'text-base-content/70 hover:text-base-content hover:bg-base-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <div className="flex flex-col items-start min-w-0">
                      <span className="text-xs leading-tight truncate">{item.label}</span>
                      <span className="text-[11px] text-base-content/50 leading-tight truncate">
                        {item.subtitle}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Bottom Status Pill & Settings Dialog Trigger (Just like Antigravity sidebar) */}
      <div className="p-3 border-t border-base-300 space-y-2">
        {/* Compact Telemetry Summary Card */}
        <button
          type="button"
          onClick={() => setSettingsModalOpen(true)}
          className="w-full text-left px-3 py-2 rounded-lg bg-base-200 hover:bg-base-300 border border-base-300 transition-colors duration-150 space-y-1 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-base-content/80">
              <Cpu className="w-3.5 h-3.5 text-accent" />
              <span className="truncate">
                {hw?.hasNvidiaCuda ? 'RTX CUDA' : hw?.hasAppleSilicon ? 'Apple MPS' : 'CPU Mode'}
              </span>
            </span>
            <span className="badge badge-xs badge-neutral">
              {editReadyMode ? 'Edit-Ready' : 'Raw'}
            </span>
          </div>
          <div className="text-[11px] text-base-content/50 flex items-center justify-between">
            <span>Sidecar binaries</span>
            {diagnostics === null ? (
              <span className="text-base-content/60 font-medium">Scanning...</span>
            ) : (
              <span className={missingCount > 0 ? 'text-warning font-medium' : 'text-success font-medium'}>
                {missingCount === 0 ? 'All ready' : `${totalCount - missingCount}/${totalCount} installed`}
              </span>
            )}
          </div>
        </button>

        {/* Settings & Zoom Row */}
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            className="btn btn-ghost btn-sm flex-1 justify-start font-normal text-base-content/80 hover:text-base-content hover:bg-base-200 px-2.5"
          >
            <Settings className="w-4 h-4" />
            <span className="text-xs font-medium">Settings</span>
            {missingCount > 0 && (
              <span className="badge badge-xs badge-warning ml-auto">{missingCount}</span>
            )}
          </button>

          {/* Antigravity Quick Zoom Controls (- 100% +) */}
          <div className="join border border-base-300 rounded-lg bg-base-200">
            <button
              type="button"
              onClick={zoomOut}
              title="Zoom Out (Ctrl -)"
              className="btn btn-ghost btn-xs join-item px-1.5"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              title="Reset Zoom (Ctrl 0)"
              className="btn btn-ghost btn-xs join-item px-1.5 num text-[11px] font-normal"
            >
              {Math.round(zoomFactor * 100)}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              title="Zoom In (Ctrl +)"
              className="btn btn-ghost btn-xs join-item px-1.5"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
