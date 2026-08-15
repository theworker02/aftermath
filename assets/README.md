# Brand guidelines

Aftermath branding is forensic and calm — evidence over spectacle.

## Palette

| Token | Hex | Use |
|-------|-----|-----|
| Background | `#0B0F14` | Primary dark field |
| Panel | `#151C24` | Secondary surfaces |
| Ink | `#E8EEF5` | Primary text / mark stroke |
| Muted | `#9BB0C2` | Supporting copy |
| Line | `#2A3542` | Hairlines / borders |
| Steel | `#7C9CB4` | Secondary accent (instrument marks) |
| Accent | `#A8C5A2` | Pass / ready signal (sparingly) |

Do **not** default to purple gradients, neon glow, cream+terracotta editorial themes, or emoji-led marks.

## Logo system

| Asset | Role |
|-------|------|
| `logo-mark.svg` | Compact A / evidence mark (favicons, status) |
| `logo.svg` | Full lockup when space allows |
| `logo-dark.svg` / `logo-light.svg` | Theme-specific variants |
| `banner.svg` | Social / README hero (1280×640) |
| `marketplace-icon.png` | Generated marketplace icon |
| `social-preview.png` | Generated OG / social preview |

Canonical sources are **SVG**. PNGs are generated via:

```bash
npm run prepare-assets
```

## Usage

**Do**

- Keep generous dark field around the mark
- Pair the wordmark with the tagline *Trust the evidence, not the completion message.*
- Use monospace for instrument-like UI (verdicts, receipts, CLI)
- Prefer Georgia / Iowan-style serif for display headlines on marketing surfaces

**Don't**

- Recolor the mark to high-saturation purple or neon green
- Place the mark on busy photography without a dark scrim
- Stretch or rotate the logo
- Add drop shadows, glows, or stickers on top of the mark

## Voice

- Vocabulary: Run · Receipt · Finding · Evidence · Baseline · Gate · Repair Context
- Prefer short declarative sentences
- Never claim “AI-powered smart analysis” — Aftermath executes gates and records outcomes

## Website / OG

Site pages should include:

- Favicon → `logo-mark.svg`
- `og:title`, `og:description`, `og:image` → social preview / banner
- Shared header/footer with Docs · Install · Security · Privacy · Changelog · GitHub
