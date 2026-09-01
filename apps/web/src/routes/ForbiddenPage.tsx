import { Link } from "react-router-dom";
import { Button } from "../components/Button";

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <h1 className="font-serif text-h1 text-ink">You don't have access to this page</h1>
      <p className="max-w-sm text-body text-slate">
        Your account doesn't have permission to view this section of the portal.
      </p>
      <Link to="/">
        <Button variant="secondary">Back to start</Button>
      </Link>
    </div>
  );
}
