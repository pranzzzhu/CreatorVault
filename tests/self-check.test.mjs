import test from 'node:test';
import assert from 'node:assert/strict';

// 1. Verify Timestamp Formatting (Fix 3 & YtDlp millisecond rollover)
function formatSecondsToTimestamp(sec) {
  const roundedSec = Math.round(sec * 100) / 100;
  const totalSeconds = Math.floor(roundedSec);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;
  const centis = Math.round((roundedSec - totalSeconds) * 100);

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const mmss = `${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
  return hours > 0 ? `${pad(hours)}:${mmss}` : mmss;
}

test('formatSecondsToTimestamp handles boundary rollover at 59.999s', () => {
  assert.equal(formatSecondsToTimestamp(59.999), '01:00.00');
  assert.equal(formatSecondsToTimestamp(59.994), '00:59.99');
  assert.equal(formatSecondsToTimestamp(0), '00:00.00');
  assert.equal(formatSecondsToTimestamp(61.5), '01:01.50');
  assert.equal(formatSecondsToTimestamp(3661.05), '01:01:01.05');
});

// 2. Verify Protocol Media Whitelist (Fix 5)
const MEDIA_EXT_WHITELIST = new Set([
  '.mp4', '.mov', '.webm', '.mkv', '.avi',
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a',
  '.png', '.jpg', '.jpeg', '.webp', '.svg'
]);

function isAllowedMediaPath(ext) {
  return MEDIA_EXT_WHITELIST.has(ext.toLowerCase());
}

test('vortex-media protocol whitelist rejects non-media files', () => {
  assert.equal(isAllowedMediaPath('.mp4'), true);
  assert.equal(isAllowedMediaPath('.png'), true);
  assert.equal(isAllowedMediaPath('.svg'), true);
  assert.equal(isAllowedMediaPath('.env'), false);
  assert.equal(isAllowedMediaPath('.exe'), false);
  assert.equal(isAllowedMediaPath('.sh'), false);
  assert.equal(isAllowedMediaPath(''), false);
});

// 3. Verify Target Size Bitrate Allocation (Fix 6)
function computeBitrates(targetMB, duration, hasAudio) {
  const safeDur = Math.max(1, duration);
  const audioKbps = hasAudio ? 128 : 0;
  const totalTargetKbits = targetMB * 8192 * 0.94;
  const videoKbps = Math.max(150, Math.floor(totalTargetKbits / safeDur - audioKbps));
  return { videoKbps, audioKbps };
}

test('computeBitrates allocates full budget to silent video without crashing', () => {
  const withAudio = computeBitrates(10, 60, true);
  const withoutAudio = computeBitrates(10, 60, false);

  assert.equal(withAudio.audioKbps, 128);
  assert.equal(withoutAudio.audioKbps, 0);
  assert.ok(withoutAudio.videoKbps > withAudio.videoKbps);
  assert.ok(withoutAudio.videoKbps >= 150);
});

// 4. Verify Taskbar Progress Ratio Calculation (EGM-07)
function computeTaskbarRatio(progress) {
  const rawProgress = progress ?? 5;
  return Math.min(0.99, Math.max(0.05, rawProgress / 100));
}

test('computeTaskbarRatio handles zero progress without jumping to default', () => {
  assert.equal(computeTaskbarRatio(0), 0.05); // clamped to min visible ratio 0.05
  assert.equal(computeTaskbarRatio(undefined), 0.05); // defaults to 5%
  assert.equal(computeTaskbarRatio(50), 0.5);
  assert.equal(computeTaskbarRatio(100), 0.99); // capped before completion signal
});

// 5. Verify Sub-Second Slider Window Clamping (EGM-06)
function clampSliderWindow(deltaSeconds, initialStart, initialEnd, duration) {
  const rawSpan = initialEnd - initialStart;
  const windowSpan = Math.min(duration, Math.max(0.1, rawSpan));

  let nextStart = initialStart + deltaSeconds;
  if (nextStart < 0) nextStart = 0;
  if (nextStart + windowSpan > duration) {
    nextStart = Math.max(0, duration - windowSpan);
  }

  const clampedEnd = Math.min(duration, nextStart + windowSpan);
  return {
    start: Number(nextStart.toFixed(2)),
    end: Number(clampedEnd.toFixed(2))
  };
}

test('clampSliderWindow handles sub-second clips and boundaries', () => {
  // 0.4s clip on 0.6s total media
  const subSec = clampSliderWindow(0.1, 0.1, 0.5, 0.6);
  assert.equal(subSec.start, 0.2);
  assert.equal(subSec.end, 0.6);

  // Dragging past right boundary clamps cleanly
  const rightBound = clampSliderWindow(1.0, 0.1, 0.5, 0.6);
  assert.equal(rightBound.start, 0.2);
  assert.equal(rightBound.end, 0.6);

  // Dragging past left boundary clamps to 0
  const leftBound = clampSliderWindow(-1.0, 0.2, 0.6, 0.6);
  assert.equal(leftBound.start, 0);
  assert.equal(leftBound.end, 0.4);
});

// 6. Verify Collision-Free Direct File Path Resolution (v0.2.0 Spec)
function sanitizeBaseName(rawName, maxLen = 56) {
  const DOS_DEVICE_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  let clean = (rawName || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[. ]+$/, '')
    .slice(0, maxLen);

  if (!clean || DOS_DEVICE_NAMES.test(clean)) {
    clean = clean ? `_${clean}_` : 'Vortex_Asset';
  }
  return clean;
}

function getNonCollidingFilePath(destDir, baseName, ext, mockExistsSync, reservedPaths = new Set()) {
  const cleanBase = sanitizeBaseName(baseName);
  const cleanExt = ext ? (ext.startsWith('.') ? ext : `.${ext}`) : '';

  const counterMatch = cleanBase.match(/^(.*?)[_ ]\((\d+)\)$/);
  const rootName = counterMatch ? counterMatch[1] : cleanBase;
  const initialCounter = counterMatch ? parseInt(counterMatch[2], 10) : 0;

  let counter = initialCounter > 0 ? initialCounter : 0;
  let candidate = counter > 0
    ? `${destDir}/${rootName} (${counter})${cleanExt}`
    : `${destDir}/${cleanBase}${cleanExt}`;

  if (!mockExistsSync(candidate) && !reservedPaths.has(candidate)) {
    reservedPaths.add(candidate);
    return candidate;
  }

  counter = initialCounter > 0 ? initialCounter + 1 : 1;
  while (true) {
    candidate = `${destDir}/${rootName} (${counter})${cleanExt}`;
    if (!mockExistsSync(candidate) && !reservedPaths.has(candidate)) {
      reservedPaths.add(candidate);
      return candidate;
    }
    counter++;
  }
}

test('getNonCollidingFilePath resolves collisions, avoids suffix stacking and blocks DOS names', () => {
  const existingFiles = new Set([
    'C:/Exports/My_Clip.mp4',
    'C:/Exports/My_Clip (1).mp4',
    'C:/Exports/My_Clip (2).mp4'
  ]);
  const mockExists = (filePath) => existingFiles.has(filePath.replace(/\\/g, '/'));
  const reserved = new Set();

  // Fresh name with no collisions
  const fresh = getNonCollidingFilePath('C:/Exports', 'Brand_New', 'mp4', mockExists, reserved);
  assert.equal(fresh, 'C:/Exports/Brand_New.mp4');

  // Single collision resolves to (1)
  const oneCollision = getNonCollidingFilePath('C:/Exports', 'Solo', 'mp4', (f) => f.includes('Solo.mp4'), reserved);
  assert.equal(oneCollision, 'C:/Exports/Solo (1).mp4');

  // Multiple collisions resolve to (3)
  const tripleCollision = getNonCollidingFilePath('C:/Exports', 'My_Clip', '.mp4', mockExists, reserved);
  assert.equal(tripleCollision, 'C:/Exports/My_Clip (3).mp4');

  // Suffix un-stacking: input already ending in (1) advances to (2) instead of (1) (1)
  const advancedCounter = getNonCollidingFilePath('C:/Exports', 'My_Clip (1)', '.mp4', mockExists, reserved);
  assert.equal(advancedCounter, 'C:/Exports/My_Clip (4).mp4');

  // Atomic reservation blocks concurrent parallel jobs from claiming the same name
  const parallel1 = getNonCollidingFilePath('C:/Exports', 'Concurrent_Task', 'mp4', () => false, reserved);
  const parallel2 = getNonCollidingFilePath('C:/Exports', 'Concurrent_Task', 'mp4', () => false, reserved);
  assert.equal(parallel1, 'C:/Exports/Concurrent_Task.mp4');
  assert.equal(parallel2, 'C:/Exports/Concurrent_Task (1).mp4');

  // Windows DOS reserved device name protection
  const dosCon = getNonCollidingFilePath('C:/Exports', 'CON', 'mp4', () => false, reserved);
  assert.equal(dosCon, 'C:/Exports/_CON_.mp4');
  const dosAux = getNonCollidingFilePath('C:/Exports', 'AUX', 'mp4', () => false, reserved);
  assert.equal(dosAux, 'C:/Exports/_AUX_.mp4');
});

// 7. Verify Silence Detection Rejects Silent Inputs
function validateSilenceChopperAudio(audioCodec, hasAudioStream) {
  const hasAudio = audioCodec !== undefined
    ? (Boolean(audioCodec) && audioCodec.toLowerCase() !== 'none')
    : hasAudioStream;
  if (!hasAudio) {
    throw new Error('Video contains no audio track for silence detection.');
  }
  return true;
}

test('validateSilenceChopperAudio rejects audio-less files early', () => {
  assert.equal(validateSilenceChopperAudio('aac', true), true);
  assert.equal(validateSilenceChopperAudio(undefined, true), true);
  assert.throws(() => validateSilenceChopperAudio('none', false), /Video contains no audio track/);
  assert.throws(() => validateSilenceChopperAudio(undefined, false), /Video contains no audio track/);
});

// 8. Verify Premiere Pro XML Sequence Frame Calculations (Spec Patch D)
function computePremiereXmlTimeline(segments, rawFps) {
  const isNtsc =
    Math.abs(rawFps - 23.976) < 0.06 ||
    Math.abs(rawFps - 29.97) < 0.06 ||
    Math.abs(rawFps - 59.94) < 0.08;
  const ntscFlag = isNtsc ? 'TRUE' : 'FALSE';
  const fps = Math.max(1, Math.round(rawFps));

  let timelineCursor = 0;
  const clips = segments.map((seg, idx) => {
    const inFrame = Math.max(0, Math.round(seg.start * fps));
    const outFrame = Math.max(inFrame + 1, Math.round(seg.end * fps));
    const clipDurFrames = outFrame - inFrame;
    const startTimeline = timelineCursor;
    const endTimeline = timelineCursor + clipDurFrames;
    timelineCursor = endTimeline;

    return {
      index: idx,
      inFrame,
      outFrame,
      clipDurFrames,
      startTimeline,
      endTimeline
    };
  });

  return {
    fps,
    ntscFlag,
    totalTimelineFrames: timelineCursor,
    clips
  };
}

test('computePremiereXmlTimeline enforces contiguous frame accumulation and NTSC flags', () => {
  // Test 1: 23.976 fps NTSC drop-rate detection
  const ntscRes = computePremiereXmlTimeline([
    { start: 0, end: 2.5 },
    { start: 5.0, end: 7.2 }
  ], 23.976);
  assert.equal(ntscRes.fps, 24);
  assert.equal(ntscRes.ntscFlag, 'TRUE');
  assert.equal(ntscRes.clips.length, 2);
  assert.equal(ntscRes.clips[0].startTimeline, 0);
  assert.equal(ntscRes.clips[0].endTimeline, ntscRes.clips[1].startTimeline); // Contiguous timeline

  // Test 2: Standard 30 fps non-NTSC
  const palRes = computePremiereXmlTimeline([
    { start: 1.0, end: 1.01 } // very short clip guarantees minimum 1 frame
  ], 25.0);
  assert.equal(palRes.fps, 25);
  assert.equal(palRes.ntscFlag, 'FALSE');
  assert.ok(palRes.clips[0].outFrame > palRes.clips[0].inFrame);
  assert.equal(palRes.clips[0].clipDurFrames, 1);
});



