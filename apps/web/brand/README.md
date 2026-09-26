# Brand masters

Source files for every logo and favicon in `apps/web/public/`. Nothing in `public/` is edited
by hand — regenerate with:

```bash
python apps/web/scripts/build-logo.py
```

| File                 | What it is                                                           |
| -------------------- | -------------------------------------------------------------------- |
| `logo-master.png`    | The full mark (ring, G, W2) in brand cyan `#00A2D0` on transparency  |
| `favicon-master.png` | The W alone — the simplified mark for the 16 and 32px favicon frames |

## Replacing with the designer's vector

Drop the vector in as `logo-master.svg` (and optionally `favicon-master.svg`) and re-run the
script. An `.svg` master wins over a `.png` of the same name. The app references only
`/logo.png` and the favicon files, so no code changes. SVG masters need `pip install cairosvg`.

## Where the PNG masters came from

The only source available was a 161×144 JPEG of the cyan mark on white. It is not in the repo;
rebuild the masters from it with `build-logo.py --from-jpeg <path>`. Method, no geometry redrawn:

- The logo is one ink on white, so each pixel is `a·cyan + (1−a)·white`. Cyan's red channel is
  0, so coverage is exact: `a = (255 − R) / 255`. Filling with pure `#00A2D0` at that alpha
  removes all JPEG colour fringing.
- The alpha is upscaled 4× (Lanczos), smoothed (σ 1.2) to remove the stair-steps, then its edge
  is steepened back to crisp.
- The W's right arm runs on into the 2's top bar. For the favicon it is cut at that join and the
  cut rounded to match the W's other stroke ends.

A 4× reconstruction is still a reconstruction: ask the designer for the vector original.

## Sizes

- 16px: the W, stroke thickened +0.4px per side (`FAVICON_16_GROW_PX`) so it holds its own
  next to round favicons in a tab strip. +0.6px starts closing the W's bottom notch.
- 32px: the W at its true weight.
- 48px, `apple-touch-icon.png` (180, cyan on the `deep` petrol, since iOS fills transparency
  with black), `logo.png` (512): the full mark.
