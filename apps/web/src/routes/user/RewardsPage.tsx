import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { RewardsCertificate } from "../../components/RewardsCertificate";
import { Spinner } from "../../components/Spinner";
import { useAuth } from "../../lib/auth";
import { fetchRewardsMap } from "../../lib/userApi";

/**
 * The certificate is the whole page — "the document has a header... then
 * the milestone sequence, then nothing else." No separate page heading
 * here that would just repeat the certificate's own header.
 */
export function RewardsPage() {
  const { identity } = useAuth();
  const query = useQuery({ queryKey: ["user", "rewards"], queryFn: fetchRewardsMap });

  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" label="Loading your rewards certificate" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        message="We couldn't load your rewards certificate right now."
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <RewardsCertificate
      displayName={identity?.displayName ?? "Your"}
      creditPoints={query.data.creditPoints}
      milestones={query.data.milestones}
    />
  );
}
