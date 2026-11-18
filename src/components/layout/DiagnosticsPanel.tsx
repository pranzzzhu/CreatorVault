import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FolderOpen,
  Globe,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  XCircle,
  Zap
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { ButtonGroup } from '@astryxdesign/core/ButtonGroup';
import { Card } from '@astryxdesign/core/Card';
import { Code } from '@astryxdesign/core/Code';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { useJobStore } from '../../store/useJobStore';
import { normalizeThemeMode, type BinaryName, type BrowserSource, type ThemeMode } from '../../types/media';

const BROWSER_OPTIONS: Array<{ value: BrowserSource; label: string }> = [
  { value: 'none', label: 'Off (Anonymous)' },
  { value: 'firefox', label: 'Firefox (Recommended on Windows)' },
  { value: 'chrome', label: 'Google Chrome' },
  { value: 'brave', label: 'Brave Browser' },
  { value: 'edge', label: 'Microsoft Edge' }
];

export const DiagnosticsPanel: React.FC = () => {
  const isSettingsModalOpen = useJobStore((s) => s.isSettingsModalOpen);
  const setSettingsModalOpen = useJobStore((s) => s.setSettingsModalOpen);

  const rawThemeMode = useJobStore((s) => s.themeMode);
  const themeMode = normalizeThemeMode(rawThemeMode);
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

  const hasMissingBinaries =
    diagnostics !== null && Object.values(diagnostics.binaries).some((b) => !b.available);

  return (
    <Dialog
      isOpen={isSettingsModalOpen}
      onOpenChange={setSettingsModalOpen}
      width={680}
      maxHeight="82vh"
    >
      <Layout
        header={
          <DialogHeader
            title="Settings & Engine Configuration"
            subtitle="Appearance, NLE codec behavior, hardware acceleration, and local sidecar binaries"
            onOpenChange={setSettingsModalOpen}
            hasDivider
          />
        }
        content={
          <LayoutContent>
            <VStack gap={5}>
              {/* 1. Appearance & Storage */}
              <VStack gap={2}>
                <Text type="supporting" size="sm" weight="semibold" color="secondary">
                  Appearance & Storage
                </Text>

                <Card padding={0} className="overflow-hidden">
                  <div className="divide-y divide-border">
                    {/* Theme Switcher */}
                    <div className="p-4 flex items-center justify-between gap-4">
                      <VStack gap={0.5}>
                        <Text size="sm" weight="medium" color="primary">
                          Color theme
                        </Text>
                        <Text type="supporting" size="sm" color="secondary">
                          Switch between Astryx Dark and clean Daylight mode.
                        </Text>
                      </VStack>

                      <SegmentedControl
                        label="Color theme"
                        size="sm"
                        value={themeMode}
                        onChange={(val) => setThemeMode(val as ThemeMode)}
                      >
                        <SegmentedControlItem
                          value="dark"
                          label="Dark"
                          icon={<Moon className="w-3.5 h-3.5" />}
                        />
                        <SegmentedControlItem
                          value="light"
                          label="Light"
                          icon={<Sun className="w-3.5 h-3.5" />}
                        />
                      </SegmentedControl>
                    </div>

                    {/* Interface Zoom Scale */}
                    <div className="p-4 flex items-center justify-between gap-4">
                      <VStack gap={0.5}>
                        <Text size="sm" weight="medium" color="primary">
                          Interface zoom scale
                        </Text>
                        <Text type="supporting" size="sm" color="secondary">
                          Scale workspace (<Code size="inherit">Ctrl +</Code> /{' '}
                          <Code size="inherit">Ctrl -</Code> / <Code size="inherit">Ctrl 0</Code> or{' '}
                          <Code size="inherit">Ctrl + Scroll</Code>).
                        </Text>
                      </VStack>

                      <ButtonGroup label="Interface zoom scale" size="sm">
                        <Button label="-" variant="secondary" onClick={zoomOut} />
                        <Button
                          label={`${Math.round(zoomFactor * 100)}%`}
                          variant="secondary"
                          tooltip="Reset to 100%"
                          onClick={resetZoom}
                          className="tabular-nums"
                        />
                        <Button label="+" variant="secondary" onClick={zoomIn} />
                      </ButtonGroup>
                    </div>

                    {/* Default Export Directory */}
                    <div className="p-4 flex items-center justify-between gap-4">
                      <VStack gap={0.5} className="min-w-0 flex-1">
                        <Text size="sm" weight="medium" color="primary">
                          Default export directory
                        </Text>
                        <Text type="supporting" size="sm" color="secondary" maxLines={1} className="num">
                          {outputDir || diagnostics?.defaultOutputDir || 'Downloads/Vortex_Exports'}
                        </Text>
                      </VStack>

                      <Button
                        label="Change folder"
                        variant="secondary"
                        size="sm"
                        icon={<FolderOpen className="w-3.5 h-3.5" />}
                        onClick={chooseOutputDirectory}
                      />
                    </div>
                  </div>
                </Card>
              </VStack>

              {/* 2. Pipeline & NLE Compatibility */}
              <VStack gap={2}>
                <Text type="supporting" size="sm" weight="semibold" color="secondary">
                  Pipeline & NLE Compatibility
                </Text>

                <Card padding={0} className="overflow-hidden">
                  <div className="divide-y divide-border">
                    <div className="p-4 flex items-start justify-between gap-4">
                      <VStack gap={1}>
                        <HStack vAlign="center" gap={2}>
                          <Zap className="w-4 h-4 text-info shrink-0" />
                          <Text size="sm" weight="medium" color="primary">
                            Edit-Ready Safe Mode (MP4 / 48kHz WAV)
                          </Text>
                        </HStack>
                        <Text type="supporting" size="sm" color="secondary">
                          Forces H.264 (<Code size="inherit">avc1</Code>) + AAC inside{' '}
                          <Code size="inherit">.mp4</Code>, uncompressed{' '}
                          <Code size="inherit">48kHz 16-bit PCM .wav</Code> audio, and{' '}
                          <Code size="inherit">.png</Code> thumbnails so files never drift in
                          Premiere Pro, After Effects, or DaVinci Resolve.
                        </Text>
                      </VStack>

                      <Switch
                        label="Edit-Ready Safe Mode"
                        isLabelHidden
                        size="sm"
                        value={editReadyMode}
                        onChange={(checked) => setEditReadyMode(checked)}
                      />
                    </div>

                    <div className="p-4 flex items-start justify-between gap-4">
                      <VStack gap={1}>
                        <HStack vAlign="center" gap={2}>
                          <ShieldCheck className="w-4 h-4 text-info shrink-0" />
                          <Text size="sm" weight="medium" color="primary">
                            Simulated Fallback Mode for Missing Binaries
                          </Text>
                        </HStack>
                        <Text type="supporting" size="sm" color="secondary">
                          When optional binaries (<Code size="inherit">demucs</Code> or{' '}
                          <Code size="inherit">ffmpeg</Code>) are missing, synthesizes a valid
                          48kHz stereo WAV so you can test stem auditioning and native NLE drag
                          without pipeline failures.
                        </Text>
                      </VStack>

                      <Switch
                        label="Simulated Fallback Mode"
                        isLabelHidden
                        size="sm"
                        value={simulateIfMissingBinary}
                        onChange={(checked) => setSimulateIfMissingBinary(checked)}
                      />
                    </div>

                    <div className="p-4 flex items-center justify-between gap-4">
                      <VStack gap={0.5} className="min-w-0 flex-1">
                        <HStack vAlign="center" gap={2}>
                          <Globe className="w-4 h-4 text-secondary shrink-0" />
                          <Text size="sm" weight="medium" color="primary">
                            Browser cookie authentication
                          </Text>
                        </HStack>
                        <Text type="supporting" size="sm" color="secondary">
                          Passes <Code size="inherit">--cookies-from-browser</Code> to bypass login
                          walls or age-restricted videos.
                        </Text>
                      </VStack>

                      <Selector
                        label="Browser cookie authentication"
                        isLabelHidden
                        size="sm"
                        width={230}
                        value={browserCookies}
                        onChange={(val) => setBrowserCookies(val as BrowserSource)}
                        options={BROWSER_OPTIONS}
                      />
                    </div>
                  </div>
                </Card>
              </VStack>

              {/* 3. Hardware Telemetry & Sidecar Binaries */}
              <VStack gap={2}>
                <HStack vAlign="center" hAlign="between" gap={2} wrap="wrap">
                  <Text type="supporting" size="sm" weight="semibold" color="secondary">
                    Hardware Acceleration & Sidecar Binaries (<Code size="inherit">./bin</Code>)
                  </Text>

                  <HStack vAlign="center" gap={1.5}>
                    {hasMissingBinaries && (
                      <Button
                        label="Install all missing"
                        variant="primary"
                        size="sm"
                        icon={<Download className="w-3 h-3" />}
                        onClick={handleInstallAllMissing}
                      />
                    )}
                    {diagnostics && (
                      <Button
                        label="Open ./bin"
                        variant="ghost"
                        size="sm"
                        icon={<FolderOpen className="w-3.5 h-3.5" />}
                        onClick={() => window.vortexApi?.openFolder(diagnostics.binDir)}
                      />
                    )}
                    <Button
                      label="Re-scan"
                      variant="secondary"
                      size="sm"
                      isLoading={isRefreshing}
                      icon={<RefreshCw className="w-3 h-3" />}
                      onClick={handleRefresh}
                    />
                  </HStack>
                </HStack>

                {installNotice && <Banner status="info" title={installNotice} />}

                <Card padding={0} className="overflow-hidden">
                  <div className="divide-y divide-border">
                    {diagnostics && (
                      <div className="p-4 flex items-center gap-3">
                        <Cpu className="w-5 h-5 text-info shrink-0" />
                        <VStack gap={0.5} className="min-w-0">
                          <HStack vAlign="center" gap={2}>
                            <Text size="sm" weight="medium" color="primary">
                              {diagnostics.hardware.gpuName}
                            </Text>
                            <Badge variant="info" label={diagnostics.hardware.acceleratorBadge} />
                          </HStack>
                          <Text type="supporting" size="sm" color="secondary">
                            Demucs flag:{' '}
                            <Code size="inherit">-d {diagnostics.hardware.recommendedDevice}</Code>{' '}
                            · Video encoder:{' '}
                            <Code size="inherit">
                              {diagnostics.hardware.hasNvenc ? 'h264_nvenc' : 'CPU libx264'}
                            </Code>
                          </Text>
                        </VStack>
                      </div>
                    )}

                    {diagnostics &&
                      Object.values(diagnostics.binaries).map((bin) => {
                        const isInstalling = Boolean(installingBinaries[bin.name]);
                        return (
                          <div
                            key={bin.name}
                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              {bin.available ? (
                                <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                              )}
                              <VStack gap={0.5} className="min-w-0 flex-1">
                                <HStack vAlign="center" gap={2} wrap="wrap">
                                  <Text size="sm" weight="semibold" color="primary" className="num">
                                    {bin.name}
                                  </Text>
                                  <Badge
                                    variant={bin.available ? 'success' : 'warning'}
                                    label={bin.source}
                                  />
                                  {bin.version && (
                                    <Text size="sm" color="secondary" maxLines={1} className="num">
                                      {bin.version}
                                    </Text>
                                  )}
                                </HStack>
                                <Text
                                  type="supporting"
                                  size="sm"
                                  color="secondary"
                                  maxLines={1}
                                  className="num"
                                >
                                  {bin.available ? bin.resolvedPath : bin.installHint}
                                </Text>
                              </VStack>
                            </div>

                            <HStack vAlign="center" gap={1.5} className="shrink-0">
                              <Button
                                label={
                                  isInstalling
                                    ? 'Installing...'
                                    : bin.available
                                      ? 'Update'
                                      : 'Install'
                                }
                                variant={bin.available ? 'secondary' : 'primary'}
                                size="sm"
                                isLoading={isInstalling}
                                isDisabled={isInstalling}
                                icon={<Download className="w-3 h-3" />}
                                onClick={() => handleInstallBinary(bin.name)}
                              />

                              <IconButton
                                label={
                                  copiedCmd === bin.installHint
                                    ? 'Copied command'
                                    : `Copy install command: ${bin.installHint}`
                                }
                                variant="ghost"
                                size="sm"
                                icon={<Copy className="w-3 h-3" />}
                                onClick={() => copyCommand(bin.installHint)}
                              />
                            </HStack>
                          </div>
                        );
                      })}
                  </div>
                </Card>
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack hAlign="end" width="100%">
              <Button
                label="Done"
                variant="primary"
                size="sm"
                onClick={() => setSettingsModalOpen(false)}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
};
