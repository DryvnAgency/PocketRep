"use client";

import { useState } from "react";

export default function Waitlist({ invert }: { invert?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setState("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          source: invert ? "cta_band" : "hero",
          referrer: typeof document !== "undefined" ? document.referrer : "",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong.");
      }
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not save your email.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className={"waitlist success" + (invert ? " invert" : "")}>
        ✓ You&apos;re on the list — we&apos;ll reach out within a week.
      </div>
    );
  }

  return (
    <form className="waitlist" onSubmit={submit}>
      <input
        type="email"
        placeholder="you@yourdealership.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={state === "submitting"}
      />
      <button type="submit" disabled={state === "submitting"}>
        {state === "submitting" ? "Saving…" : "Join the waitlist →"}
      </button>
      {state === "error" && (
        <div className="waitlist error" style={{ marginTop: 12 }}>
          {errorMsg}
        </div>
      )}
    </form>
  );
}
