import Link from "next/link";
import Waitlist from "@/components/Waitlist";

export default function LandingPage() {
  return (
    <div className="route landing">
      <nav className="lp-nav">
        <div className="lp-logo">OpenRex</div>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#tour">Product</a>
          <a href="#pricing">Pricing</a>
          <a href="#waitlist">Waitlist</a>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link href="/sign-in" className="lp-signin">Sign in</Link>
          <a className="lp-cta" href="#waitlist">Join waitlist</a>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">For dealership desk managers · Built by one</div>
        <h1>
          Text every <em>past customer</em>.<br />
          <span className="strike">Mass blast.</span> Sound human.
        </h1>
        <p className="hero-deck">
          OpenRex pulls your past customers out of your CRM, writes a uniquely-worded text for every single one using their actual vehicle and equity position, and routes any reply with a number to your approval queue. One flat price. The desk manager runs it.
        </p>
        <div id="waitlist">
          <Waitlist />
        </div>
        <div className="hero-meta">
          <span>10DLC compliant</span>
          <span>TCPA-attested per campaign</span>
          <span>Single rooftop license · $999/mo</span>
        </div>
      </header>

      <div className="ticker">
        <div className="ticker-track">
          {[...Array(2)].map((_, k) => (
            <div key={k} style={{ display: "flex", gap: 64 }}>
              <div className="ticker-item"><span className="num">142</span> Murano lessees texted in 18 minutes</div>
              <div className="ticker-item"><span className="num">9</span> appointments set this week</div>
              <div className="ticker-item"><span className="num">$412k</span> revenue attributed to Rex Game Plans</div>
              <div className="ticker-item"><span className="num">0</span> TCPA flags across 8 campaigns</div>
              <div className="ticker-item"><span className="num">20.2%</span> reply rate vs. 3% industry mail-merge</div>
              <div className="ticker-item"><span className="num">2</span> auto-replies max per thread</div>
            </div>
          ))}
        </div>
      </div>

      <section className="lp bone">
        <div className="inner">
          <div className="lp-tag" style={{ color: "var(--orx-rust-dark)" }}>The Wedge</div>
          <h2 style={{ color: "var(--orx-ink)" }}>
            The desk manager is the most under-tooled buyer <em>in the dealership.</em>
          </h2>
          <p className="lead">
            Every product in this market is built for the seat next to you, the floor above you, or the corporate line above that. OpenRex points at the desk.
          </p>

          <div className="splits">
            <div className="l">
              <div className="split-tag">Today, without OpenRex</div>
              <h3>Mass-text from your CRM</h3>
              <ul>
                <li>One template. 200 customers. Same five sentences.</li>
                <li>Replies pile up in three different inboxes.</li>
                <li>You hope nobody asks about payment.</li>
                <li>Compliance is a checkbox at onboarding.</li>
                <li>The salesperson decides who hears back, when, and how.</li>
              </ul>
            </div>
            <div className="r">
              <div className="split-tag">With OpenRex</div>
              <h3>Manager-led Game Plans</h3>
              <ul>
                <li>One unique LLM-written message per customer, grounded in their actual vehicle.</li>
                <li>One Heat Sheet. Every conversation, live, in one place.</li>
                <li>Anything with a number routes to your approval queue.</li>
                <li>TCPA attestation per Game Plan, immutable audit log, court-formatted PDF.</li>
                <li>You decide who gets the hot reply — the rep, or you.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="lp" id="how">
        <div className="lp-tag">How it works</div>
        <h2>Four steps. Built around <em>your day,</em> not a marketing calendar.</h2>
        <div className="how">
          <div className="how-step">
            <div className="how-num">01</div>
            <div className="how-name">Scrape</div>
            <div className="how-desc">Run any Advanced Search in VinSolutions, DealerSocket, Tekion, or Elead. Click the OpenRex Lens button. Your pool is captured.</div>
          </div>
          <div className="how-step">
            <div className="how-num">02</div>
            <div className="how-name">Plan</div>
            <div className="how-desc">One screen, six fields. Offer copy, send mode, cadence, handoff, attestation. Sign, hit run.</div>
          </div>
          <div className="how-step">
            <div className="how-num">03</div>
            <div className="how-name">Generate</div>
            <div className="how-desc">Sonnet writes a unique message for every customer, grounded in their actual vehicle and time-in-vehicle. No two customers get the same text.</div>
          </div>
          <div className="how-step">
            <div className="how-num">04</div>
            <div className="how-name">Run</div>
            <div className="how-desc">AI handles &quot;yes&quot; and &quot;what time.&quot; Anything with a number queues to you. The Heat Sheet shows everything live.</div>
          </div>
        </div>
      </section>

      <section className="lp bone" id="tour">
        <div className="inner">
          <div className="lp-tag" style={{ color: "var(--orx-rust-dark)" }}>Product</div>
          <h2 style={{ color: "var(--orx-ink)" }}>Six surfaces. <em>One product.</em></h2>
          <p className="lead">
            Every screen below is the actual app. <Link href="/sign-in" style={{ color: "var(--orx-rust-dark)", textDecoration: "underline" }}>Sign in</Link> to walk through it yourself with seeded mock data.
          </p>
          <div className="how" style={{ borderColor: "var(--orx-rule)" }}>
            {[
              { n: "Heat Sheet", d: "Every active conversation, live. Approve, jump in, assign." },
              { n: "Game Plan Builder", d: "Six fields. Sign your attestation. Run." },
              { n: "Rex Lens", d: "Chrome extension. Scrapes any CRM result page." },
              { n: "Rex Coach", d: "Ask Rex anything. Build a Game Plan from a sentence." },
              { n: "Audit Vault", d: "Court-formatted compliance log, append-only." },
              { n: "Rep Mobile", d: "Reps get assignments with full context, ready to work." },
            ].map((s, i) => (
              <div key={s.n} className="how-step" style={{ borderColor: "var(--orx-rule)", color: "var(--orx-ink)" }}>
                <div className="how-num">{String(i + 1).padStart(2, "0")}</div>
                <div className="how-name">{s.n}</div>
                <div className="how-desc" style={{ color: "rgba(11,12,15,0.65)" }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp" id="pricing">
        <div className="lp-tag">Pricing</div>
        <h2>One price. <em>Per rooftop.</em> Per month.</h2>
        <div className="pricing">
          <div>
            <div className="price-strike">
              <s>Per-seat licensing.</s><br />
              <s>Per-message fees.</s><br />
              <s>Annual contracts.</s><br />
              <strong>Just $999. The store pays once.</strong>
            </div>
            <p className="lead" style={{ marginBottom: 0 }}>
              Equity miners charge $1,200–$2,500 a month and bill the GM. AI BDCs run $2k–$5k and bill marketing. Generic SMS tools bill per message and miss the equity logic. OpenRex collapses the three into one bill, paid by the desk.
            </p>
          </div>
          <div className="price-card">
            <div className="price-num">$999<span>/mo</span></div>
            <div className="price-sub">Single rooftop · cancel any time</div>
            <ul className="price-includes">
              <li>Unlimited Game Plans</li>
              <li>Per-customer LLM generation (Claude Sonnet)</li>
              <li>Rex Lens Chrome extension</li>
              <li>Heat Sheet web + mobile</li>
              <li>Rex Coach (Opus 4.7)</li>
              <li>Audit Vault + court-formatted PDF export</li>
              <li>Per-dealer 10DLC + Twilio Messaging Service</li>
              <li>DNC + quiet-hours + dedup enforced server-side</li>
              <li>Unlimited rep seats · Rep mobile app included</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <h2>Built for the desk. <em>Run from the desk.</em></h2>
        <p style={{ fontFamily: "Fraunces, serif", fontSize: 22, lineHeight: 1.45, maxWidth: 680, margin: "0 auto 36px", opacity: 0.9 }}>
          OpenRex is rolling out to a small group of single-rooftop franchise stores in 2026. If you&apos;re the desk manager (not the GM, not the marketing director), get on the list.
        </p>
        <Waitlist invert />
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <div>
            <div className="lp-logo" style={{ marginBottom: 14 }}>OpenRex</div>
            <p>The manager-led SMS campaign engine for car dealerships. Built by a sales manager who got tired of waiting for someone else to build it.</p>
          </div>
          <div>
            <h4>Product</h4>
            <Link href="/heat-sheet">Heat Sheet</Link>
            <Link href="/game-plans/new">Game Plan</Link>
            <Link href="/lens">Rex Lens</Link>
            <Link href="/audit">Audit Vault</Link>
          </div>
          <div>
            <h4>Company</h4>
            <a>About</a>
            <a>Brief (PDF)</a>
            <a>Compliance</a>
            <a>Contact</a>
          </div>
          <div>
            <h4>Legal</h4>
            <a>Terms</a>
            <a>Privacy</a>
            <a>TCPA stance</a>
            <a>DPA</a>
          </div>
        </div>
        <div className="lp-foot-bot">
          <span>OpenRex / Eddie Ponce / 2026</span>
          <span>Made on the floor of a dealership</span>
        </div>
      </footer>
    </div>
  );
}
