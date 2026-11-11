import React, { useEffect } from 'react';
import { SidebarRail } from './components/layout/SidebarRail';
import { DiagnosticsPanel } from './components/layout/DiagnosticsPanel';
import { UrlCommandBar } from './components/ripper/UrlCommandBar';
import { StagingCard } from './components/ripper/StagingCard';
import { JobQueueList } from './components/ripper/JobQueueList';
import { FixerModuleView } from './components/fixer/FixerModuleView';
import { VectorizerModuleView } from './components/vectorizer/VectorizerModuleView';
import { ConverterModuleView } from './components/converter/ConverterModuleView';
import { useJobStore } from './store/useJobStore';

export const App: React.FC = () => {
  const activeModule = useJobStore((s) => s.activeModule);
  const initDiagnostics = useJobStore((s) => s.initDiagnostics);
  const handleProgressEvent = useJobStore((s) => s.handleProgressEvent);
  const zoomIn = useJobStore((s) => s.zoomIn);
  const zoomOut = useJobStore((s) => s.zoomOut);
  const resetZoom = useJobStore((s) => s.resetZoom);

  useEffect(() => {
    initDiagnostics();
    if (!window.vortexApi) return;
    const unsubscribe = window.vortexApi.onJobProgress((ev) => {
      handleProgressEvent(ev);
    });
    return () => {
      unsubscribe();
    };
  }, [initDiagnostics, handleProgressEvent]);

  // Antigravity Keyboard & Mousewheel Zoom Shortcuts (Ctrl/Cmd + '=', '-', '0', or Ctrl + Wheel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else if (e.deltaY > 0) {
        zoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [zoomIn, zoomOut, resetZoom]);

  return (
    <div className="h-screen w-screen bg-base-100 text-base-content flex overflow-hidden select-none">
      {/* Left Navigation Sidebar (Antigravity Style) */}
      <SidebarRail />

      {/* Main Content Area with Subtle Top Window Drag Strip */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="h-9 shrink-0 w-full app-drag-region" />

        <main className="flex-1 overflow-y-auto px-8 pb-8 pt-2">
          <div className="max-w-4xl mx-auto space-y-6">
            {activeModule === 'ripper' && (
              <>
                <UrlCommandBar />
                <StagingCard />
                <JobQueueList />
              </>
            )}

            {activeModule === 'fixer' && <FixerModuleView />}

            {activeModule === 'vectorizer' && <VectorizerModuleView />}

            {activeModule === 'converter' && <ConverterModuleView />}
          </div>
        </main>
      </div>

      {/* Proper Settings Dialog Modal */}
      <DiagnosticsPanel />
    </div>
  );
};

export default App;
