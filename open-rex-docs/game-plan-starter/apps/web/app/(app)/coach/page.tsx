"use client";

import { useState } from "react";
import { coachExchanges } from "@/lib/mock";

type Exchange = { role: "manager" | "rex"; text: string };

export default function CoachPage() {
  const [input, setInput] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>(coachExchanges);

  function send() {
    if (!input.trim()) return;
    setExchanges([
      ...exchanges,
      { role: "manager", text: input },
      { role: "rex", text: "Got it — give me a sec to draft that. (mocked response — will be live with Opus 4.7)" },
    ]);
    setInput("");
  }

  return (
    <div className="coach">
      <div className="coach-head">
        <div className="serif coach-title">Rex Coach</div>
        <div className="mono coach-sub">Opus 4.7 · context: dealership voice + recent plans + live inventory</div>
      </div>
      <div className="coach-thread">
        {exchanges.map((m, i) => (
          <div key={i} className={"coach-msg coach-" + m.role}>
            <div className="coach-role mono">{m.role === "rex" ? "REX" : "YOU"}</div>
            <div className="coach-text">{m.text}</div>
            {m.role === "rex" && i === exchanges.length - 1 && exchanges.length > 2 && (
              <button className="btn-primary coach-cta">Build it now →</button>
            )}
          </div>
        ))}
      </div>
      <div className="coach-input">
        <input
          placeholder="Ask Rex anything — or describe a Game Plan in plain English…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn-primary" onClick={send}>Ask</button>
      </div>
    </div>
  );
}
