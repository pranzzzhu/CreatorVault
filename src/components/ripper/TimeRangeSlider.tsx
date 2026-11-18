import React, { useEffect, useRef, useState } from 'react';
import { Scissors } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { ButtonGroup } from '@astryxdesign/core/ButtonGroup';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';

interface TimeRangeSliderProps {
  duration: number;
  startTime: number;
  endTime: number;
  trimEnabled: boolean;
  onToggleTrim: (enabled: boolean) => void;
  onChangeRange: (start: number, end: number) => void;
}

export function formatMmSsMs(seconds: number): string {
  const safe = Math.max(0, seconds);
  const totalHundredths = Math.round(safe * 100);
  const totalSecs = Math.floor(totalHundredths / 100);
  const hundredths = String(totalHundredths % 100).padStart(2, '0');
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${hundredths}`;
}

export function parseMmSsMs(input: string, fallback: number): number {
  const clean = input.trim();
  const parts = clean.split(':');
  if (parts.length === 1) {
    const val = parseFloat(parts[0]);
    return Number.isFinite(val) ? val : fallback;
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  return fallback;
}

export const TimeRangeSlider: React.FC<TimeRangeSliderProps> = ({
  duration,
  startTime,
  endTime,
  trimEnabled,
  onToggleTrim,
  onChangeRange
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingMode, setDraggingMode] = useState<'start' | 'end' | 'window' | null>(null);
  const dragOriginRef = useRef<{
    mouseX: number;
    initialStart: number;
    initialEnd: number;
  }>({ mouseX: 0, initialStart: 0, initialEnd: 0 });

  const [startInput, setStartInput] = useState(formatMmSsMs(startTime));
  const [endInput, setEndInput] = useState(formatMmSsMs(endTime));
  const currentRangeRef = useRef<{ start: number; end: number }>({ start: startTime, end: endTime });

  useEffect(() => {
    currentRangeRef.current = { start: startTime, end: endTime };
  }, [startTime, endTime]);

  useEffect(() => {
    setStartInput(formatMmSsMs(startTime));
  }, [startTime]);

  useEffect(() => {
    setEndInput(formatMmSsMs(endTime));
  }, [endTime]);

  useEffect(() => {
    if (!draggingMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRef.current || duration <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();

      if (draggingMode === 'window') {
        const deltaPixels = e.clientX - dragOriginRef.current.mouseX;
        const deltaSeconds = (deltaPixels / rect.width) * duration;
        const rawSpan = dragOriginRef.current.initialEnd - dragOriginRef.current.initialStart;
        const windowSpan = Math.min(duration, Math.max(0.1, rawSpan));

        let nextStart = dragOriginRef.current.initialStart + deltaSeconds;
        if (nextStart < 0) nextStart = 0;
        if (nextStart + windowSpan > duration) {
          nextStart = Math.max(0, duration - windowSpan);
        }

        const clampedEnd = Math.min(duration, nextStart + windowSpan);
        onChangeRange(Number(nextStart.toFixed(2)), Number(clampedEnd.toFixed(2)));
        return;
      }

      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newSec = ratio * duration;
      const cur = currentRangeRef.current;
      const minStep = Math.min(0.1, duration);

      if (draggingMode === 'start') {
        const safeStart = Math.max(0, Math.min(newSec, cur.end - minStep));
        onChangeRange(Number(safeStart.toFixed(2)), cur.end);
      } else if (draggingMode === 'end') {
        const safeEnd = Math.min(duration, Math.max(newSec, cur.start + minStep));
        onChangeRange(cur.start, Number(safeEnd.toFixed(2)));
      }
    };

    const handleMouseUp = () => {
      setDraggingMode(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingMode, duration, onChangeRange]);

  const startPercent = duration > 0 ? Math.min(100, Math.max(0, (startTime / duration) * 100)) : 0;
  const endPercent = duration > 0 ? Math.min(100, Math.max(0, (endTime / duration) * 100)) : 100;
  const clipDuration = Math.max(0, endTime - startTime);

  return (
    <VStack gap={3}>
      <Divider />
      <HStack vAlign="center" hAlign="between" gap={3}>
        <Switch
          label="Cut a specific clip"
          labelIcon={<Scissors className="w-3.5 h-3.5 text-info" />}
          size="sm"
          value={trimEnabled}
          onChange={(checked) => onToggleTrim(checked)}
        />

        {trimEnabled ? (
          <Badge
            variant="info"
            label={`Clip length: ${clipDuration.toFixed(1)}s (drag bar to move)`}
          />
        ) : (
          <Text size="sm" color="secondary" className="num">
            Full length ({formatMmSsMs(duration)})
          </Text>
        )}
      </HStack>

      <div
        className={`space-y-3 transition-opacity duration-150 ${
          trimEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
        }`}
      >
        <div
          ref={trackRef}
          onClick={(e) => {
            if (!trackRef.current || draggingMode) return;
            const rect = trackRef.current.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const clickedSec = ratio * duration;
            if (clickedSec >= startTime && clickedSec <= endTime) return;
            const distStart = Math.abs(clickedSec - startTime);
            const distEnd = Math.abs(clickedSec - endTime);
            if (distStart <= distEnd) {
              onChangeRange(Math.min(clickedSec, endTime - 1), endTime);
            } else {
              onChangeRange(startTime, Math.max(clickedSec, startTime + 1));
            }
          }}
          className="relative h-8 bg-body border border-border rounded-md cursor-pointer flex items-center px-1 overflow-visible select-none"
        >
          <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none opacity-25">
            {Array.from({ length: 36 }).map((_, idx) => (
              <div
                key={idx}
                style={{ height: `${25 + ((idx * 17) % 55)}%` }}
                className="w-[2px] bg-secondary rounded-full"
              />
            ))}
          </div>

          {/* Draggable Highlight Window */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              dragOriginRef.current = {
                mouseX: e.clientX,
                initialStart: startTime,
                initialEnd: endTime
              };
              setDraggingMode('window');
            }}
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(1, endPercent - startPercent)}%`
            }}
            title="Click and drag to move the entire clip window"
            className="absolute top-0 bottom-0 bg-info-muted/40 hover:bg-info-muted/60 border-y border-info cursor-grab active:cursor-grabbing z-10 flex items-center justify-center transition-colors"
          >
            <span className="text-[10px] font-medium text-primary bg-surface/90 px-1.5 py-0.5 rounded pointer-events-none num hidden sm:inline border border-border">
              {clipDuration.toFixed(1)}s
            </span>
          </div>

          {/* Left Start Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              setDraggingMode('start');
            }}
            style={{ left: `${startPercent}%` }}
            title="Drag Start Time"
            className="absolute -ml-2 top-0 bottom-0 w-4 bg-accent-bg rounded-sm flex items-center justify-center cursor-ew-resize z-20 shadow-sm"
          >
            <div className="w-[2px] h-3.5 bg-on-accent rounded-full" />
          </div>

          {/* Right End Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              setDraggingMode('end');
            }}
            style={{ left: `${endPercent}%` }}
            title="Drag End Time"
            className="absolute -ml-2 top-0 bottom-0 w-4 bg-info rounded-sm flex items-center justify-center cursor-ew-resize z-20 shadow-sm"
          >
            <div className="w-[2px] h-3.5 bg-on-info rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="flex items-center justify-between gap-2">
            <Text size="sm" weight="medium" color="secondary">
              Start time
            </Text>
            <HStack vAlign="center" gap={1}>
              <ButtonGroup label="Adjust start time" size="sm">
                <Button
                  label="-1s"
                  variant="secondary"
                  onClick={() => onChangeRange(startTime - 1, endTime)}
                  className="num"
                />
                <Button
                  label="+1s"
                  variant="secondary"
                  onClick={() => onChangeRange(startTime + 1, endTime)}
                  className="num"
                />
              </ButtonGroup>
              <input
                type="text"
                aria-label="Start time"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                onBlur={() => onChangeRange(parseMmSsMs(startInput, startTime), endTime)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onChangeRange(parseMmSsMs(startInput, startTime), endTime);
                  }
                }}
                className="h-7 w-22 rounded-sm border border-border-strong bg-body px-2 text-center text-xs text-primary num focus:outline-none focus:border-info"
              />
            </HStack>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Text size="sm" weight="medium" color="secondary">
              End time
            </Text>
            <HStack vAlign="center" gap={1}>
              <ButtonGroup label="Adjust end time" size="sm">
                <Button
                  label="-1s"
                  variant="secondary"
                  onClick={() => onChangeRange(startTime, endTime - 1)}
                  className="num"
                />
                <Button
                  label="+1s"
                  variant="secondary"
                  onClick={() => onChangeRange(startTime, endTime + 1)}
                  className="num"
                />
              </ButtonGroup>
              <input
                type="text"
                aria-label="End time"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                onBlur={() => onChangeRange(startTime, parseMmSsMs(endInput, endTime))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onChangeRange(startTime, parseMmSsMs(endInput, endTime));
                  }
                }}
                className="h-7 w-22 rounded-sm border border-border-strong bg-body px-2 text-center text-xs text-primary num focus:outline-none focus:border-info"
              />
            </HStack>
          </div>
        </div>
      </div>
      <Divider />
    </VStack>
  );
};
