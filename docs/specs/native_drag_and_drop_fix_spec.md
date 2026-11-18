# VORTEX (CreatorVault) — Native OS Drag-and-Drop Fix Specification (Guide for Hydrogen)

## 1. Root Cause Diagnosis: Why Drag-and-Drop Stops Immediately Outside the Pill

When dragging a completed output pill in Vortex to the Windows Desktop, File Explorer, or Adobe After Effects / Premiere Pro, the drag fails immediately as soon as the cursor leaves the pill. Three interacting issues cause this behavior:

### Root Cause A (Critical): Corrupted `DRAG_ICON_DATA_URL` in `electron/main.ts`
- **Location:** `electron/main.ts` (lines 165–166 and 346–351)
- **What happens:**
  1. In React (`src/components/ripper/JobQueueList.tsx:441` and `src/components/vectorizer/VectorizerModuleView.tsx:440`), `onDragStart` calls `e.preventDefault()` to cancel the browser's internal HTML5 drag and delegates to Electron's native OS file drag via `window.vortexApi.startNativeDrag(pill.filePath)` $\rightarrow$ `ipcRenderer.send('ondragstart', filePath)`.
  2. In `electron/main.ts`, the `ondragstart` handler creates the drag cursor icon with `nativeImage.createFromDataURL(DRAG_ICON_DATA_URL)`.
  3. However, `DRAG_ICON_DATA_URL` (`iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0...`) is a **corrupted PNG**: its `IDAT` chunk header declares 77 bytes (`0x4d`) while only 73 bytes exist before `IEND`, and its zlib stream fails decompression with `Z_DATA_ERROR: invalid bit length repeat`.
  4. Because PNG decoding fails, `nativeImage.createFromDataURL(DRAG_ICON_DATA_URL)` returns an **empty `NativeImage`** (`icon.isEmpty() === true`, dimensions `0×0`).
  5. Inside Electron's C++ implementation (`WebContents::StartDrag` in `shell/browser/api/electron_api_web_contents.cc`), Electron checks `if (icon.IsEmpty()) return;` and **silently aborts without starting the Windows OLE `DoDragDrop` loop**.
  6. Because `e.preventDefault()` already cancelled the DOM drag and `webContents.startDrag()` silently aborted in the main process, **no drag session exists at all**. While the mouse button is held inside the pill, CSS `:active` makes the button look pressed; the instant the cursor crosses the pill border, `:active` ends and nothing is dragged.

### Root Cause B: Child SVG / Span Hit-Targets & Global `user-select: none`
- **Location:** `src/components/ripper/JobQueueList.tsx` (lines 437–451), `src/components/vectorizer/VectorizerModuleView.tsx` (lines 437–449), and `src/index.css` (line 88)
- **What happens:**
  1. `body` in `src/index.css` and `.btn` in DaisyUI apply `user-select: none` (`-webkit-user-select: none`).
  2. Inside the `<div draggable>` pill, child elements (`<GripVertical />` SVG, `<Icon />` SVG, and `<span>{pill.label}</span>`) capture pointer events. In Chromium, initiating a drag directly on an inner `<svg>` or `<span>` when `user-select: none` is active can fail to trigger `dragstart` on the parent `<div>` unless the parent explicitly sets `-webkit-user-drag: element` and children have `pointer-events: none`.

### Root Cause C: Packaged Binary (`release/win-unpacked/Vortex.exe`) Out of Sync
- After fixing `electron/main.ts` and the React components, both `dist-electron/main.js` and `release/win-unpacked/Vortex.exe` must be rebuilt via `npm run dist:win` so the standalone Windows executable runs the updated main-process drag handler.

---

## 2. Step-by-Step Implementation Instructions for Hydrogen

### Step 1: Fix `DRAG_ICON_DATA_URL` and Harden `ondragstart` in `electron/main.ts`

1. Replace the corrupted `DRAG_ICON_DATA_URL` (lines 164–166 in `electron/main.ts`) with a verified valid 32×32 PNG data URL **and** a programmatic `createDragIcon()` helper that falls back to `nativeImage.createFromBitmap()` if `icon.isEmpty()` is ever true.
2. In `ipcMain.on('ondragstart', ...)` (lines 335–352 in `electron/main.ts`), normalize the Windows path, verify the file exists on disk, and invoke `event.sender.startDrag({ file: validPath, icon })`.

#### Target in `electron/main.ts` (lines 164–166):
```typescript
// Embedded 32x32 high-contrast badge PNG data URL used for native OS drag-and-drop cursor icon
const DRAG_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAABNSURBVHgB7dYxDQAACANB9l96F3gQ4J3cT0J2524B2A0gIIAAG0BAAAHeAAICCLABBMR7A0BAAAG2gIAAArwBAgIIsAEEBBDgD3gB+8YHhX198cQAAAAASUVORK5CYII=';
```

#### Replacement in `electron/main.ts`:
```typescript
// Verified valid 32x32 RGBA PNG data URL for native OS drag-and-drop cursor icon
export const DRAG_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAQElEQVR42mNgGAWjAA1Y7P3xn5aYKAfwlUx4Rgs86oBRB4w6YNQBow4YdcCoA0YdMOqAUQcMHQcMaLN8FIw4AAA3T8XtROFoGgAAAABJRU5ErkJggg==';

function getValidDragIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromDataURL(DRAG_ICON_DATA_URL);
  if (!icon.isEmpty()) {
    return icon;
  }
  // Guaranteed non-empty 32x32 BGRA bitmap fallback so WebContents::StartDrag never aborts
  const width = 32;
  const height = 32;
  const bgra = Buffer.alloc(width * height * 4);
  for (let y = 4; y < 28; y++) {
    for (let x = 4; x < 28; x++) {
      const idx = (y * width + x) * 4;
      const isBorder = x === 4 || x === 27 || y === 4 || y === 27;
      bgra[idx] = isBorder ? 248 : 144;     // B
      bgra[idx + 1] = isBorder ? 189 : 116; // G
      bgra[idx + 2] = isBorder ? 56 : 14;   // R
      bgra[idx + 3] = 255;                  // A
    }
  }
  return nativeImage.createFromBitmap(bgra, { width, height });
}
```

#### Target in `electron/main.ts` (lines 334–352):
```typescript
// Native OS Drag-to-Timeline (Premiere Pro / After Effects / Resolve / Explorer)
ipcMain.on('ondragstart', (event, filePath: string) => {
  if (!filePath) return;
  const resolved = path.resolve(filePath);

  // Ensure file exists on disk before initiating native OS file drag
  const rawValidPath = fs.existsSync(resolved)
    ? resolved
    : ffmpegRunner.writeValidSimulatedMedia(resolved, 5, 220);
  const validPath = path.normalize(path.resolve(rawValidPath));
  approveFilePath(validPath);

  const icon = nativeImage.createFromDataURL(DRAG_ICON_DATA_URL);
  event.sender.startDrag({
    file: validPath,
    files: [validPath],
    icon
  });
});
```

#### Replacement in `electron/main.ts`:
```typescript
// Native OS Drag-to-Timeline (Premiere Pro / After Effects / Resolve / Explorer)
ipcMain.on('ondragstart', (event, filePath: string) => {
  if (!filePath || typeof filePath !== 'string') return;
  const resolved = path.resolve(filePath);

  // Ensure file exists on disk before initiating native OS file drag
  const rawValidPath = fs.existsSync(resolved)
    ? resolved
    : ffmpegRunner.writeValidSimulatedMedia(resolved, 5, 220);
  const validPath = path.normalize(path.resolve(rawValidPath));
  if (!fs.existsSync(validPath)) return;
  approveFilePath(validPath);

  const icon = getValidDragIcon();
  event.sender.startDrag({
    file: validPath,
    icon
  });
});
```

---

### Step 2: Add Explicit `-webkit-user-drag: element` Utility in `src/index.css`

In `src/index.css` (after `.app-no-drag` around line 105), add `.native-drag-pill` so every draggable output pill forces Chromium element-dragging even inside `user-select: none` containers and disables pointer target interception on child icons/text:

```css
.native-drag-pill {
  -webkit-user-drag: element;
  user-select: none;
  -webkit-app-region: no-drag;
}

.native-drag-pill > * {
  pointer-events: none;
}
```

---

### Step 3: Update Draggable Output Pills in `src/components/ripper/JobQueueList.tsx`

In `src/components/ripper/JobQueueList.tsx` (lines 434–452), update the pill element so:
1. It uses `draggable={true}` and the `.native-drag-pill` class.
2. It has a distinct blue accent pill appearance (`border-accent/50 bg-accent/10 hover:bg-accent/20 text-base-content`) matching the user's expectation for the blue drag-and-drop pill.
3. `onDragStart` calls `e.preventDefault()` and `window.vortexApi?.startNativeDrag(pill.filePath)`.

#### Target in `src/components/ripper/JobQueueList.tsx` (lines 434–452):
```tsx
            {job.pills.map((pill) => {
              const Icon = getPillIcon(pill.type);
              return (
                <div
                  key={pill.id}
                  draggable
                  onDragStart={(e) => {
                    e.preventDefault();
                    window.vortexApi?.startNativeDrag(pill.filePath);
                  }}
                  title={`Click and drag "${pill.fileName}" straight into Premiere Pro, After Effects, DaVinci Resolve, FL Studio, or Desktop.\nPath: ${pill.filePath}`}
                  className="btn btn-xs btn-outline gap-1.5 cursor-grab active:cursor-grabbing font-normal num"
                >
                  <GripVertical className="w-3 h-3 opacity-60" />
                  <Icon className="w-3.5 h-3.5 text-accent" />
                  <span>{pill.label}</span>
                </div>
              );
            })}
```

#### Replacement in `src/components/ripper/JobQueueList.tsx`:
```tsx
            {job.pills.map((pill) => {
              const Icon = getPillIcon(pill.type);
              return (
                <div
                  key={pill.id}
                  draggable={true}
                  onDragStart={(e) => {
                    e.preventDefault();
                    window.vortexApi?.startNativeDrag(pill.filePath);
                  }}
                  title={`Click and drag "${pill.fileName}" straight into Premiere Pro, After Effects, DaVinci Resolve, FL Studio, or Desktop.\nPath: ${pill.filePath}`}
                  className="native-drag-pill btn btn-xs border border-accent/50 bg-accent/15 hover:bg-accent/25 text-base-content gap-1.5 cursor-grab active:cursor-grabbing font-normal num"
                >
                  <GripVertical className="w-3 h-3 opacity-70 pointer-events-none" />
                  <Icon className="w-3.5 h-3.5 text-accent pointer-events-none" />
                  <span className="pointer-events-none">{pill.label}</span>
                </div>
              );
            })}
```

---

### Step 4: Update Vectorizer Draggable Pill in `src/components/vectorizer/VectorizerModuleView.tsx`

In `src/components/vectorizer/VectorizerModuleView.tsx` (lines 437–449), apply the same `.native-drag-pill` and `pointer-events-none` child protection:

#### Target in `src/components/vectorizer/VectorizerModuleView.tsx` (lines 437–449):
```tsx
            <div
              draggable
              onDragStart={(e) => {
                e.preventDefault();
                window.vortexApi?.startNativeDrag(lastVectorPreview.outputPath);
              }}
              className="btn btn-xs btn-outline gap-1.5 cursor-grab active:cursor-grabbing num"
              title="Drag processed output directly into Illustrator, Figma, After Effects, or Explorer"
            >
              <GripVertical className="w-3 h-3 opacity-60" />
              <span>Drag result to canvas</span>
            </div>
```

#### Replacement in `src/components/vectorizer/VectorizerModuleView.tsx`:
```tsx
            <div
              draggable={true}
              onDragStart={(e) => {
                e.preventDefault();
                window.vortexApi?.startNativeDrag(lastVectorPreview.outputPath);
              }}
              className="native-drag-pill btn btn-xs border border-accent/50 bg-accent/15 hover:bg-accent/25 text-base-content gap-1.5 cursor-grab active:cursor-grabbing num"
              title="Drag processed output directly into Illustrator, Figma, After Effects, or Explorer"
            >
              <GripVertical className="w-3 h-3 opacity-70 pointer-events-none" />
              <span className="pointer-events-none">Drag result to canvas</span>
            </div>
```

---

### Step 5: Add a Regression Unit Test in `tests/self-check.test.mjs`

Add a test in `tests/self-check.test.mjs` that extracts `DRAG_ICON_DATA_URL` from `electron/main.ts`, parses its PNG `IHDR` and `IDAT` chunks, and runs `zlib.inflateSync` to guarantee the embedded drag icon is a valid, non-corrupted 32×32 RGBA PNG (inflating to `32 * (1 + 32 * 4) = 4128` bytes):

```javascript
test('DRAG_ICON_DATA_URL in electron/main.ts is a valid non-empty 32x32 PNG', () => {
  const mainSrc = fs.readFileSync(path.join(process.cwd(), 'electron', 'main.ts'), 'utf8');
  const match = mainSrc.match(/DRAG_ICON_DATA_URL\s*=\s*['"]data:image\/png;base64,([^'"]+)['"]/);
  assert.ok(match, 'DRAG_ICON_DATA_URL must be defined in electron/main.ts');
  const pngBuf = Buffer.from(match[1], 'base64');
  assert.deepEqual(pngBuf.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const idatIdx = pngBuf.indexOf('IDAT');
  assert.ok(idatIdx > 0, 'PNG must contain an IDAT chunk');
  const idatLen = pngBuf.readUInt32BE(idatIdx - 4);
  const inflated = zlib.inflateSync(pngBuf.subarray(idatIdx + 4, idatIdx + 4 + idatLen));
  assert.equal(inflated.length, 32 * (1 + 32 * 4));
});
```

---

## 3. Verification & Packaging Gate

After applying Steps 1–5, Hydrogen must execute:
1. `npx tsc --noEmit` — Confirm zero TypeScript errors.
2. `npm test` — Confirm all unit tests (including the PNG drag icon integrity check) pass.
3. `npm run dist:win` — Rebuild `dist/`, `dist-electron/`, and `release/win-unpacked/Vortex.exe` so the packaged Windows executable includes the fix.
