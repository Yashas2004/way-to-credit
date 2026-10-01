import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchRewardsMap } from "../lib/userApi";
import { LoadFailed, RailSection } from "./RailSection";
import { SequenceDots } from "./SequenceDots";
import { Spinner } from "./Spinner";

/**
 * The user's credit total and progress toward the next milestone, titled from
 * admin config. Shared by the landing page and the Workspace rail, on the
 * rewards map's own query key, so they share one request.
 */
export function CreditProgress() {
  const query = useQuery({ queryKey: ["user", "rewards"], queryFn: fetchRewardsMap });
  const action = (
    <Link to="/user/rewards" className="text-small text-brand-ink underline">
      Rewards map
    </Link>
  );
  if (query.isPending) {
    return (
      <RailSection title="Your progress">
        <Spinner label="Loading your credit total" />
      </RailSection>
    );
  }
  if (query.isError) {
    return (
      <RailSection title="Your progress">
        <LoadFailed what="your credit total" query={query} />
      </RailSection>
    );
  }
  const { creditPoints, milestones } = query.data;
  const sorted = [...milestones].sort((a, b) => a.pointsRequired - b.pointsRequired);
  const next = sorted.find((m) => !m.unlockedAt);
  // The step runs from the last milestone reached to the next one.
  const from = Math.max(
    0,
    ...sorted
      .filter((m) => m.unlockedAt && m.pointsRequired <= creditPoints)
      .map((m) => m.pointsRequired),
  );

  return (
    <RailSection title="Your progress" action={action}>
      <p className="flex items-baseline gap-2">
        <span className="font-serif text-display text-brand-ink">{creditPoints}</span>
        <span className="text-body text-muted">credit point{creditPoints === 1 ? "" : "s"}</span>
      </p>
      {next ? (
        <SequenceDots
          className="mt-2"
          value={creditPoints - from}
          total={next.pointsRequired - from}
          label={`${String(Math.min(creditPoints, next.pointsRequired) - from)} of ${String(next.pointsRequired - from)} toward ${next.title}`}
        />
      ) : (
        <p className="mt-2 text-small text-muted">
          {sorted.length > 0 ? "Every milestone unlocked." : "No milestones set up yet."}
        </p>
      )}
      {creditPoints === 0 && (
        <p className="mt-2 text-small text-muted">Each query an admin approves earns 1 point.</p>
      )}
    </RailSection>
  );
}
