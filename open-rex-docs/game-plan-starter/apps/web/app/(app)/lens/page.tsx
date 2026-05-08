"use client";

import { useState } from "react";
import { lensRows } from "@/lib/mock";

export default function LensPage() {
  const [captured, setCaptured] = useState(false);
  return (
    <div className="lens-frame">
      <div className="lens-browser">
        <div className="lens-tab mono">VinSolutions › Advanced Search › Results</div>
        <div className="lens-results">
          <div className="lens-rh mono">
            <span>NAME</span><span>VEHICLE</span><span>MOS</span><span>PHONE</span>
          </div>
          {lensRows.map((r, i) => (
            <div key={i} className="lens-rr">
              <span>{r.name}</span>
              <span>{r.vehicle}</span>
              <span>{r.months}</span>
              <span className="mono">{r.phone}</span>
            </div>
          ))}
          <div className="lens-rh mono">
            <span>+ 134 more rows scrolled below…</span>
          </div>
        </div>
      </div>
      <div className="lens-panel">
        <div className="lens-brand serif">
          Rex<span className="dot"></span> Lens
        </div>
        <div className="mono lens-status">Detected · VinSolutions Advanced Search</div>
        <div className="lens-stat">
          <div className="lens-stat-num serif">142</div>
          <div className="lens-stat-lbl mono">CUSTOMERS ON THIS PAGE</div>
        </div>
        <button className="btn-primary lens-btn" onClick={() => setCaptured(true)}>
          {captured ? "✓ Captured to pool_a3f" : "Capture this list"}
        </button>
        <button className="btn-ghost lens-btn">Capture & start Game Plan</button>
        <button className="btn-ghost lens-btn">View captured pools</button>
        <div className="lens-hint mono">
          DEDUP · 8 already in DNC · 4 already in another active plan within 7d
        </div>
      </div>
    </div>
  );
}
