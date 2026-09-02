/**
 * Pure geometry for the rewards map — no React, no DOM, so the bezier math
 * and text wrapping are trivially unit-testable independent of rendering.
 */

export interface Point {
  x: number;
  y: number;
}

export type MapOrientation = "horizontal" | "vertical";

const SEAL_COUNT = 6; // fixed: 6 seeded milestones, plus one "origin" (0 points) waypoint = 7 points on the path

// Real pixel dimensions, not viewBox-relative percentages — the map is
// wrapped in an `overflow-x-auto`/`overflow-y-auto` container (the same
// pattern `Table` already uses) so text never has to shrink below a
// readable size to "fit"; a too-narrow viewport scrolls instead.
export const HORIZONTAL_MAP = { width: 960, height: 320, margin: 90 };
export const VERTICAL_MAP = { width: 340, height: 1040, margin: 90 };

/** 7 points: an origin (0 credits) plus the 6 milestones, in a gentle single-period wave. */
export function computeWaypoints(orientation: MapOrientation): Point[] {
  const dims = orientation === "horizontal" ? HORIZONTAL_MAP : VERTICAL_MAP;
  const primaryAxisLength =
    (orientation === "horizontal" ? dims.width : dims.height) - dims.margin * 2;
  const crossAxisCenter = (orientation === "horizontal" ? dims.height : dims.width) / 2;
  // Smaller amplitude on the cross axis when it's the narrow mobile width —
  // there isn't the lateral room a desktop layout has.
  const amplitude = orientation === "horizontal" ? 60 : 45;

  const points: Point[] = [];
  for (let i = 0; i <= SEAL_COUNT; i++) {
    const t = i / SEAL_COUNT;
    const primary = dims.margin + t * primaryAxisLength;
    const cross = crossAxisCenter - amplitude * Math.sin(t * Math.PI * 2);
    points.push(orientation === "horizontal" ? { x: primary, y: cross } : { x: cross, y: primary });
  }
  return points;
}

/**
 * Smooth-curve control points between consecutive waypoints — a horizontal
 * (or vertical) tangent at each anchor, which reliably produces a flowing
 * curve through an arbitrary sequence of points without full Catmull-Rom.
 */
function segmentControlPoints(p0: Point, p1: Point, orientation: MapOrientation): [Point, Point] {
  if (orientation === "horizontal") {
    const midX = (p0.x + p1.x) / 2;
    return [
      { x: midX, y: p0.y },
      { x: midX, y: p1.y },
    ];
  }
  const midY = (p0.y + p1.y) / 2;
  return [
    { x: p0.x, y: midY },
    { x: p1.x, y: midY },
  ];
}

/** The `d` attribute for the full path, as one M followed by SEAL_COUNT cubic C segments. */
export function buildPathD(waypoints: Point[], orientation: MapOrientation): string {
  if (waypoints.length === 0) return "";
  const first = waypoints[0];
  if (!first) return "";
  const segments = [`M ${String(first.x)},${String(first.y)}`];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p0 = waypoints[i];
    const p1 = waypoints[i + 1];
    if (!p0 || !p1) continue;
    const [cp1, cp2] = segmentControlPoints(p0, p1, orientation);
    segments.push(
      `C ${String(cp1.x)},${String(cp1.y)} ${String(cp2.x)},${String(cp2.y)} ${String(p1.x)},${String(p1.y)}`,
    );
  }
  return segments.join(" ");
}

function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

export interface MarkerInput {
  /** pointsRequired for each of the 6 milestones, in level order. */
  thresholds: number[];
  creditPoints: number;
}

/**
 * The marker's position: proportionally between the last waypoint reached
 * and the next one, walking the actual bezier segment (not a straight-line
 * approximation between the two anchor points).
 */
export function computeMarkerPosition(
  waypoints: Point[],
  { thresholds, creditPoints }: MarkerInput,
  orientation: MapOrientation,
): Point {
  const origin = waypoints[0];
  if (!origin) return { x: 0, y: 0 };

  // Index into `waypoints` (0 = origin, 1..6 = milestones) of the last
  // threshold reached.
  let lastIndex = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if ((thresholds[i] ?? Infinity) <= creditPoints) {
      lastIndex = i + 1;
    }
  }

  const last = waypoints[lastIndex];
  const next = waypoints[lastIndex + 1];
  if (!last) return origin;
  if (!next) return last; // every milestone reached — sit at the final seal

  const lastPoints = lastIndex === 0 ? 0 : (thresholds[lastIndex - 1] ?? 0);
  const nextPoints = thresholds[lastIndex] ?? lastPoints;
  const span = nextPoints - lastPoints;
  const fraction = span <= 0 ? 1 : Math.min(1, Math.max(0, (creditPoints - lastPoints) / span));

  const [cp1, cp2] = segmentControlPoints(last, next, orientation);
  return cubicBezierPoint(last, cp1, cp2, next, fraction);
}

/** Greedy word-wrap for SVG <text>/<tspan> — no browser line-wrapping exists for SVG text. */
export function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines - 1 && lines.length > 0) {
      // Let the final line run long rather than silently dropping words.
    }
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;

  const truncated = lines.slice(0, maxLines);
  const lastIndex = truncated.length - 1;
  const last = truncated[lastIndex];
  if (last !== undefined) {
    truncated[lastIndex] = last.length > 3 ? `${last.slice(0, last.length - 1)}…` : `${last}…`;
  }
  return truncated;
}

/**
 * Deterministic, hand-picked per-level variation so the six seals don't
 * look stamped from one template — never randomized at runtime (screenshots
 * and tests must render identically every time).
 */
const CRACK_JITTER: readonly [number, number, number][] = [
  [-3, 2, -4],
  [4, -2, 3],
  [-2, 4, -3],
  [3, -4, 2],
  [-4, 3, -2],
  [2, -3, 4],
];
const CRACK_ROTATION_DEG: readonly number[] = [1.5, -2, 1, -1.5, 2, -1];

export function crackJitterForLevel(levelNumber: number): [number, number, number] {
  const idx = (levelNumber - 1) % CRACK_JITTER.length;
  return CRACK_JITTER[idx] ?? [0, 0, 0];
}

export function crackRotationForLevel(levelNumber: number): number {
  const idx = (levelNumber - 1) % CRACK_ROTATION_DEG.length;
  return CRACK_ROTATION_DEG[idx] ?? 0;
}

export interface CrackPieces {
  /** The piece whose bulk sits on the -x side of the jagged break line. */
  leftD: string;
  /** The piece whose bulk sits on the +x side. */
  rightD: string;
}

/**
 * Splits a circle of the given radius (centered on the seal's own local
 * origin) into two irregular pieces along a jagged line — a fracture, not a
 * clean diameter. The three jitter values offset the break line at the
 * quarter/half/three-quarter height so consecutive seals, given different
 * jitter triples, don't read as stamped from one template.
 */
export function buildCrackPieces(radius: number, jitter: [number, number, number]): CrackPieces {
  const [j1, j2, j3] = jitter;
  const top = `0,${String(-radius)}`;
  const bottom = `0,${String(radius)}`;
  const crackDown = `L ${String(j1)},${String(-radius / 2)} L ${String(j2)},0 L ${String(j3)},${String(radius / 2)}`;

  return {
    // Bottom back to top via the left (-x) semicircle: sweep-flag 1.
    leftD: `M ${top} ${crackDown} L ${bottom} A ${String(radius)},${String(radius)} 0 0,1 ${top} Z`,
    // Bottom back to top via the right (+x) semicircle: sweep-flag 0.
    rightD: `M ${top} ${crackDown} L ${bottom} A ${String(radius)},${String(radius)} 0 0,0 ${top} Z`,
  };
}
