// Onboarding — 8-step playbook for new sales reps
const STEPS = [
  {
    n: '01',
    label: 'WELCOME',
    title: "Sell more.\nType less.",
    body: "PocketRep is your pocket sales floor. In 5 minutes you'll know exactly how to run your day from this phone — and pull ahead of every rep still using sticky notes.",
    illo: 'welcome',
  },
  {
    n: '02',
    label: 'YOUR MORNING',
    title: "Open Heat Sheet first.\nEvery day.",
    body: "Your watchlist of every active deal, sorted by temperature. Tap a contact to drill in. Counter on the right = days since last contact — when it turns red, move.",
    bullets: [
      { icon: '🔥', t: 'HOT', s: 'Buying within 7 days · touch daily' },
      { icon: '☀️', t: 'WARM', s: 'Active interest · touch every 3-4 days' },
      { icon: '👁', t: 'WATCH', s: 'Future buyers · touch weekly' },
    ],
    illo: 'heat',
  },
  {
    n: '03',
    label: 'CAPTURE FAST',
    title: "Tap Rex.\nTalk like a human.",
    body: "Walking off the showroom floor? Hold the gold orb and speak: \"Save Marcus Holloway, M3 Comp Brooklyn Grey, budget 82K, follow up Thursday.\" Rex parses, files, and sets the reminder.",
    tip: 'Pro tip: the more context you give Rex, the smarter your follow-ups become.',
    illo: 'orb',
  },
  {
    n: '04',
    label: 'CONTACTS',
    title: "Every detail.\nOne tap away.",
    body: "Open any contact to see vehicle interest, budget, trade-in, full activity timeline, and your private notes. The four buttons at the top (Call · Text · Email · Note) all log automatically.",
    illo: 'contact',
  },
  {
    n: '05',
    label: 'GAME PLAN',
    title: "Set it up once.\nIt runs forever.",
    body: "From the Contacts header, open Game Plan. Build sequences (multi-step cadences) and templates (with {{first_name}}, {{vehicle}} tokens). Enroll contacts and PocketRep texts, calls, and emails on your schedule.",
    bullets: [
      { icon: '◐', t: 'Start with 2 sequences', s: '"Fresh Up Follow Up" and "Sold Follow Up"' },
      { icon: '✎', t: 'Edit templates anytime', s: 'Rex shows you which ones convert' },
    ],
    illo: 'gameplan',
  },
  {
    n: '06',
    label: 'REX CHAT',
    title: "Stuck? Ask Rex.",
    body: "Tap the Rex tab. Ask for trade values, payment scenarios, inventory matches, or have Rex draft a follow-up text in your voice. Use the quick chips for the most common asks.",
    tip: 'Try: "Pull comps on a \'22 M240i with 32k miles"',
    illo: 'rex',
  },
  {
    n: '07',
    label: 'METRICS',
    title: "Watch the money.\nClose the month.",
    body: "Log every deal as it happens — Metrics auto-calculates commission, units, and your week-over-week trend. End of month, hit \"Close April\" to lock the period and start fresh.",
    illo: 'metrics',
  },
  {
    n: '08',
    label: "DAILY RHYTHM",
    title: "Two checks.\nThat's it.",
    body: "Set this rhythm and you'll never let a deal go cold:",
    bullets: [
      { icon: '☀', t: '8:00 AM — Morning brief', s: 'Open Heat Sheet, hit every HOT contact' },
      { icon: '🌙', t: '6:00 PM — Wrap-up', s: 'Log today\'s deals, advance sequences' },
      { icon: '☎', t: 'Friday — Review', s: 'Read Rex\'s weekly digest, tune templates' },
    ],
    illo: 'rhythm',
  },
];

function Illo({ kind }) {
  const wrap = (children) => (
    <div style={{
      width: '100%', maxWidth: 320,
      aspectRatio: '16 / 9',
      margin: '0 auto',
      background: T.ink2,
      border: `1px solid ${T.goldBorder}`,
      borderRadius: 16, padding: 14,
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
    }}>{children}</div>
  );

  switch (kind) {
    case 'welcome':
      return wrap(
        <div style={{
          height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: `linear-gradient(135deg, ${T.gold2}, ${T.gold})`,
            color: T.base, fontWeight: 900, fontSize: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 28px rgba(212,168,67,0.4)',
          }}>PR</div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
            color: T.gold, textTransform: 'uppercase',
          }}>POCKETREP</div>
        </div>
      );

    case 'heat':
      return wrap(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { name: 'Marcus Holloway', t: T.red, days: 1 },
            { name: 'Priya Raman', t: T.red, days: 2 },
            { name: 'Jonah Breckenridge', t: T.orange, days: 6 },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8,
              background: T.surface2, border: `1px solid ${T.ink4}`,
              position: 'relative',
            }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: r.t, borderRadius: '8px 0 0 8px' }} />
              <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: T.white, paddingLeft: 4 }}>{r.name}</div>
              <div style={{
                fontSize: 14, fontWeight: 800,
                color: r.days > 3 ? T.orange : T.green,
                fontVariantNumeric: 'tabular-nums',
              }}>{r.days}d</div>
            </div>
          ))}
        </div>
      );

    case 'orb':
      return wrap(
        <div style={{
          height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 14,
        }}>
          {/* listening rings */}
          <div style={{ position: 'relative', width: 56, height: 56 }}>
            <div style={{
              position: 'absolute', inset: -12, borderRadius: '50%',
              border: `1.5px solid ${T.gold}`, opacity: 0.5,
              animation: 'orbWave 1.4s ease-out infinite',
            }} />
            <div style={{
              width: 56, height: 56, borderRadius: 28,
              background: `radial-gradient(circle at 35% 30%, ${T.gold2} 0%, ${T.gold} 55%, #9a7530 100%)`,
              boxShadow: `0 0 24px rgba(212,168,67,0.55), inset -3px -3px 8px rgba(0,0,0,0.4), inset 3px 3px 6px rgba(255,220,140,0.5)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, color: 'rgba(20,15,5,0.7)', fontSize: 18,
            }}>R</div>
          </div>
          <div style={{
            padding: '8px 14px',
            background: T.surface2, border: `1px solid ${T.goldBorder}`,
            borderRadius: 999,
            fontSize: 11, color: T.gold, fontWeight: 600,
            letterSpacing: -0.1,
          }}>"Save Marcus, M3 Comp, follow Thursday"</div>
        </div>
      );

    case 'contact':
      return wrap(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16,
              background: T.goldBg, border: `1px solid ${T.goldBorder}`,
              color: T.gold, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>MH</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.white }}>Marcus Holloway</div>
              <div style={{ fontSize: 9, color: T.gold, marginTop: 1 }}>🔥 HOT · THIS WEEK</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['Call', 'Text', 'Email', 'Note'].map(a => (
              <div key={a} style={{
                flex: 1, textAlign: 'center', padding: '7px 0',
                background: T.goldBg, border: `1px solid ${T.goldBorder}`,
                borderRadius: 7,
                fontSize: 9, fontWeight: 700, color: T.gold,
                letterSpacing: 0.5, textTransform: 'uppercase',
              }}>{a}</div>
            ))}
          </div>
        </div>
      );

    case 'gameplan':
      return wrap(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
              color: T.gold, textTransform: 'uppercase',
            }}>FIRST TOUCH · COLD</span>
            <span style={{ marginLeft: 'auto', fontSize: 8, color: T.green, fontWeight: 700 }}>● LIVE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {[1, 1, 0, 0].map((on, i) => (
              <React.Fragment key={i}>
                <div style={{
                  width: 22, height: 22, borderRadius: 11,
                  background: on ? T.goldBg : T.ink3,
                  border: `1px solid ${on ? T.gold : T.ink4}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10,
                }}>{i === 2 ? '📞' : i === 3 ? '✉' : '💬'}</div>
                {i < 3 && <div style={{ flex: 1, height: 1.5, background: i < 1 ? T.gold : T.ink4 }} />}
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 9, color: T.grey2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>12 enrolled · next in 1d</div>
        </div>
      );

    case 'rex':
      return wrap(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            alignSelf: 'flex-end', maxWidth: '80%',
            padding: '8px 11px',
            background: T.goldBg, border: `1px solid ${T.goldBorder}`,
            borderRadius: '12px 12px 4px 12px',
            fontSize: 10, color: T.white, letterSpacing: -0.1,
          }}>What's a fair trade on a '22 M240i?</div>
          <div style={{
            alignSelf: 'flex-start', maxWidth: '85%',
            padding: '8px 11px',
            background: T.surface2, border: `1px solid ${T.ink4}`,
            borderRadius: '4px 12px 12px 12px',
            fontSize: 10, color: T.grey3, letterSpacing: -0.1, lineHeight: 1.45,
          }}>$39K trade-in. Recent auction avg: $39.6K. Lean $39K — gives you a $1K cushion.</div>
        </div>
      );

    case 'metrics':
      return wrap(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.grey2, letterSpacing: 1.0, marginBottom: 4 }}>COMMISSION MTD</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.gold2, letterSpacing: -0.6, fontVariantNumeric: 'tabular-nums' }}>$19,480</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 36 }}>
            {[3.2, 4.1, 2.8, 5.3, 4.7, 6.1, 5.8].map((v, i, arr) => (
              <div key={i} style={{
                flex: 1, height: `${(v / 6.5) * 100}%`,
                background: i === arr.length - 1 ? T.gold : T.goldBorder,
                borderRadius: '2px 2px 0 0',
              }} />
            ))}
          </div>
        </div>
      );

    case 'rhythm':
      return wrap(
        <div style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-around', padding: '4px 0',
        }}>
          {[
            { time: '8:00 AM', label: 'Heat Sheet brief' },
            { time: '12:00 PM', label: 'Mid-day Rex check' },
            { time: '6:00 PM', label: 'Log deals · advance' },
          ].map(r => (
            <div key={r.time} style={{
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: T.gold,
                fontFamily: T.font, letterSpacing: 0.5,
                fontVariantNumeric: 'tabular-nums',
                width: 56, flexShrink: 0,
              }}>{r.time}</div>
              <div style={{ flex: 1, height: 1, background: T.ink4 }} />
              <div style={{
                fontSize: 10, fontWeight: 600, color: T.grey3,
                fontFamily: T.font, letterSpacing: -0.1,
              }}>{r.label}</div>
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
}

function Onboarding({ open, onClose }) {
  const [i, setI] = React.useState(0);
  if (!open) return null;
  const s = STEPS[i];
  const last = i === STEPS.length - 1;

  const go = (delta) => {
    const next = i + delta;
    if (next < 0) return;
    if (next >= STEPS.length) { onClose(); setI(0); return; }
    setI(next);
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 95,
      background: T.base,
      display: 'flex', flexDirection: 'column',
      animation: 'detailIn 220ms cubic-bezier(0.2,0.7,0.2,1)',
    }}>
      {/* Top bar — progress + skip */}
      <div style={{
        padding: '50px 16px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, display: 'flex', gap: 4 }}>
          {STEPS.map((_, k) => (
            <div key={k} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: k <= i ? T.gold : T.ink4,
              transition: 'background 220ms',
            }} />
          ))}
        </div>
        <div
          onClick={() => { onClose(); setI(0); }}
          style={{
            fontSize: 12, fontWeight: 600, color: T.grey2,
            cursor: 'pointer', padding: '4px 8px',
            fontFamily: T.font, letterSpacing: -0.1,
          }}>Skip</div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 16px' }}>
        <div style={{
          fontSize: 60, fontWeight: 900, color: T.gold,
          fontFamily: T.font, letterSpacing: -2,
          lineHeight: 1, opacity: 0.85,
          fontVariantNumeric: 'tabular-nums',
        }}>{s.n}</div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
          color: T.gold, textTransform: 'uppercase',
          fontFamily: T.font, marginTop: 8,
        }}>{s.label}</div>
        <div style={{
          fontSize: 30, fontWeight: 800, color: T.white,
          fontFamily: T.font, letterSpacing: -0.8,
          lineHeight: 1.1, marginTop: 10, whiteSpace: 'pre-line',
        }}>{s.title}</div>
        <div style={{
          fontSize: 14, fontWeight: 500, color: T.grey3,
          fontFamily: T.font, letterSpacing: -0.1,
          lineHeight: 1.55, marginTop: 14,
          textWrap: 'pretty',
        }}>{s.body}</div>

        {/* Bullets */}
        {s.bullets && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {s.bullets.map((b, k) => (
              <div key={k} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 14px',
                background: T.surface2,
                border: `1px solid ${T.ink4}`,
                borderRadius: 12,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: T.goldBg, border: `1px solid ${T.goldBorder}`,
                  color: T.gold, fontSize: 14, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>{b.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: T.white,
                    fontFamily: T.font, letterSpacing: -0.1,
                  }}>{b.t}</div>
                  <div style={{
                    fontSize: 12, color: T.grey2, fontFamily: T.font,
                    marginTop: 2, lineHeight: 1.4,
                  }}>{b.s}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tip */}
        {s.tip && (
          <div style={{
            marginTop: 16,
            padding: '12px 14px',
            background: T.goldBg, border: `1px solid ${T.goldBorder}`,
            borderRadius: 12,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 14, marginTop: -1 }}>💡</span>
            <div style={{
              fontSize: 12, color: T.gold, fontFamily: T.font,
              fontWeight: 600, lineHeight: 1.45, letterSpacing: -0.1,
            }}>{s.tip}</div>
          </div>
        )}

        {/* Illustration */}
        <div style={{ marginTop: 22 }}>
          <Illo kind={s.illo} />
        </div>
      </div>

      {/* Bottom CTAs */}
      <div style={{
        padding: '14px 16px 30px',
        background: T.base,
        borderTop: `1px solid ${T.ink4}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div
          onClick={() => go(-1)}
          style={{
            width: 48, height: 48, borderRadius: 14,
            background: T.surface2, border: `1px solid ${T.ink4}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: i === 0 ? T.ghost : T.gold,
            fontSize: 18, cursor: i === 0 ? 'default' : 'pointer',
            opacity: i === 0 ? 0.4 : 1,
            flexShrink: 0,
          }}>‹</div>
        <button
          onClick={() => go(1)}
          style={{
            flex: 1, height: 48, borderRadius: 14, border: 'none',
            background: `linear-gradient(135deg, ${T.gold2}, ${T.gold})`,
            color: T.base, fontSize: 15, fontWeight: 800,
            fontFamily: T.font, letterSpacing: -0.2, cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(212,168,67,0.32)',
          }}>{last ? "Let's go" : `Next · ${i + 2}/${STEPS.length}`}</button>
      </div>
    </div>
  );
}

Object.assign(window, { Onboarding });
