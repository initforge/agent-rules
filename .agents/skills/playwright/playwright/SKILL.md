---
name: playwright
description: Use when the task requires automating a real browser from the terminal (navigation, form filling, snapshots, screenshots, data extraction, UI-flow debugging) via playwright-cli, or using a persistent browser/Electron interaction through js_repl for fast iterative UI debugging.
---

# Master Playwright Skill (CLI & Interactive REPL)

This skill provides comprehensive instructions for browser and Electron automation using Playwright, covering both CLI automation scripts and persistent interactive debugging sessions (`js_repl`).

---

## 1. PRE-REQUISITES & INITIAL SETUP

Before proposing any commands, check if `npx` is available:
```bash
command -v npx >/dev/null 2>&1
```
If missing, request Node.js/npm installation. Once Node.js is present, run:
```bash
npm install playwright
# For web-only chromium:
# npx playwright install chromium
# For Electron app debugging:
# npm install --save-dev electron
```

For persistent interactive session debugging, verify `js_repl` is enabled in `~/.codex/config.toml`:
```toml
[features]
js_repl = true
```

---

## 2. INTERACTIVE REPL BOOTSTRAP (RUN ONCE IN REPL)

Use these variables to share Playwright handles across interactive cells. Use `var` for persistent bindings.

```javascript
var chromium;
var electronLauncher;
var browser;
var context;
var page;
var mobileContext;
var mobilePage;
var electronApp;
var appWindow;

try {
  ({ chromium, _electron: electronLauncher } = await import("playwright"));
  console.log("Playwright loaded successfully");
} catch (error) {
  throw new Error(`Could not load playwright. Run NPM setup first. Error: ${error}`);
}

var resetWebHandles = function () {
  context = undefined;
  page = undefined;
  mobileContext = undefined;
  mobilePage = undefined;
};

var ensureWebBrowser = async function () {
  if (browser && !browser.isConnected()) {
    browser = undefined;
    resetWebHandles();
  }
  browser ??= await chromium.launch({ headless: false });
  return browser;
};

var reloadWebContexts = async function () {
  for (const currentContext of [context, mobileContext]) {
    if (!currentContext) continue;
    for (const p of currentContext.pages()) {
      await p.reload({ waitUntil: "domcontentloaded" });
    }
  }
  console.log("Reloaded all active tabs");
};
```

---

## 3. SESSION CONFIGURATION & LAUNCH

### Desktop Web Context
```javascript
var TARGET_URL = "http://127.0.0.1:3000"; // Prefer IP over localhost

if (page?.isClosed()) page = undefined;

await ensureWebBrowser();
context ??= await browser.newContext({
  viewport: { width: 1600, height: 900 },
});
page ??= await context.newPage();
await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
console.log("Loaded desktop web:", await page.title());
```

### Mobile Web Context
```javascript
var MOBILE_TARGET_URL = typeof TARGET_URL === "string" ? TARGET_URL : "http://127.0.0.1:3000";

if (mobilePage?.isClosed()) mobilePage = undefined;

await ensureWebBrowser();
mobileContext ??= await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
mobilePage ??= await mobileContext.newPage();
await mobilePage.goto(MOBILE_TARGET_URL, { waitUntil: "domcontentloaded" });
console.log("Loaded mobile web:", await mobilePage.title());
```

### Electron Session (Native Windows)
Set `ELECTRON_ENTRY` to `.` or path to your main process script (e.g. `./main.js`).
```javascript
var ELECTRON_ENTRY = ".";

if (appWindow?.isClosed()) appWindow = undefined;
if (!appWindow && electronApp) {
  await electronApp.close().catch(() => {});
  electronApp = undefined;
}

electronApp ??= await electronLauncher.launch({
  args: [ELECTRON_ENTRY],
});
appWindow ??= await electronApp.firstWindow();
console.log("Loaded Electron window:", await appWindow.title());
```

---

## 4. SCREENSHOT NORMALIZATION (CSS-PIXEL SCALING)
**CRITICAL FOR EYE COORDINATE ALIGNMENT:** headed native-window screenshots can return device-pixel sized buffers (e.g. Retina displays), mismatching Playwright CSS coordinates. Always scale screenshots to CSS pixels before emitting.

### Web CSS Normalization Helper
```javascript
var emitJpeg = async function (bytes) {
  await codex.emitImage({
    bytes,
    mimeType: "image/jpeg",
    detail: "original",
  });
};

var emitWebScreenshotCssScaled = async function ({ page, clip, quality = 0.85 } = {}) {
  var NodeBuffer = (await import("node:buffer")).Buffer;
  const target = clip
    ? { width: clip.width, height: clip.height }
    : await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));

  const screenshotBuffer = await page.screenshot({
    type: "png",
    ...(clip ? { clip } : {}),
  });

  const bytes = await page.evaluate(
    async ({ imageBase64, targetWidth, targetHeight, quality }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${imageBase64}`;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
      return new Uint8Array(await blob.arrayBuffer());
    },
    {
      imageBase64: NodeBuffer.from(screenshotBuffer).toString("base64"),
      targetWidth: target.width,
      targetHeight: target.height,
      quality,
    }
  );

  await emitJpeg(bytes);
};
```

### Electron CSS Normalization Helper
```javascript
var emitElectronScreenshotCssScaled = async function ({ electronApp, clip, quality = 85 } = {}) {
  const bytes = await electronApp.evaluate(async ({ BrowserWindow }, { clip, quality }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const image = clip ? await win.capturePage(clip) : await win.capturePage();
    const target = clip
      ? { width: clip.width, height: clip.height }
      : (() => {
          const [width, height] = win.getContentSize();
          return { width, height };
        })();

    const resized = image.resize({
      width: target.width,
      height: target.height,
      quality: "best",
    });
    return resized.toJPEG(quality);
  }, { clip, quality });

  await emitJpeg(bytes);
};
```

---

## 5. QA CHECKLISTS & SIGN-OFF

### A. Functional QA Checklist
- [ ] Establish a QA Inventory listing every user control, route, and interactive state.
- [ ] Test the full interactive cycle (state change -> verify -> revert to initial state).
- [ ] Perform a 30-90 second exploratory pass on the running app.
- [ ] Verify error states, dynamic validation, and dynamic/empty data tables.

### B. Visual QA & Viewport Fit Checklist
- [ ] Verify that no required UI regions are clipped, cropped, or cut off.
- [ ] Scroll fit: scrolling is fine for content, but fixed shells/header toolbars must never scroll or clip.
- [ ] Inspect the layout at minimum supported screen width (e.g. mobile 390px, desktop 1280px).
- [ ] Check color contrast, typography alignment, icon scaling, and font size stability.

Run this code in REPL to extract page-level viewport and scroll metrics:
```javascript
console.log(await page.evaluate(() => ({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  scrollWidth: document.documentElement.scrollWidth,
  scrollHeight: document.documentElement.scrollHeight,
  canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  canScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
})));
```

---

## 6. CLEANUP COMMAND
Always close sessions before exiting to avoid leaving orphaned background browser processes running:
```javascript
if (electronApp) await electronApp.close().catch(() => {});
if (mobileContext) await mobileContext.close().catch(() => {});
if (context) await context.close().catch(() => {});
if (browser) await browser.close().catch(() => {});

browser = undefined;
context = undefined;
page = undefined;
mobileContext = undefined;
mobilePage = undefined;
electronApp = undefined;
appWindow = undefined;
console.log("Playwright session closed cleanly.");
```
