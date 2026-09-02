/**
 * Pure, deterministic per-level variation for the certificate's wax seals —
 * no React, no DOM, so it's trivially unit-testable. Nothing here is
 * randomized at runtime (no `Math.random()`): every value is a fixed,
 * hand-picked table indexed by level, so the same seal renders identically
 * on every load, every test run, and every screenshot.
 */

/** feTurbulence seeds — drives the organic, hand-pressed wax edge (see Seal.tsx). Six distinct values so no two seals look stamped from one template. */
const WAX_EDGE_SEED: readonly number[] = [3, 17, 9, 24, 6, 31];

export function waxEdgeSeedForLevel(levelNumber: number): number {
  const idx = (levelNumber - 1) % WAX_EDGE_SEED.length;
  return WAX_EDGE_SEED[idx] ?? 1;
}

/**
 * Horizontal offsets (px, in the seal's own 0-100 local coordinate space)
 * for the three interior points of the fracture line, at the quarter/half/
 * three-quarter height — an irregular break, never a clean diameter.
 */
const CRACK_JITTER: readonly [number, number, number][] = [
  [-5, 3, -6],
  [6, -3, 5],
  [-3, 6, -4],
  [5, -6, 3],
  [-6, 4, -3],
  [3, -4, 6],
];

/** Degrees one piece rotates away from the other on break. */
const CRACK_ROTATION_DEG: readonly number[] = [5, -6, 4, -5, 6, -4];

export function crackJitterForLevel(levelNumber: number): [number, number, number] {
  const idx = (levelNumber - 1) % CRACK_JITTER.length;
  return CRACK_JITTER[idx] ?? [0, 0, 0];
}

export function crackRotationForLevel(levelNumber: number): number {
  const idx = (levelNumber - 1) % CRACK_ROTATION_DEG.length;
  return CRACK_ROTATION_DEG[idx] ?? 0;
}

export interface Point {
  x: number;
  y: number;
}

export interface Drip {
  /** Degrees from straight-down (0 = the rim's bottom-most point); negative leans left, positive leans right. */
  angleDeg: number;
  length: number;
  width: number;
}

/**
 * 2-4 small drips per level, spread across most of the lower rim — from
 * near the sides down to the bottom — rather than clustered at the
 * bottom center, which reads as a chin. Gravity still confines them to
 * the lower hemisphere (never past ±90°, i.e. never above the horizontal
 * midline), but within that they vary widely in angle, count, and length
 * so no two seals look stamped from one template.
 */
const DRIP_SETS: readonly Drip[][] = [
  [
    { angleDeg: -75, length: 7, width: 3 },
    { angleDeg: -10, length: 12, width: 4.5 },
    { angleDeg: 55, length: 4, width: 2 },
  ],
  [
    { angleDeg: -40, length: 5, width: 2.5 },
    { angleDeg: 20, length: 13, width: 5 },
    { angleDeg: 70, length: 6, width: 3 },
  ],
  [
    { angleDeg: -80, length: 4, width: 2 },
    { angleDeg: -25, length: 9, width: 3.5 },
    { angleDeg: 45, length: 7, width: 3 },
    { angleDeg: 80, length: 5, width: 2.5 },
  ],
  [
    { angleDeg: -60, length: 11, width: 4 },
    { angleDeg: 15, length: 3, width: 2 },
    { angleDeg: 50, length: 8, width: 3.5 },
  ],
  [
    { angleDeg: -30, length: 6, width: 3 },
    { angleDeg: 65, length: 10, width: 4 },
  ],
  [
    { angleDeg: -85, length: 5, width: 2 },
    { angleDeg: -5, length: 4, width: 2 },
    { angleDeg: 40, length: 12, width: 4.5 },
    { angleDeg: 75, length: 6, width: 3 },
  ],
];

export function dripsForLevel(levelNumber: number): readonly Drip[] {
  const idx = (levelNumber - 1) % DRIP_SETS.length;
  return DRIP_SETS[idx] ?? [];
}

/** Where a drip attaches on the rim, in the seal's local (0,0)-centered coordinate space. */
export function dripAttachmentPoint(radius: number, drip: Drip): Point {
  const rad = (drip.angleDeg * Math.PI) / 180;
  return { x: radius * Math.sin(rad), y: radius * Math.cos(rad) };
}

/**
 * A small teardrop, top-center at local (0,0), hanging straight down to
 * (0, length) — drips fall with gravity, not radially outward from the
 * rim point they started at, so this shape is never rotated to match its
 * attachment angle, only translated there.
 */
export function dripPath(width: number, length: number): string {
  const hw = width / 2;
  return `M ${String(-hw)},0 C ${String(-hw)},${String(length * 0.55)} ${String(-width * 0.18)},${String(length)} 0,${String(length)} C ${String(width * 0.18)},${String(length)} ${String(hw)},${String(length * 0.55)} ${String(hw)},0 Z`;
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
 * clean diameter. The wax-edge turbulence filter is applied to these paths
 * too (see Seal.tsx), which additionally roughens the fracture edges
 * themselves — "wax edges along the break are slightly lifted and
 * irregular" comes from that filter, not from extra geometry here.
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

/**
 * Given the six milestones' pointsRequired (ascending) and the user's
 * current total, returns the index (0-based) of the "next" milestone — the
 * one that gets the hero treatment — or -1 if every milestone is already
 * unlocked. Used by RewardsCertificate to decide which row is the hero,
 * and to compute that row's progress fraction.
 */
export function nextMilestoneIndex(thresholds: readonly number[], creditPoints: number): number {
  return thresholds.findIndex((threshold) => threshold > creditPoints);
}

/** Progress fraction (0-1) toward the milestone at `index`, given the previous threshold (0 if it's the first). */
export function progressFraction(
  thresholds: readonly number[],
  index: number,
  creditPoints: number,
): number {
  const threshold = thresholds[index];
  if (threshold === undefined) return 0;
  const previous = index === 0 ? 0 : (thresholds[index - 1] ?? 0);
  const span = threshold - previous;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (creditPoints - previous) / span));
}
