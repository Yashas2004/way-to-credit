import { LoginRequestSchema } from "@way-to-credit/shared";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { ApiError, apiPost, isOutsideAccessWindowError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { refetch } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = LoginRequestSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setError("Enter both a user ID and a password.");
      return;
    }

    setSubmitting(true);
    try {
      await apiPost("/api/auth/login", parsed.data);
      const me = await refetch();
      if (me?.role === "admin") {
        navigate("/admin", { replace: true });
      } else if (me?.role === "user") {
        navigate("/user", { replace: true });
      } else {
        setError("Signed in, but couldn't confirm your account. Please try again.");
      }
    } catch (err) {
      if (isOutsideAccessWindowError(err)) {
        navigate("/outside-window", { replace: true });
        return;
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-2/5 flex-col justify-center bg-maroon px-12 py-16 text-paper md:flex">
        <h1 className="font-serif text-display font-semibold">Way To Credit</h1>
        <p className="mt-3 max-w-xs text-body text-paper/70">
          Internal loan status &amp; credit portal
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <h2 className="font-serif text-h1 text-ink">Sign in</h2>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="mt-8 flex flex-col gap-5"
            noValidate
          >
            <Input
              label="User ID"
              name="identifier"
              autoComplete="username"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
              }}
              required
            />
            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              required
            />

            {error && (
              <p role="alert" className="text-body text-alert">
                {error}
              </p>
            )}

            <Button type="submit" loading={submitting} className="mt-1 w-full">
              Sign in
            </Button>
          </form>

          {/* Admin forgot-password screen is a later frontend stage — the API
              already supports it (see auth.otp.test.ts), but no route exists
              here yet, so no link is shown rather than shipping a dead one. */}
          <p className="mt-8 text-small text-slate">Portal hours: Mon–Sat, 9:00 AM – 6:00 PM IST</p>
        </div>
      </div>
    </div>
  );
}
