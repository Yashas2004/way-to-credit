import { EmptyState } from "../components/EmptyState";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-6">
      <EmptyState title={title} description="This screen arrives in a later stage." />
    </div>
  );
}
