import { motion } from "framer-motion";
import { useId } from "react";
import {
  buildCrackPieces,
  crackJitterForLevel,
  crackRotationForLevel,
  dripAttachmentPoint,
  dripPath,
  dripsForLevel,
  waxEdgeSeedForLevel,
} from "../lib/rewardsMapGeometry";

const RADIUS = 40;
const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;

export type SealWeight = "hero" | "normal" | "quiet";

export interface SealProps {
  levelNumber: number;
  /** `true` once this seal should render its final broken-open state. */
  broken: boolean;
  /** `true` only for a just-unlocked, not-yet-seen seal actually playing its break animation right now. */
  animate: boolean;
  animationDelaySeconds: number;
  animationDurationSeconds: number;
  /**
   * hero = the next milestone; quiet = locked and not next; normal =
   * already broken. Weight is conveyed through actual size (the `size`
   * prop, set by the caller) and colour saturation here, never through
   * opacity — a locked seal is still real wax, just cooler and unearned,
   * not a faded-out disabled control.
   */
  weight: SealWeight;
  /** Ambient pulse on the hero seal's edge — never on anything else, and never under reduced motion. */
  pulse: boolean;
  size?: number;
}

// Warm (earned or about-to-be-earned) vs. cool (locked, not next) — the
// only colour distinction "quiet" seals get. Same edge, same depth, same
// drips; just a desaturated, cooler tone instead of a faded one.
const ACCENT_WARM = "#A9752E";
const ACCENT_COOL = "#8C8172";
const EMBLEM_WARM_INTACT = "#8a611f";
const EMBLEM_WARM_BROKEN = "#6b4b18";
const EMBLEM_COOL = "#716858";

/**
 * The seal art only — purely decorative (aria-hidden, no text content a
 * screen reader needs; the level/points/reward text lives in the real DOM
 * row around it). Wax character comes from several layered, deterministic
 * (never Math.random) SVG effects:
 *
 * - An irregular edge, drips, AND depth are all produced by *one* filter
 *   per shape (`buildShapeFilter`), applied separately to the intact
 *   circle and to each broken piece individually — never to a group
 *   spanning both pieces. Two earlier bugs both came from sharing state
 *   across the gap: a shared filter region let the turbulence
 *   displacement smear piece content into the gap, and a shared shadow
 *   circle sitting behind both pieces kept showing through the gap as a
 *   grey shape once they separated. Scoping *everything* — edge
 *   distortion and the shadow it casts — to each shape's own filter,
 *   applied to that shape alone, is what makes the gap genuinely empty:
 *   there is nothing left that spans it.
 * - Domed depth without a facial read: no discrete highlight/shadow arcs
 *   (an arc low on the form reads as a mouth once there's anything below
 *   it — drips read as a chin, the emblem as a nose). Instead each shape
 *   is filled with a radial gradient whose light source sits in the upper
 *   third — a soft, continuous falloff, not a drawn line, so there's no
 *   discrete feature for a face to assemble out of.
 * - Drips spread across most of the lower rim (not clustered at the
 *   bottom center) so they don't read as a chin.
 * - An engraved emblem: the level number, recessed via a dark shadow on
 *   its light-facing (top-left) edge and a faint highlight on its far
 *   (bottom-right) edge.
 */
export function Seal({
  levelNumber,
  broken,
  animate,
  animationDelaySeconds,
  animationDurationSeconds,
  weight,
  pulse,
  size = 90,
}: SealProps) {
  const uid = useId().replace(/:/g, "");
  const jitter = crackJitterForLevel(levelNumber);
  const rotation = crackRotationForLevel(levelNumber);
  const seed = waxEdgeSeedForLevel(levelNumber);
  const { leftD, rightD } = buildCrackPieces(RADIUS, jitter);
  const drips = dripsForLevel(levelNumber);
  const leftDrips = drips.filter((d) => d.angleDeg < 0);
  const rightDrips = drips.filter((d) => d.angleDeg >= 0);

  const cool = weight === "quiet";
  const accent = cool ? ACCENT_COOL : ACCENT_WARM;
  const emblemColor = broken ? EMBLEM_WARM_BROKEN : cool ? EMBLEM_COOL : EMBLEM_WARM_INTACT;

  const transition = animate
    ? { delay: animationDelaySeconds, duration: animationDurationSeconds, ease: "easeOut" as const }
    : { duration: 0 };

  // Only x/y/rotate — colour comes from a fixed gradient fill (see below),
  // never animated, since a piece only ever exists in the DOM once it's
  // already broken (the intact circle is a separate element entirely) —
  // there's no "was paper, becomes brass" moment to interpolate.
  const groupVariants = {
    intact: { x: 0, y: 0, rotate: 0 },
    brokenLeft: { x: -7, y: 3.5, rotate: -rotation },
    brokenRight: { x: 7, y: -3.5, rotate: rotation },
  };

  const shapeFilterId = `shape-filter-${uid}`;
  const engraveId = `engrave-${uid}`;
  const paperGradId = `paper-grad-${uid}`;
  const brassGradId = `brass-grad-${uid}`;

  // transformBox: "view-box" + an explicit transformOrigin in the outer
  // SVG's own coordinate system is what makes rotation pivot around the
  // seal's true center (viewBox point 50,50, where the static translate
  // below places local (0,0)) rather than each piece's own asymmetric
  // fill-box center — the mismatch between the two was what made pieces
  // visibly overlap instead of rotating cleanly apart.
  const pivotStyle = {
    transformBox: "view-box" as const,
    transformOrigin: `${String(CENTER)}px ${String(CENTER)}px`,
  };

  function renderDrips(dripsToRender: typeof drips, fill: string) {
    return dripsToRender.map((drip, i) => {
      const point = dripAttachmentPoint(RADIUS, drip);
      return (
        <path
          key={i}
          d={dripPath(drip.width, drip.length)}
          transform={`translate(${String(point.x)},${String(point.y)})`}
          fill={fill}
        />
      );
    });
  }

  return (
    <motion.svg
      viewBox={`0 0 ${String(VIEWBOX)} ${String(VIEWBOX)}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ overflow: "visible" }}
    >
      <defs>
        {/*
          colorInterpolationFilters="sRGB": SVG filters default to
          linearRGB, and alpha-composite chains like this one render their
          filter region as a visible opaque grey box in Chromium under
          linearRGB instead of the intended result. sRGB is what every
          such recipe on the web assumes.

          One filter, applied per-shape (never to a group spanning both
          broken pieces): edge turbulence, then a shadow derived from that
          *same already-distorted, already-localized* shape alpha — blur,
          offset, flood, composite "in". Because the shadow's source is
          this shape's own alpha rather than a separately-drawn circle
          behind everything, it never extends past where this shape
          already is, so it can't bridge the gap between two separated
          pieces the way a shared backing shadow could.
        */}
        <filter
          id={shapeFilterId}
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves={2}
            seed={seed}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={7}
            xChannelSelector="R"
            yChannelSelector="G"
            result="distorted"
          />
          <feGaussianBlur in="distorted" stdDeviation={1.6} result="blurredForShadow" />
          <feOffset in="blurredForShadow" dx={1.8} dy={2.8} result="shadowOffset" />
          <feFlood floodColor="#241D1D" floodOpacity={0.32} result="shadowColor" />
          <feComposite in="shadowColor" in2="shadowOffset" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="distorted" />
          </feMerge>
        </filter>
        {/* Recessed, not raised: a dark shadow on the top-left (light-facing)
            edge and a faint light highlight on the bottom-right (far) edge —
            light falling into a depression and catching its far wall, the
            opposite of a normal raised emboss. */}
        <filter
          id={engraveId}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation={0.6} result="blurredAlpha" />
          <feOffset in="blurredAlpha" dx={-1.1} dy={-1.1} result="shadowShape" />
          <feFlood floodColor="#000000" floodOpacity={0.75} result="shadowColor" />
          <feComposite in="shadowColor" in2="shadowShape" operator="in" result="darkEdge" />
          <feOffset in="blurredAlpha" dx={0.9} dy={0.9} result="highlightShape" />
          <feFlood floodColor="#fff6e3" floodOpacity={0.55} result="highlightColor" />
          <feComposite in="highlightColor" in2="highlightShape" operator="in" result="lightEdge" />
          <feMerge>
            <feMergeNode in="lightEdge" />
            <feMergeNode in="darkEdge" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/*
          Domed lighting as a soft continuous gradient, not a drawn arc —
          an arc low on the form reads as a mouth once there's anything
          below it (drips as a chin, the emblem as a nose); a gradient has
          no edge to read as a feature at all. userSpaceOnUse, positioned
          in the seal's own local coordinate space (centered on 0,0, top
          of the circle at y=-40) so the "light source" sits consistently
          in the upper third for the intact circle and for each broken
          piece alike, however that piece has separately rotated.
        */}
        <radialGradient id={paperGradId} gradientUnits="userSpaceOnUse" cx={-8} cy={-20} r={62}>
          <stop offset="0%" stopColor="#fcfbf8" />
          <stop offset="55%" stopColor="#F0EFEC" />
          <stop offset="100%" stopColor="#d8d4ca" />
        </radialGradient>
        <radialGradient id={brassGradId} gradientUnits="userSpaceOnUse" cx={-8} cy={-20} r={62}>
          <stop offset="0%" stopColor="#dcb073" />
          <stop offset="45%" stopColor="#b8853a" />
          <stop offset="100%" stopColor="#84591d" />
        </radialGradient>
      </defs>

      {pulse && (
        <motion.circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS + 4}
          fill="none"
          stroke={ACCENT_WARM}
          strokeWidth={2}
          initial={{ opacity: 0.55, scale: 1 }}
          animate={{ opacity: [0.55, 0, 0.55], scale: [1, 1.12, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <g transform={`translate(${String(CENTER)},${String(CENTER)})`}>
        {broken ? (
          <>
            {/*
              Each piece is its own filtered group: path + the drips that
              belong to it, moved and rotated together as one rigid body,
              with the shape filter (edge distortion + its own shadow)
              applied to this group alone. Nothing is drawn in the gap
              at all: it's the true negative space between two shapes
              that simply moved apart, each carrying only its own effects.
            */}
            <motion.g
              filter={`url(#${shapeFilterId})`}
              style={pivotStyle}
              initial={animate ? "intact" : false}
              animate="brokenLeft"
              variants={groupVariants}
              transition={transition}
            >
              <path d={leftD} fill={`url(#${brassGradId})`} stroke="#8a611f" strokeWidth={1.2} />
              {renderDrips(leftDrips, `url(#${brassGradId})`)}
            </motion.g>
            <motion.g
              filter={`url(#${shapeFilterId})`}
              style={pivotStyle}
              initial={animate ? "intact" : false}
              animate="brokenRight"
              variants={groupVariants}
              transition={transition}
            >
              <path d={rightD} fill={`url(#${brassGradId})`} stroke="#8a611f" strokeWidth={1.2} />
              {renderDrips(rightDrips, `url(#${brassGradId})`)}
            </motion.g>
          </>
        ) : (
          <g filter={`url(#${shapeFilterId})`}>
            <circle
              cx={0}
              cy={0}
              r={RADIUS}
              fill={`url(#${paperGradId})`}
              stroke={accent}
              strokeWidth={2}
            />
            {renderDrips(drips, `url(#${paperGradId})`)}
          </g>
        )}
      </g>

      {/* The emblem — the level number, pressed into the wax. */}
      <text
        x={CENTER}
        y={CENTER + 10}
        textAnchor="middle"
        fontSize={34}
        fontFamily="'IBM Plex Serif', Georgia, serif"
        fill={emblemColor}
        filter={`url(#${engraveId})`}
      >
        {levelNumber}
      </text>
    </motion.svg>
  );
}
