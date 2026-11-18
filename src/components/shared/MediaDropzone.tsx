import React, { useState } from 'react';
import { FolderPlus, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';

interface MediaDropzoneProps {
  title: string;
  subtitle: React.ReactNode;
  buttonLabel: string;
  loadingLabel: string;
  isProbing: boolean;
  onBrowse: () => void;
  onDropPaths: (paths: string[]) => Promise<void> | void;
  stagedCount: number;
  stagedHeading: string;
  onClearAll: () => void;
  children?: React.ReactNode;
}

/** Shared drag-and-drop staging frame for local media modules (Fixer, Vectorizer, Converter). */
export const MediaDropzone: React.FC<MediaDropzoneProps> = ({
  title,
  subtitle,
  buttonLabel,
  loadingLabel,
  isProbing,
  onBrowse,
  onDropPaths,
  stagedCount,
  stagedHeading,
  onClearAll,
  children
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const paths: string[] = [];
    for (const file of files) {
      const resolved = window.vortexApi?.getPathForDroppedFile?.(file);
      if (resolved) paths.push(resolved);
    }
    if (paths.length > 0) {
      await onDropPaths(paths);
    }
  };

  return (
    <Card
      padding={4}
      className={`border transition-colors ${
        isDragOver
          ? 'border-info bg-info-muted/20'
          : 'border-dashed border-border-strong bg-surface'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <VStack gap={3}>
        <HStack vAlign="center" hAlign="between" gap={4} wrap="wrap">
          <HStack vAlign="center" gap={3} className="min-w-0 flex-1">
            <div className="w-8 h-8 rounded-md bg-muted border border-border flex items-center justify-center shrink-0 text-info">
              <UploadCloud className="w-4 h-4" />
            </div>
            <VStack gap={0.5} className="min-w-0">
              <Text type="supporting" weight="medium" color="primary">
                {title}
              </Text>
              <Text type="supporting" size="sm" color="secondary">
                {subtitle}
              </Text>
            </VStack>
          </HStack>

          <Button
            label={isProbing ? loadingLabel : buttonLabel}
            variant="primary"
            size="sm"
            isLoading={isProbing}
            isDisabled={isProbing}
            icon={<FolderPlus className="w-3.5 h-3.5" />}
            onClick={onBrowse}
          />
        </HStack>

        {stagedCount > 0 && (
          <>
            <Divider />
            <VStack gap={2}>
              <HStack vAlign="center" hAlign="between">
                <Text type="supporting" size="sm" weight="medium" color="secondary">
                  {stagedHeading} ({stagedCount})
                </Text>
                <Button
                  label="Clear all"
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="w-3 h-3" />}
                  onClick={onClearAll}
                />
              </HStack>

              <div className="divide-y divide-border border border-border rounded-md bg-body overflow-hidden">
                {children}
              </div>
            </VStack>
          </>
        )}
      </VStack>
    </Card>
  );
};
