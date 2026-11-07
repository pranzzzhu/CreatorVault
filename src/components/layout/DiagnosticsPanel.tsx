import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FolderOpen,
  Globe,
  Loader2,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  X,
  XCircle,
  Zap
} from 'lucide-react';
import { useJobStore } from '../../store/useJobStore';
import type { BinaryName, BrowserSource } from '../../types/media';

const BROWSER_OPTIONS: Array<{ id: BrowserSource; label: string }> = [
  { id: 'none', label: 'Off (Anonymous)' },
  { id: 'firefox', label: 'Firefox (Recommended on Windows)' },
  { id: 'chrome', label: 'Google Chrome' },
  { id: 'brave', label: 'Brave Browser' },
  { id: 'edge', label: 'Microsoft Edge' }
];

export const DiagnosticsPanel: React.FC = () => {
  const isSettingsModalOpen = useJobStore((s) => s.isSettingsModalOpen);
  const setSettingsModalOpen = useJobStore((s) => s.setSettingsModalOpen);

  const themeMode = useJobStore((s) => s.themeMode);
  const setThemeMode = useJobStore((s) => s.setThemeMode);

  const zoomFactor = useJobStore((s) => s.zoomFactor);
  const zoomIn = useJobStore((s) => s.zoomIn);
  const zoomOut = useJobStore((s) => s.zoomOut);
  const resetZoom = useJobStore((s) => s.resetZoom);

  const editReadyMode = useJobStore((s) => s.editReadyMode);
  const setEditReadyMode = useJobStore((s) => s.setEditReadyMode);

  const simulateIfMissingBinary = useJobStore((s) => s.simulateIfMissingBinary);
  const setSimulateIfMissingBinary = useJobStore((s) => s.setSimulateIfMissingBinary);

  const browserCookies = useJobStore((s) => s.browserCookies);
  const setBrowserCookies = useJobStore((s) => s.setBrowserCookies);

  const outputDir = useJobStore((s) => s.outputDir);
  const chooseOutputDirectory = useJobStore((s) => s.chooseOutputDirectory);

  const diagnostics = useJobStore((s) => s.diagnostics);
  const refreshDiagnostics = useJobStore((s) => s.refreshDiagnostics);
  const installingBinaries = useJobStore((s) => s.installingBinaries);
  const installSidecarBinary = useJobStore((s) => s.installSidecarBinary);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [installNotice, setInstallNotice] = useState<string | null>(null);

  if (!isSettingsModalOpen) {
    return null;
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshDiagnostics();
    setIsRefreshing(false);
  };

  const handleInstallBinary = async (name: BinaryName) => {
    setInstallNotice(`Installing ${name}...`);
    const res = await installSidecarBinary(name);
    setInstallNotice(res.message);
    setTimeout(() => setInstallNotice(null), 4000);
  };

  const handleInstallAllMissing = async () => {
    if (!diagnostics) return;
    const missing = Object.values(diagnostics.binaries).filter((b) => !b.available);
    for (const bin of missing) {
      setInstallNotice(`Installing ${bin.name}...`);
      await installSidecarBinary(bin.name);
    }
    setInstallNotice('All sidecar engines installed and verified.');
    setTimeout(() => setInstallNotice(null), 4000);
  };

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1800);
  };

  const activeBrowserLabel =
    BROWSER_OPTIONS.find((b) => b.id === browserCookies)?.label || 'Off (Anonymous)';

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl bg-base-200 border border-base-300 p-0 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-base-100 border-b border-base-300 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-base-content">
              Settings & Engine Configuration
            </h3>
            <p className="text-xs text-base-content/60 mt-0.5">
              Appearance, NLE codec behavior, hardware acceleration, and local sidecar binaries
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsModalOpen(false)}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Settings Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* 1. Appearance & Default Export Folder */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-base-content/60">
              Appearance & Storage
            </h4>

            <div className="card bg-base-100 border border-base-300 divide-y divide-base-300">
              {/* Theme Switcher */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-base-content">
                    Color theme
                  </div>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    Switch between Antigravity Dark charcoal and clean Daylight mode.
                  </p>
                </div>

                <div className="join">
                  <button
                    type="button"
                    onClick={() => setThemeMode('antigravity-dark')}
                    className={`btn btn-sm join-item gap-1.5 ${
                      themeMode === 'antigravity-dark' ? 'btn-primary' : 'btn-ghost'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeMode('antigravity-light')}
                    className={`btn btn-sm join-item gap-1.5 ${
                      themeMode === 'antigravity-light' ? 'btn-primary' : 'btn-ghost'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Light</span>
                  </button>
                </div>
              </div>

              {/* UI Scale / Zoom Control */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-base-content">
                    Interface zoom scale
                  </div>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    Scale the entire workspace (<code className="text-base-content num">Ctrl +</code> / <code className="text-base-content num">Ctrl -</code> / <code className="text-base-content num">Ctrl 0</code> or <code className="text-base-content num">Ctrl + Scroll</code>).
                  </p>
                </div>

                <div className="join">
                  <button
                    type="button"
                    onClick={zoomOut}
                    className="btn btn-sm btn-outline join-item"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={resetZoom}
                    title="Click to reset to 100%"
                    className="btn btn-sm btn-outline join-item num min-w-16"
                  >
                    {Math.round(zoomFactor * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={zoomIn}
                    className="btn btn-sm btn-outline join-item"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Default Output Directory */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-base-content">
                    Default export directory
                  </div>
                  <p className="text-xs text-base-content/60 truncate mt-0.5 num">
                    {outputDir || diagnostics?.defaultOutputDir || 'Downloads/Vortex_Exports'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={chooseOutputDirectory}
                  className="btn btn-sm btn-outline gap-1.5 shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Change folder</span>
                </button>
              </div>
            </div>
          </section>

          {/* 2. Media Pipeline & NLE Compatibility */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-base-content/60">
              Pipeline & NLE Compatibility
            </h4>

            <div className="card bg-base-100 border border-base-300 divide-y divide-base-300">
              {/* Edit-Ready Safe Mode vs Raw Stream */}
              <div className="p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-accent" />
                    <span className="text-sm font-medium text-base-content">
                      Edit-Ready Safe Mode (MP4 / 48kHz WAV)
                    </span>
                  </div>
                  <p className="text-xs text-base-content/60 leading-relaxed">
                    When enabled, forces H.264 (<code className="text-base-content">avc1</code>) + AAC inside a standard <code className="text-base-content">.mp4</code> container for video, uncompressed <code className="text-base-content">48kHz 16-bit PCM .wav</code> for audio, and <code className="text-base-content">.png</code> for thumbnails so files never lag or drift in Adobe Premiere Pro, After Effects, or DaVinci Resolve. Turn off to download untouched raw <code className="text-base-content">.webm / .mkv</code> streams.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={editReadyMode}
                  onChange={(e) => setEditReadyMode(e.target.checked)}
                  className="toggle toggle-primary mt-1 shrink-0"
                />
              </div>

              {/* Simulation Fallback Mode */}
              <div className="p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-info" />
                    <span className="text-sm font-medium text-base-content">
                      Simulated Fallback Mode for Missing Binaries
                    </span>
                  </div>
                  <p className="text-xs text-base-content/60 leading-relaxed">
                    If an optional sidecar binary (such as <code className="text-base-content">demucs</code> for AI stem separation or <code className="text-base-content">ffmpeg</code>) is not installed on your system yet, Vortex synthesizes a valid, playable 48kHz stereo WAV file on disk. This allows you to test the in-app multi-stem Solo/Mute audition mixer and native OS drag-and-drop into your video editor without pipeline crashes.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={simulateIfMissingBinary}
                  onChange={(e) => setSimulateIfMissingBinary(e.target.checked)}
                  className="toggle toggle-primary mt-1 shrink-0"
                />
              </div>

              {/* Browser Cookie Bypass (daisyUI 5 Dropdown) */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-base-content/70" />
                    <span className="text-sm font-medium text-base-content">
                      Browser cookie authentication
                    </span>
                  </div>
                  <p className="text-xs text-base-content/60">
                    Passes <code className="text-base-content">--cookies-from-browser</code> to bypass Instagram Reel login walls or age-restricted YouTube videos.
                  </p>
                </div>

                <details className="dropdown dropdown-end shrink-0">
                  <summary className="btn btn-sm btn-outline m-1">
                    {activeBrowserLabel}
                  </summary>
                  <ul className="dropdown-content menu bg-base-200 rounded-box z-20 w-64 p-2 shadow-lg border border-base-300">
                    {BROWSER_OPTIONS.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={(e) => {
                            setBrowserCookies(item.id);
                            const details = e.currentTarget.closest('details');
                            if (details) details.removeAttribute('open');
                          }}
                          className={browserCookies === item.id ? 'menu-active' : ''}
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          </section>

          {/* 3. Hardware Telemetry & Sidecar Binaries (./bin) */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-base-content/60">
                Hardware Acceleration & Sidecar Binaries (<code className="num">./bin</code>)
              </h4>

              <div className="flex items-center gap-2">
                {diagnostics &&
                  Object.values(diagnostics.binaries).some((b) => !b.available) && (
                    <button
                      type="button"
                      onClick={handleInstallAllMissing}
                      className="btn btn-xs btn-primary gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Install all missing</span>
                    </button>
                  )}
                {diagnostics && (
                  <button
                    type="button"
                    onClick={() => window.vortexApi?.openFolder(diagnostics.binDir)}
                    className="btn btn-xs btn-ghost gap-1"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open ./bin folder</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="btn btn-xs btn-outline gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Re-scan</span>
                </button>
              </div>
            </div>

            {installNotice && (
              <div className="alert alert-info py-2 px-3 text-xs">
                <span>{installNotice}</span>
              </div>
            )}

            <div className="card bg-base-100 border border-base-300 divide-y divide-base-300">
              {/* GPU Telemetry Row */}
              {diagnostics && (
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-accent shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-base-content">
                          {diagnostics.hardware.gpuName}
                        </span>
                        <span className="badge badge-xs badge-accent">
                          {diagnostics.hardware.acceleratorBadge}
                        </span>
                      </div>
                      <p className="text-xs text-base-content/60 mt-0.5">
                        Demucs target flag: <code className="text-base-content">-d {diagnostics.hardware.recommendedDevice}</code> · Hardware H.264 encoder: <code className="text-base-content">{diagnostics.hardware.hasNvenc ? 'h264_nvenc' : 'CPU libx264'}</code>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Binary Status Rows */}
              {diagnostics &&
                Object.values(diagnostics.binaries).map((bin) => {
                  const isInstalling = Boolean(installingBinaries[bin.name]);
                  return (
                    <div
                      key={bin.name}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {bin.available ? (
                          <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-base-content num">
                              {bin.name}
                            </span>
                            <span
                              className={`badge badge-xs ${
                                bin.available ? 'badge-success badge-soft' : 'badge-warning badge-soft'
                              }`}
                            >
                              {bin.source}
                            </span>
                            {bin.version && (
                              <span className="text-[11px] text-base-content/50 truncate num">
                                {bin.version}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-base-content/60 truncate mt-0.5 num">
                            {bin.available ? bin.resolvedPath : bin.installHint}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isInstalling}
                          onClick={() => handleInstallBinary(bin.name)}
                          className={`btn btn-xs gap-1.5 ${
                            bin.available ? 'btn-ghost border border-base-300' : 'btn-primary'
                          }`}
                        >
                          {isInstalling ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Installing...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              <span>{bin.available ? 'Update' : 'Install'}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => copyCommand(bin.installHint)}
                          className="btn btn-xs btn-ghost border border-base-300 gap-1"
                          title={`Copy: ${bin.installHint}`}
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedCmd === bin.installHint ? 'Copied' : 'Cmd'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-base-100 border-t border-base-300 flex justify-end">
          <button
            type="button"
            onClick={() => setSettingsModalOpen(false)}
            className="btn btn-sm btn-primary"
          >
            Done
          </button>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={() => setSettingsModalOpen(false)}>
          close
        </button>
      </form>
    </dialog>
  );
};
