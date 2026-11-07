import React, { useEffect, useRef, useState } from 'react';
import { Scissors } from 'lucide-react';

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
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
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
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
  const [startInput, setStartInput] = useState(formatMmSsMs(startTime));
  const [endInput, setEndInput] = useState(formatMmSsMs(endTime));

  useEffect(() => {
    setStartInput(formatMmSsMs(startTime));
  }, [startTime]);

  useEffect(() => {
    setEndInput(formatMmSsMs(endTime));
  }, [endTime]);

  useEffect(() => {
    if (!draggingHandle) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newSec = ratio * duration;

      if (draggingHandle === 'start') {
        onChangeRange(Math.min(newSec, endTime - 1), endTime);
      } else {
        onChangeRange(startTime, Math.max(newSec, startTime + 1));
      }
    };

    const handleMouseUp = () => {
      setDraggingHandle(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingHandle, duration, startTime, endTime, onChangeRange]);

  const startPercent = duration > 0 ? Math.min(100, Math.max(0, (startTime / duration) * 100)) : 0;
  const endPercent = duration > 0 ? Math.min(100, Math.max(0, (endTime / duration) * 100)) : 100;
  const clipDuration = Math.max(0, endTime - startTime);

  return (
    <div className="border-y border-base-300 py-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={trimEnabled}
            onChange={(e) => onToggleTrim(e.target.checked)}
            className="toggle toggle-sm toggle-primary"
          />
          <span className="flex items-center gap-1.5 text-xs font-medium text-base-content">
            <Scissors className="w-3.5 h-3.5 text-accent" />
            <span>Trim section before download</span>
          </span>
        </label>

        <div className="flex items-center gap-2 text-xs">
          {trimEnabled ? (
            <span className="badge badge-sm badge-neutral num">
              Clip window: {clipDuration.toFixed(1)}s
            </span>
          ) : (
            <span className="text-base-content/50 num">
              Full stream ({formatMmSsMs(duration)})
            </span>
          )}
        </div>
      </div>

      <div
        className={`space-y-3 transition-opacity duration-150 ${
          trimEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
        }`}
      >
        <div
          ref={trackRef}
          onClick={(e) => {
            if (!trackRef.current) return;
            const rect = trackRef.current.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const clickedSec = ratio * duration;
            const distStart = Math.abs(clickedSec - startTime);
            const distEnd = Math.abs(clickedSec - endTime);
            if (distStart <= distEnd) {
              onChangeRange(Math.min(clickedSec, endTime - 1), endTime);
            } else {
              onChangeRange(startTime, Math.max(clickedSec, startTime + 1));
            }
          }}
          className="relative h-7 bg-base-100 border border-base-300 rounded-lg cursor-pointer flex items-center px-1 overflow-visible"
        >
          <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none opacity-25">
            {Array.from({ length: 36 }).map((_, idx) => (
              <div
                key={idx}
                style={{ height: `${25 + ((idx * 17) % 55)}%` }}
                className="w-[2px] bg-base-content rounded-full"
              />
            ))}
          </div>

          <div
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(1, endPercent - startPercent)}%`
            }}
            className="absolute top-0 bottom-0 bg-accent/20 border-y border-accent pointer-events-none"
          />

          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              setDraggingHandle('start');
            }}
            style={{ left: `${startPercent}%` }}
            title="Drag In Point"
            className="absolute -ml-2 top-0 bottom-0 w-4 bg-primary rounded-md flex items-center justify-center cursor-ew-resize z-10"
          >
            <div className="w-[2px] h-3 bg-primary-content rounded-full" />
          </div>

          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              setDraggingHandle('end');
            }}
            style={{ left: `${endPercent}%` }}
            title="Drag Out Point"
            className="absolute -ml-2 top-0 bottom-0 w-4 bg-accent rounded-md flex items-center justify-center cursor-ew-resize z-10"
          >
            <div className="w-[2px] h-3 bg-accent-content rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-base-content/70 font-medium">
              In point
            </span>
            <div className="join">
              <button
                type="button"
                onClick={() => onChangeRange(startTime - 1, endTime)}
                className="btn btn-xs btn-outline join-item num"
              >
                -1s
              </button>
              <input
                type="text"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                onBlur={() => {
                  const parsed = parseMmSsMs(startInput, startTime);
                  onChangeRange(parsed, endTime);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const parsed = parseMmSsMs(startInput, startTime);
                    onChangeRange(parsed, endTime);
                  }
                }}
                className="input input-xs join-item w-24 text-center num"
              />
              <button
                type="button"
                onClick={() => onChangeRange(startTime + 1, endTime)}
                className="btn btn-xs btn-outline join-item num"
              >
                +1s
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-base-content/70 font-medium">
              Out point
            </span>
            <div className="join">
              <button
                type="button"
                onClick={() => onChangeRange(startTime, endTime - 1)}
                className="btn btn-xs btn-outline join-item num"
              >
                -1s
              </button>
              <input
                type="text"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                onBlur={() => {
                  const parsed = parseMmSsMs(endInput, endTime);
                  onChangeRange(startTime, parsed);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const parsed = parseMmSsMs(endInput, endTime);
                    onChangeRange(startTime, parsed);
                  }
                }}
                className="input input-xs join-item w-24 text-center num"
              />
              <button
                type="button"
                onClick={() => onChangeRange(startTime, endTime + 1)}
                className="btn btn-xs btn-outline join-item num"
              >
                +1s
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
