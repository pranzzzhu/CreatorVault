import React from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { useJobStore } from '../../store/useJobStore';

/** Shared save-folder picker button used across all media export modules. */
export const OutputFolderButton: React.FC = () => {
  const outputDir = useJobStore((s) => s.outputDir);
  const diagnostics = useJobStore((s) => s.diagnostics);
  const chooseOutputDirectory = useJobStore((s) => s.chooseOutputDirectory);

  const displayDir = outputDir || diagnostics?.defaultOutputDir || 'Save folder';

  return (
    <Button
      label={displayDir}
      variant="secondary"
      size="sm"
      tooltip={`Save folder: ${displayDir}`}
      icon={<FolderOpen className="w-3.5 h-3.5 text-info" />}
      onClick={chooseOutputDirectory}
      className="max-w-[220px] num"
    />
  );
};
