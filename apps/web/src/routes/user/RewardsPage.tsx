import { useQuery } from "@tanstack/react-query";
import { RewardsMap } from "../../components/RewardsMap";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { Spinner } from "../../components/Spinner";
import { fetchRewardsMap } from "../../lib/userApi";

export function RewardsPage() {
  const query = useQuery({ queryKey: ["user", "rewards"], queryFn: fetchRewardsMap });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">My rewards</h1>
        <p className="mt-1 text-body text-slate">
          Every 5 credit points breaks open the next seal.
        </p>
      </div>

      {query.isPending && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Loading your rewards map" />
        </div>
      )}

      {query.isError && (
        <ErrorState
          message="We couldn't load your rewards map right now."
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {query.data && (
        <RewardsMap creditPoints={query.data.creditPoints} milestones={query.data.milestones} />
      )}
    </div>
  );
}
