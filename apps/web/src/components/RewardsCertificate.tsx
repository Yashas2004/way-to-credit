import { useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { RewardsMilestone } from "@way-to-credit/shared";
import { nextMilestoneIndex, progressFraction } from "../lib/rewardsMapGeometry";
import { markMilestoneSeen } from "../lib/userApi";
import { Badge } from "./Badge";
import { CreditHistoryPanel } from "./CreditHistoryPanel";
import { Seal, type SealWeight } from "./Seal";

export interface RewardsCertificateProps {
  displayName: string;
  creditPoints: number;
  /** Ordered by levelNumber ascending — the same contract as the API response. */
  milestones: RewardsMilestone[];
}

const STAGGER_SECONDS = 0.3;
const BREAK_DURATION_SECONDS = 0.55;

// Real, distinct sizes per weight — not a shared size with an internal
// visual-only scale — so the connector rail can be computed exactly per
// row instead of assumed from one constant.
const SEAL_SIZE_BY_WEIGHT: Record<SealWeight, number> = { hero: 100, normal: 90, quiet: 80 };
// Matches the icon column's `pt-2` below.
const ICON_COLUMN_PADDING_TOP = 8;

/** Where a row's own seal center sits, measured from the top of its icon column — used to terminate that row's own connector-line segments exactly at its seal, whatever size this particular row's weight uses. */
function connectorHalf(weight: SealWeight): number {
  return ICON_COLUMN_PADDING_TOP + SEAL_SIZE_BY_WEIGHT[weight] / 2;
}

export function RewardsCertificate({
  displayName,
  creditPoints,
  milestones,
}: RewardsCertificateProps) {
  const reduceMotion = useReducedMotion();

  const alreadySeenIds = useMemo(
    () => new Set(milestones.filter((m) => m.seenAt).map((m) => m.milestoneId)),
    [milestones],
  );
  const pendingReveal = useMemo(
    () =>
      [...milestones]
        .filter((m) => m.unlockedAt && !m.seenAt)
        .sort((a, b) => a.levelNumber - b.levelNumber),
    [milestones],
  );

  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set(alreadySeenIds));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    // See RewardsCertificate's predecessor (git history) for why this has
    // no extra "already fired" guard: React 18 StrictMode's dev-only
    // mount->cleanup->mount is exactly handled by this effect's own
    // cleanup clearing the first batch of timers before the second, real
    // mount schedules a fresh one. A guard here previously suppressed the
    // real scheduling entirely.
    if (pendingReveal.length === 0) return;

    const timers = pendingReveal.map((milestone, index) => {
      const delayMs = reduceMotion ? 0 : (index * STAGGER_SECONDS + BREAK_DURATION_SECONDS) * 1000;
      return setTimeout(() => {
        setRevealedIds((prev) => new Set(prev).add(milestone.milestoneId));
        markMilestoneSeen(milestone.milestoneId).catch(() => {
          // Best-effort — the backend's seen-write is idempotent and
          // guarded, so a failed notification here just means the next
          // visit's data (seenAt still null) re-attempts it naturally.
        });
      }, delayMs);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [pendingReveal, reduceMotion]);

  const thresholds = milestones.map((m) => m.pointsRequired);
  const heroIndex = nextMilestoneIndex(thresholds, creditPoints);

  function toggleExpanded(milestoneId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  }

  const journeySummary =
    heroIndex === -1
      ? "You've unlocked every milestone. Thank you for helping keep the portal accurate."
      : `${String((thresholds[heroIndex] ?? 0) - creditPoints)} points to your next seal.`;

  return (
    <div className="rounded-md border border-slate/25 p-1">
      <div className="rounded-sm border border-brass/25 bg-white px-5 py-8 sm:px-10 sm:py-10">
        <header className="mb-8 flex flex-col items-center gap-1.5 border-b border-slate/15 pb-6 text-center sm:mb-10 sm:pb-8">
          <h1 className="font-serif text-h1 text-ink">{displayName}</h1>
          <p className="text-body-lg text-ink">
            <span className="font-serif text-h2 text-maroon">{creditPoints}</span> credit point
            {creditPoints === 1 ? "" : "s"}
          </p>
          <p className="text-body text-slate">{journeySummary}</p>
        </header>

        <ol className="flex flex-col">
          {milestones.map((milestone, i) => {
            const unlocked = Boolean(milestone.unlockedAt);
            const isHero = i === heroIndex;
            const isPendingReveal = unlocked && !milestone.seenAt;
            const broken = revealedIds.has(milestone.milestoneId);
            const pendingIndex = pendingReveal.findIndex(
              (m) => m.milestoneId === milestone.milestoneId,
            );
            const weight: SealWeight = isHero ? "hero" : unlocked ? "normal" : "quiet";
            const sealSize = SEAL_SIZE_BY_WEIGHT[weight];
            const half = connectorHalf(weight);
            const isExpanded = expandedIds.has(milestone.milestoneId);
            const previousThreshold = i === 0 ? 0 : (thresholds[i - 1] ?? 0);
            const historyPanelId = `credit-history-${milestone.milestoneId}`;

            const sealArt = (
              <Seal
                levelNumber={milestone.levelNumber}
                broken={broken}
                animate={isPendingReveal && !reduceMotion}
                animationDelaySeconds={pendingIndex >= 0 ? pendingIndex * STAGGER_SECONDS : 0}
                animationDurationSeconds={BREAK_DURATION_SECONDS}
                weight={weight}
                pulse={isHero && !reduceMotion}
                size={sealSize}
              />
            );

            return (
              <li key={milestone.milestoneId} className="relative flex gap-4 sm:gap-6">
                <div className="relative flex w-[110px] flex-none flex-col items-center pt-2 sm:w-[126px]">
                  {/*
                    Each segment ends exactly at *this* row's own seal
                    center (`half`, computed from this row's own weight/
                    size) — it never needs the adjacent row's value. Rows
                    stack with no gap between <li>s, so a segment reaching
                    all the way to its own box's top/bottom edge lines up
                    seamlessly with the next row's segment regardless of
                    the two rows using different seal sizes.
                  */}
                  {i > 0 && (
                    <div
                      className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-slate/25"
                      style={{ height: half }}
                      aria-hidden="true"
                    />
                  )}
                  {i < milestones.length - 1 && (
                    <div
                      className="absolute bottom-0 left-1/2 w-px -translate-x-1/2 bg-slate/25"
                      style={{ top: half }}
                      aria-hidden="true"
                    />
                  )}

                  {unlocked ? (
                    <button
                      type="button"
                      onClick={() => {
                        toggleExpanded(milestone.milestoneId);
                      }}
                      aria-expanded={isExpanded}
                      aria-controls={historyPanelId}
                      aria-label={
                        isExpanded
                          ? `Hide how you earned Level ${String(milestone.levelNumber)}`
                          : `Show how you earned Level ${String(milestone.levelNumber)}`
                      }
                      className="group relative rounded-full transition-transform duration-150 ease-out hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:ring-offset-white"
                    >
                      {sealArt}
                      <span className="pointer-events-none absolute left-1/2 top-full mt-1 w-max -translate-x-1/2 text-small text-slate opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                        {isExpanded ? "Hide details" : "View how you earned this"}
                      </span>
                    </button>
                  ) : (
                    sealArt
                  )}
                </div>

                <div className="flex-1 pb-8 pt-2 sm:pb-10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-serif text-h3 text-ink sm:text-h2">
                      Level {milestone.levelNumber} — {milestone.pointsRequired} points
                    </span>
                    {unlocked && <Badge tone="success" label="Unlocked" />}
                    {!unlocked && isHero && (
                      <Badge
                        tone="attention"
                        label={`Next — ${String(milestone.pointsRequired - creditPoints)} points to go`}
                      />
                    )}
                    {!unlocked && !isHero && (
                      <Badge
                        tone="neutral"
                        label={`Locked — ${String(milestone.pointsRequired - creditPoints)} points to go`}
                      />
                    )}
                  </div>

                  {unlocked && <p className="mt-1.5 text-body text-slate">{milestone.message}</p>}

                  {!unlocked && isHero && (
                    <div className="mt-3 max-w-xs">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate/15">
                        <div
                          className="h-full rounded-full bg-brass"
                          style={{
                            width: `${String(progressFraction(thresholds, i, creditPoints) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-small text-slate">
                        {creditPoints} of {milestone.pointsRequired} points
                      </p>
                    </div>
                  )}

                  {!unlocked && !isHero && <p className="mt-1.5 text-body text-slate">Locked</p>}

                  {unlocked && isExpanded && (
                    <CreditHistoryPanel
                      id={historyPanelId}
                      previousThreshold={previousThreshold}
                      threshold={milestone.pointsRequired}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
