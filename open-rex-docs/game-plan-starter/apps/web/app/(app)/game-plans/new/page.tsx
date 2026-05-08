"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lensRows } from "@/lib/mock";
import { runGamePlan } from "./run";

export default function NewGamePlanPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [offer, setOffer] = useState("$500 off lease upgrade this month — Murano owners only.");
  const [sendMode, setSendMode] = useState<"instant" | "batch_15min" | "drip_multiday">("batch_15min");
  const [cadence, setCadence] = useState({ h24: true, h72: true, d7: false });
  const [handoff, setHandoff] = useState<"auto_assign" | "queue_to_me">("queue_to_me");
  const [attested, setAttested] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [runError, setRunError] = useState<string | null>(null);

  function onRun() {
    setRunError(null);
    startTransition(async () => {
      const result = await runGamePlan({
        offer,
        sendMode,
        cadence,
        handoff,
        attestationName: name,
        attested,
      });
      if (result.ok) {
        router.push("/heat-sheet");
      } else {
        setRunError(result.error);
      }
    });
  }

  return (
    <div className="gp">
      <div className="gp-head">
        <div>
          <div className="serif gp-title">Game Plan Builder</div>
          <div className="mono gp-sub">142 customers loaded from Rex Lens · VinSolutions Advanced Search</div>
        </div>
        <div className="gp-step mono">STEP {step} OF 3</div>
      </div>

      {step === 1 && (
        <div className="gp-card">
          <h3 className="serif">Pool</h3>
          <p className="muted">Pulled from Rex Lens. Locked once attested.</p>
          <div className="pool-table">
            <div className="pool-head mono">
              <span>Name</span><span>Vehicle</span><span>Months</span><span>Phone</span><span>Equity</span>
            </div>
            {lensRows.slice(0, 6).map((r, i) => (
              <div key={i} className="pool-row">
                <span>{r.name}</span>
                <span>{r.vehicle}</span>
                <span>{r.months}mo</span>
                <span className="mono">{r.phone}</span>
                <span className={"equity equity-" + r.equity}>{r.equity}</span>
              </div>
            ))}
            <div className="pool-more mono">+ 136 more</div>
          </div>
          <div className="gp-nav">
            <button className="btn-primary" onClick={() => setStep(2)}>Continue →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="gp-card">
          <h3 className="serif">Offer & Cadence</h3>
          <div className="gp-field">
            <label className="mono">OFFER COPY · max 200 chars</label>
            <textarea value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={200} />
            <div className="char-count mono">{offer.length}/200</div>
          </div>
          <div className="gp-row">
            <div className="gp-field">
              <label className="mono">SEND MODE</label>
              <div className="seg">
                {(["instant", "batch_15min", "drip_multiday"] as const).map((m) => (
                  <button
                    key={m}
                    className={sendMode === m ? "on" : ""}
                    onClick={() => setSendMode(m)}
                  >
                    {m.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            <div className="gp-field">
              <label className="mono">CADENCE</label>
              <div className="checks">
                <label>
                  <input type="checkbox" checked={cadence.h24} onChange={(e) => setCadence({ ...cadence, h24: e.target.checked })} />
                  Nudge +24h
                </label>
                <label>
                  <input type="checkbox" checked={cadence.h72} onChange={(e) => setCadence({ ...cadence, h72: e.target.checked })} />
                  Nudge +72h
                </label>
                <label>
                  <input type="checkbox" checked={cadence.d7} onChange={(e) => setCadence({ ...cadence, d7: e.target.checked })} />
                  Nudge +7d
                </label>
              </div>
            </div>
          </div>
          <div className="gp-field">
            <label className="mono">HANDOFF RULE</label>
            <div className="seg">
              <button className={handoff === "auto_assign" ? "on" : ""} onClick={() => setHandoff("auto_assign")}>
                auto-assign to rep
              </button>
              <button className={handoff === "queue_to_me" ? "on" : ""} onClick={() => setHandoff("queue_to_me")}>
                queue to me
              </button>
            </div>
          </div>
          <div className="gp-nav">
            <button className="btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button className="btn-primary" onClick={() => setStep(3)}>Preview Messages →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="gp-card">
          <h3 className="serif">Preview & Attest</h3>
          <p className="muted">v0 cap: Sonnet generates 6 messages live on Run. Pool above shows 142 — the rest queue for the Phase 2 batch worker.</p>
          <div className="preview-list">
            {[
              { c: "Carla Mendez", text: `Hey Carla — Eddie at Nissan of Omaha. You're coming up on 33 months in your Murano SL. ${offer} Worth a look?` },
              { c: "Greg Whitaker", text: `Greg — Eddie from Nissan of Omaha. Your Rogue's been a workhorse, 41 months in. ${offer} Want me to run quick numbers?` },
              { c: "Tyrese Brooks", text: `Tyrese — Eddie at Nissan of Omaha. 52 months in the Altima — that's real equity right now. ${offer} Curious?` },
              { c: "Linh Tran", text: `Hey Linh — Eddie from Nissan of Omaha. The Frontier's holding value like crazy at 30 months. ${offer} Let me know.` },
            ].map((m, i) => (
              <div key={i} className="preview-msg">
                <div className="mono preview-to">→ {m.c}</div>
                <div>{m.text}</div>
              </div>
            ))}
          </div>

          <div className="attest-box">
            <div className="serif attest-title">TCPA Attestation</div>
            <p className="muted small">
              By checking this box, I attest under penalty of perjury that every customer in this pool of 142 has provided valid consent to receive marketing SMS from Nissan of Omaha.
            </p>
            <label className="attest-check">
              <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
              I attest as the responsible manager.
            </label>
            <input
              className="attest-name"
              placeholder="Type your full legal name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="mono attest-meta">Pool hash 7a41f… · timestamp will be locked at run</div>
          </div>

          {runError && (
            <div
              className="mono"
              style={{
                color: "#8b0000",
                background: "rgba(139,0,0,0.08)",
                border: "1px solid rgba(139,0,0,0.3)",
                padding: "10px 14px",
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {runError}
            </div>
          )}

          <div className="gp-nav">
            <button className="btn-ghost" onClick={() => setStep(2)} disabled={pending}>← Back</button>
            <button
              className="btn-primary"
              disabled={!attested || !name || pending}
              onClick={onRun}
            >
              {pending ? "Running… generating 6 messages" : "Run Game Plan → 6 sends"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
