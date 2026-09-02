import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { RewardsMilestone } from "@way-to-credit/shared";
import { markMilestoneSeen } from "../lib/userApi";
import {
  HORIZONTAL_MAP,
  VERTICAL_MAP,
  buildPathD,
  computeMarkerPosition,
  computeWaypoints,
  wrapText,
  type MapOrientation,
} from "../lib/rewardsMapGeometry";
import { Badge } from "./Badge";
import { Seal } from "./Seal";

export interface RewardsMapProps {
  creditPoints: number;
  milestones: RewardsMilestone[];
}

const STAGGER_SECONDS = 0.3;
const BREAK_DURATION_SECONDS = 0.55;

function captionWrap(orientation: MapOrientation, text: string): string[] {
  return orientation === "horizontal" ? wrapText(text, 13, 3) : wrapText(text, 20, 3);
}

export function RewardsMap({ creditPoints, milestones }: RewardsMapProps) {
  const reduceMotion = useReducedMotion();

  // Milestones already broken open before this mount — no animation, ever.
  const alreadySeenIds = useMemo(
    () => new Set(milestones.filter((m) => m.seenAt).map((m) => m.milestoneId)),
    [milestones],
  );
  // Unlocked but never yet seen — these play the one-time break animation,
  // in ascending level order, staggered.
  const pendingReveal = useMemo(
    () =>
      [...milestones]
        .filter((m) => m.unlockedAt && !m.seenAt)
        .sort((a, b) => a.levelNumber - b.levelNumber),
    [milestones],
  );

  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set(alreadySeenIds));

  useEffect(() => {
    // No extra "has this already run" guard here on purpose: React 18
    // StrictMode's dev-only double-invocation (mount -> cleanup -> mount)
    // is exactly handled by this effect's own cleanup clearing the first
    // set of timers before the second, real mount schedules a fresh one —
    // that's the correct pattern, not a race to guard against. An earlier
    // version added a ref-based "already fired" guard specifically to
    // stop double-scheduling, which instead suppressed the second (real)
    // scheduling entirely: the cleanup fired, cleared the first batch, and
    // the guard then blocked the replacement batch from ever being set, so
    // no seal ever animated and no `seen` call ever fired in development.
    if (pendingReveal.length === 0) return;

    const timers = pendingReveal.map((milestone, index) => {
      const delayMs = reduceMotion ? 0 : (index * STAGGER_SECONDS + BREAK_DURATION_SECONDS) * 1000;
      return setTimeout(() => {
        setRevealedIds((prev) => new Set(prev).add(milestone.milestoneId));
        markMilestoneSeen(milestone.milestoneId).catch(() => {
          // Best-effort — the backend's own seen-write is idempotent and
          // guarded, so a failed notification here just means the next
          // visit's data (seenAt already null) re-attempts it naturally.
        });
      }, delayMs);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [pendingReveal, reduceMotion]);

  const thresholds = milestones.map((m) => m.pointsRequired);

  function renderMap(orientation: MapOrientation) {
    const dims = orientation === "horizontal" ? HORIZONTAL_MAP : VERTICAL_MAP;
    const waypoints = computeWaypoints(orientation);
    const pathD = buildPathD(waypoints, orientation);
    const marker = computeMarkerPosition(waypoints, { thresholds, creditPoints }, orientation);

    return (
      <svg
        aria-hidden="true"
        width={dims.width}
        height={dims.height}
        viewBox={`0 0 ${String(dims.width)} ${String(dims.height)}`}
      >
        <path d={pathD} fill="none" stroke="#57707B" strokeOpacity={0.35} strokeWidth={1.25} />

        {milestones.map((milestone, i) => {
          const point = waypoints[i + 1]; // waypoints[0] is the origin, not a seal
          if (!point) return null;

          const isPendingReveal = Boolean(milestone.unlockedAt) && !milestone.seenAt;
          const isRevealed = revealedIds.has(milestone.milestoneId);
          const broken = isRevealed;
          const animate = isPendingReveal;
          const pendingIndex = pendingReveal.findIndex(
            (m) => m.milestoneId === milestone.milestoneId,
          );

          const captionLines = isRevealed
            ? captionWrap(orientation, milestone.message)
            : captionWrap(orientation, `${String(milestone.pointsRequired)} pts`);

          return (
            <Seal
              key={milestone.milestoneId}
              cx={point.x}
              cy={point.y}
              levelNumber={milestone.levelNumber}
              broken={broken}
              animate={animate && !reduceMotion}
              animationDelaySeconds={pendingIndex >= 0 ? pendingIndex * STAGGER_SECONDS : 0}
              animationDurationSeconds={BREAK_DURATION_SECONDS}
              captionLines={captionLines}
              captionTone={isRevealed ? "reward" : "locked"}
            />
          );
        })}

        {/*
          A plain (non-motion) <g> for positioning — Framer Motion manages
          the `transform` attribute itself on any motion.* element that has
          an `animate`/`initial`, so a raw `transform="translate(...)"` on a
          motion element gets silently discarded in favor of Framer's own
          x/y/rotate/scale composition (which defaults to 0,0,0,1), which is
          exactly what put the marker at the SVG's origin instead of on the
          path. The pulse animation lives on the plain-attribute-free child
          rect below instead, using Framer's own `rotate`/`scale` motion
          values rather than a raw `transform` string.
        */}
        <g transform={`translate(${String(marker.x)},${String(marker.y)})`}>
          <motion.rect
            x={-6}
            y={-6}
            width={12}
            height={12}
            rx={2}
            fill="#6E2A2A"
            stroke="#A9752E"
            strokeWidth={1.5}
            initial={{ rotate: 45, scale: 1 }}
            animate={reduceMotion ? { rotate: 45, scale: 1 } : { rotate: 45, scale: [1, 1.18, 1] }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 2, repeat: Infinity, ease: "easeInOut" as const }
            }
          />
        </g>
      </svg>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="hidden overflow-x-auto rounded-md border border-slate/20 bg-white p-4 sm:block">
        {renderMap("horizontal")}
      </div>
      <div className="overflow-x-auto rounded-md border border-slate/20 bg-white p-4 sm:hidden">
        {renderMap("vertical")}
      </div>

      <div>
        <h2 className="mb-3 font-serif text-h2 text-ink">Your milestones</h2>
        <ol className="flex flex-col divide-y divide-slate/15 rounded-md border border-slate/20 bg-white">
          {milestones.map((milestone) => {
            const unlocked = Boolean(milestone.unlockedAt);
            return (
              <li key={milestone.milestoneId} className="flex flex-col gap-1.5 px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body font-medium text-ink">
                    Level {milestone.levelNumber} — {milestone.pointsRequired} points
                  </span>
                  {unlocked ? (
                    <Badge tone="success" label="Unlocked" />
                  ) : (
                    <Badge
                      tone="neutral"
                      label={`Locked — ${String(
                        Math.max(0, milestone.pointsRequired - creditPoints),
                      )} points to go`}
                    />
                  )}
                </div>
                {unlocked && <p className="text-body text-slate">{milestone.message}</p>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
