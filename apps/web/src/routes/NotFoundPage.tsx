import { Link } from "react-router-dom";
import { Button } from "../components/Button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <h1 className="font-serif text-h1 text-ink">Page not found</h1>
      <p className="max-w-sm text-body text-slate">
        The page you're looking for doesn't exist, or may have moved.
      </p>
      <Link to="/">
        <Button variant="secondary">Back to start</Button>
      </Link>
    </div>
  );
}
