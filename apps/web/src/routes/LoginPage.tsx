import { LoginRequestSchema } from "@way-to-credit/shared";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";

import { ApiError, apiPost, isOutsideAccessWindowError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Logo } from "../components/Logo";

export function LoginPage() {
  const { refetch } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <div
      className="relative flex min-h-screen w-full overflow-hidden"
      style={{
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        backgroundColor: "#ffffff",
      }}
    >
      <style>{`
      @keyframes floatA { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
      @keyframes floatB { 0%,100% { transform: translateY(0) } 50% { transform: translateY(12px) } }
    `}</style>

      {/* big gradient circle, right edge sits at 46% of the screen width */}
      <div
        aria-hidden="true"
        className="absolute hidden md:block"
        style={{
          width: "130vh",
          height: "130vh",
          left: "calc(46vw - 130vh)",
          top: "50%",
          transform: "translateY(-50%)",
          borderRadius: "9999px",
          background: "linear-gradient(135deg, #22b8ea 0%, #0a86b3 50%, #11313c 100%)",
          boxShadow: "0 20px 60px rgba(10,111,149,0.35)",
        }}
      />

      {/* 3D sphere overlapping the edge */}
      <div
        aria-hidden="true"
        className="absolute hidden md:block"
        style={{
          width: 190,
          height: 190,
          left: "calc(46vw - 95px)",
          bottom: "8vh",
          borderRadius: "9999px",
          background: "radial-gradient(circle at 30% 28%, #7fdcf7 0%, #1fa5d6 40%, #0a5f80 100%)",
          boxShadow: "0 30px 50px rgba(10,95,128,0.45), inset -14px -14px 30px rgba(0,0,0,0.25)",
          animation: "floatA 6s ease-in-out infinite",
        }}
      />

      {/* bottom-left sphere */}
      <div
        aria-hidden="true"
        className="absolute hidden md:block"
        style={{
          width: 260,
          height: 260,
          left: -100,
          bottom: -100,
          borderRadius: "9999px",
          background: "radial-gradient(circle at 35% 30%, #5fd0f3 0%, #1592c2 45%, #0a5f80 100%)",
          boxShadow: "inset -14px -14px 30px rgba(0,0,0,0.25)",
          animation: "floatB 7s ease-in-out infinite",
        }}
      />

      {/* bottom-right corner sphere */}
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          width: 170,
          height: 170,
          right: -55,
          bottom: -55,
          borderRadius: "9999px",
          background: "radial-gradient(circle at 30% 30%, #5fd0f3 0%, #1592c2 50%, #0a5f80 100%)",
          boxShadow: "inset -10px -10px 24px rgba(0,0,0,0.25)",
          animation: "floatA 8s ease-in-out infinite",
        }}
      />

      {/* brand content */}
      <div
        className="absolute inset-y-0 left-0 hidden flex-col items-center justify-center px-10 text-center md:flex"
        style={{ width: "38vw", color: "#ffffff" }}
      >
        <div
          className="mb-6 flex items-center justify-center"
          style={{ width: 150, height: 150, borderRadius: "9999px", backgroundColor: "#ffffff" }}
        >
          <Logo size={130} />
        </div>
        <h1 style={{ fontSize: 60, fontWeight: 800, letterSpacing: "-0.02em" }}>Way To Credit</h1>
        <p className="text-lg" style={{ fontSize: 19, opacity: 0.85 }}>
          Complete your Credit Journey with us
        </p>
        <p className="text-lg" style={{ fontSize: 19, opacity: 0.85 }}>
          We Rewrite your Credit DNA...
        </p>
      </div>

      {/* form side */}
      <div className="relative ml-auto flex w-full flex-col justify-center px-8 md:w-[54%] md:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <Logo size={40} />
            <span style={{ fontSize: 20, fontWeight: 700 }} className="text-ink">
              Way To Credit
            </span>
          </div>

          <h2
            className="text-ink"
            style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.02em" }}
          >
            Sign in
          </h2>
          <p className="mt-2 text-muted" style={{ fontSize: 15 }}>
            Enter your user ID and password to continue.
          </p>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="mt-8 flex flex-col gap-4"
            noValidate
          >
            <div
              className="flex items-center gap-3 px-4"
              style={{ backgroundColor: "#f1f3f5", borderRadius: 14, height: 56 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#11313c" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
              </svg>
              <input
                name="identifier"
                placeholder="User ID"
                autoComplete="username"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                }}
                required
                className="w-full bg-transparent outline-none [&:-webkit-autofill]:shadow-[0_0_0_100px_#f1f3f5_inset]"
                style={{ color: "#11313c", fontSize: 15 }}
              />
            </div>

            <div
              className="flex items-center gap-3 px-4"
              style={{ backgroundColor: "#f1f3f5", borderRadius: 14, height: 56 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#11313c" aria-hidden="true">
                <rect x="5" y="10" width="14" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#11313c" strokeWidth="2" />
              </svg>
              <input
                name="password"
                placeholder="Password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                required
                className="w-full bg-transparent outline-none [&:-webkit-autofill]:shadow-[0_0_0_100px_#f1f3f5_inset]"
                style={{ color: "#11313c", fontSize: 15 }}
              />
              <button
                type="button"
                onClick={() => {
                  setShowPassword((v) => !v);
                }}
                className="font-bold tracking-wide"
                style={{ color: "#0a86b3", fontSize: 13 }}
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>

            {error && (
              <p role="alert" className="text-body text-negative">
                {error}
              </p>
            )}

            <Button type="submit" loading={submitting} className="mt-2 w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-8 text-muted" style={{ fontSize: 17 }}>
            Portal hours: Mon–Sat, 9:00 AM – 6:00 PM IST
          </p>
        </div>
      </div>
    </div>
  );
}
