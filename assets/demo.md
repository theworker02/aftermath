# Demo assets

## Storyboard (checked in)

- [`demo-storyboard.svg`](./demo-storyboard.svg) — four-panel textual storyboard for README / docs when a GIF is not yet recorded.
- [`demo-transcript.txt`](./demo-transcript.txt) — console-style walkthrough of the broken-project loop.

## Recording `demo.gif`

From a clean checkout:

### 1. Prepare the example

```powershell
cd examples/broken-project
npm install
# From repo root after build:
node ../../dist/cli/index.js baseline --cwd .
```

Introduce the intentional regression (or follow the example README), then:

```powershell
node ../../dist/cli/index.js verify --cwd .
node ../../dist/cli/index.js repair-context 1 --cwd .
# fix → verify again
node ../../dist/cli/index.js compare --cwd .
```

### 2. Capture

Use any terminal recorder, for example:

- [VHS](https://github.com/charmbracelet/vhs) (cross-platform tape → GIF)
- [asciinema](https://asciinema.org/) + `agg` to GIF
- Windows: PowerShell + screen recorder cropping the terminal

Suggested length: 20–40 seconds. Save as `assets/demo.gif` (optional `assets/demo.mp4`).

### 3. README

Once `demo.gif` exists, embed it under the Demo section of the root README. Until then, link the storyboard SVG and transcript.
