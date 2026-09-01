import { Link } from "react-router-dom";
import { Button } from "../components/Button";

/**
 * Reached whenever the API returns OUTSIDE_ACCESS_WINDOW — at login, or
 * mid-session once the server-side cutoff hits. Local auth state has
 * already been cleared by the api client's registered handler by the time
 * a route guard redirects here (see lib/auth.tsx / lib/api.ts).
 */
export function OutsideWindowPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <h1 className="font-serif text-h1 text-ink">The portal is currently closed</h1>
      <p className="max-w-sm text-body text-slate">
        Access is available Mon–Sat, 9:00 AM to 6:00 PM IST. Please come back during those hours.
      </p>
      <Link to="/login">
        <Button variant="secondary">Back to sign in</Button>
      </Link>
    </div>
  );
}
