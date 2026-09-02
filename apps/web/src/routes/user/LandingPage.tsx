import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { Spinner } from "../../components/Spinner";
import { useAuth } from "../../lib/auth";
import { fetchRewardsMap } from "../../lib/userApi";

export function LandingPage() {
  const { identity } = useAuth();
  const rewardsQuery = useQuery({ queryKey: ["user", "rewards"], queryFn: fetchRewardsMap });

  const firstName = identity?.displayName.split(" ")[0] ?? identity?.displayName ?? "there";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">Welcome back, {firstName}</h1>
        <p className="mt-1 text-body text-slate">
          Look up a loan status, or raise a query if something's missing.
        </p>
      </div>

      {rewardsQuery.isPending && (
        <Card>
          <div className="flex justify-center py-6">
            <Spinner label="Loading your credit total" />
          </div>
        </Card>
      )}

      {rewardsQuery.isError && (
        <ErrorState
          message="We couldn't load your credit total right now."
          action={
            <Button variant="secondary" onClick={() => void rewardsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {rewardsQuery.data && (
        <Card>
          {rewardsQuery.data.creditPoints === 0 ? (
            <div className="flex flex-col gap-3">
              <h2 className="font-serif text-h2 text-ink">Let's get you started</h2>
              <p className="text-body text-slate">
                You haven't earned any credits yet. Every query an admin approves earns you 1 credit
                point, and every 5 points unlocks a reward on your rewards map.
              </p>
              <div>
                <Link to="/user/workspace">
                  <Button variant="primary">Go to workspace</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-display text-maroon">
                  {rewardsQuery.data.creditPoints}
                </span>
                <span className="text-body text-slate">
                  credit point{rewardsQuery.data.creditPoints === 1 ? "" : "s"}
                </span>
              </div>

              {(() => {
                const next = rewardsQuery.data.milestones.find((m) => !m.unlockedAt);
                if (!next) {
                  return (
                    <p className="text-body text-ink">
                      You've unlocked every milestone. Thank you for helping keep the portal
                      accurate.
                    </p>
                  );
                }
                const pointsToGo = next.pointsRequired - rewardsQuery.data.creditPoints;
                return (
                  <p className="text-body text-ink">
                    {pointsToGo} point{pointsToGo === 1 ? "" : "s"} to your next reward.
                  </p>
                );
              })()}

              <div className="flex gap-3">
                <Link to="/user/workspace">
                  <Button variant="primary">Go to workspace</Button>
                </Link>
                <Link to="/user/rewards">
                  <Button variant="secondary">View rewards map</Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
