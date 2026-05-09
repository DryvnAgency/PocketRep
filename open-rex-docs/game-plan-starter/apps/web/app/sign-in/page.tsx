"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithMagicLink, signInWithPassword } from "./actions";

type Mode = "magic" | "password";

export default function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const errorParam = params.get("error");

  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    errorParam === "auth_callback_failed" ? "That sign-in link expired. Try again." : null,
  );
  const [pending, startTransition] = useTransition();

  function switchMode(nextMode: Mode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError(null);
    setSentTo(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("next", next);

    if (mode === "magic") {
      startTransition(async () => {
        const result = await signInWithMagicLink(fd);
        if (result.ok) {
          setSentTo(result.email ?? email);
        } else {
          setError(result.error ?? "Sign in failed.");
        }
      });
      return;
    }

    fd.set("password", password);
    startTransition(async () => {
      const result = await signInWithPassword(fd);
      if (result.ok) {
        router.push(next);
        router.refresh();
      } else {
        setError(result.error ?? "Sign in failed.");
      }
    });
  }

  return (
    <div className="route signin">
      <form className="signin-card" onSubmit={submit}>
        <div className="lp-logo" style={{ marginBottom: 24 }}>OpenRex</div>
        <h2>Welcome back.</h2>
        <p className="deck">Sign in to your dealership&apos;s manager workspace.</p>

        {sentTo ? (
          <div className="signin-success">
            ✓ Magic link sent to <strong>{sentTo}</strong>. Open it on this device to finish signing in.
          </div>
        ) : (
          <>
            <div className="signin-tabs" role="tablist" aria-label="Sign-in method">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "magic"}
                className={`signin-tab${mode === "magic" ? " is-active" : ""}`}
                onClick={() => switchMode("magic")}
                disabled={pending}
              >
                Magic link
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "password"}
                className={`signin-tab${mode === "password" ? " is-active" : ""}`}
                onClick={() => switchMode("password")}
                disabled={pending}
              >
                Password
              </button>
            </div>
            <div className="signin-hint">
              {mode === "magic"
                ? "We'll email you a one-time link. No password to remember."
                : "Use your admin email and password."}
            </div>
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourdealership.com"
              disabled={pending}
              autoComplete={mode === "password" ? "username" : "email"}
            />
            {mode === "password" && (
              <>
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={pending}
                  autoComplete="current-password"
                />
              </>
            )}
            {error && <div className="signin-error">{error}</div>}
            <button
              className="go"
              type="submit"
              disabled={
                pending ||
                !email.includes("@") ||
                (mode === "password" && !password)
              }
            >
              {pending
                ? mode === "magic"
                  ? "Sending…"
                  : "Signing in…"
                : mode === "magic"
                  ? "Email me a sign-in link →"
                  : "Sign in →"}
            </button>
          </>
        )}

        <Link href="/" className="signin-back">← Back to homepage</Link>
      </form>
    </div>
  );
}
