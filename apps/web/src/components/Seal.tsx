import { motion } from "framer-motion";
import {
  buildCrackPieces,
  crackJitterForLevel,
  crackRotationForLevel,
} from "../lib/rewardsMapGeometry";

const RADIUS = 22;

export interface SealProps {
  cx: number;
  cy: number;
  levelNumber: number;
  /** `true` once this seal should render its final broken-open state. */
  broken: boolean;
  /** `true` only for a just-unlocked, not-yet-seen seal actually playing its break animation right now. */
  animate: boolean;
  animationDelaySeconds: number;
  animationDurationSeconds: number;
  captionLines: string[];
  captionTone: "locked" | "reward";
}

/**
 * A wax-seal medallion: an irregular fracture line splits the disc into two
 * pieces (never a clean rotating diameter — see the plan's distinction
 * between a fracture and a mechanical iris). Intact, the two pieces sit
 * together with a Brass outline over a Paper fill, fully hiding the emblem
 * beneath. Broken, they shift a few px apart along the fracture and rotate
 * one or two degrees, filling solid Brass and revealing the emblem in the
 * gap. Jitter and rotation are deterministic per level (see
 * rewardsMapGeometry.ts) so the six seals read as individually fractured,
 * not stamped from one template.
 */
export function Seal({
  cx,
  cy,
  levelNumber,
  broken,
  animate,
  animationDelaySeconds,
  animationDurationSeconds,
  captionLines,
  captionTone,
}: SealProps) {
  const jitter = crackJitterForLevel(levelNumber);
  const rotation = crackRotationForLevel(levelNumber);
  const { leftD, rightD } = buildCrackPieces(RADIUS, jitter);

  const transition = animate
    ? { delay: animationDelaySeconds, duration: animationDurationSeconds, ease: "easeOut" as const }
    : { duration: 0 };

  const pieceVariants = {
    intact: { x: 0, y: 0, rotate: 0, fill: "#F0EFEC", fillOpacity: 1 },
    brokenLeft: { x: -3.5, y: 1.5, rotate: -rotation, fill: "#A9752E", fillOpacity: 1 },
    brokenRight: { x: 3.5, y: -1.5, rotate: rotation, fill: "#A9752E", fillOpacity: 1 },
  };

  return (
    <g transform={`translate(${String(cx)},${String(cy)})`}>
      {/* The reward emblem, always present underneath — only visible through the gap once broken. */}
      <circle r={7} fill="#6E2A2A" />
      <circle r={2.5} fill="#A9752E" />

      <motion.path
        d={leftD}
        stroke="#A9752E"
        strokeWidth={1.5}
        initial={animate ? "intact" : false}
        animate={broken ? "brokenLeft" : "intact"}
        variants={pieceVariants}
        transition={transition}
      />
      <motion.path
        d={rightD}
        stroke="#A9752E"
        strokeWidth={1.5}
        initial={animate ? "intact" : false}
        animate={broken ? "brokenRight" : "intact"}
        variants={pieceVariants}
        transition={transition}
      />

      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        fontFamily="'IBM Plex Serif', Georgia, serif"
        fill={broken ? "#ffffff" : "#A9752E"}
        style={{ pointerEvents: "none" }}
      >
        {levelNumber}
      </text>

      <text
        textAnchor="middle"
        y={RADIUS + 16}
        fontSize={12}
        fontFamily="'IBM Plex Sans', system-ui, sans-serif"
        fill={captionTone === "reward" ? "#241D1D" : "#57707B"}
      >
        {captionLines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : 14}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
