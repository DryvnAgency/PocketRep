"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { signInWithMagicLink } from "./actions";

export default function SignInPage() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const errorParam = params.get("error");

  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    errorParam === "auth_callback_failed" ? "That sign-in link expired. Try again." : null,
  );
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("next", next);
    startTransition(async () => {
      const result = await signInWithMagicLink(fd);
      if (result.ok) {
        setSentTo(result.email ?? email);
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
            <div className="signin-hint">
              We&apos;ll email you a one-time link. No password to remember.
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
            />
            {error && <div className="signin-error">{error}</div>}
            <button className="go" type="submit" disabled={pending || !email.includes("@")}>
              {pending ? "Sending…" : "Email me a sign-in link →"}
            </button>
          </>
        )}

        <Link href="/" className="signin-back">← Back to homepage</Link>
      </form>
    </div>
  );
}
