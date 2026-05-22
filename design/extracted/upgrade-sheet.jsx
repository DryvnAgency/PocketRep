// Upgrade sheet — opens from PR mark in top-left
function UpgradeSheet({ open, onClose }) {
  const [plan, setPlan] = React.useState('pro');
  if (!open) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 90,
      animation: 'fadeIn 200ms ease-out',
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>

      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(5,5,8,0.72)',
          backdropFilter: 'blur(6px)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: T.ink2,
        borderTop: `1px solid ${T.goldBorder}`,
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -30px 60px rgba(0,0,0,0.5)',
        animation: 'sheetUp 320ms cubic-bezier(0.2,0.7,0.2,1)',
        maxHeight: '90%', overflowY: 'auto',
      }}>
        {/* grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 42, height: 4, borderRadius: 2, background: T.ink4 }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 24px', textAlign: 'center', position: 'relative' }}>
          <div
            onClick={onClose}
            style={{
              position: 'absolute', top: 8, right: 16,
              width: 32, height: 32, borderRadius: 16,
              background: T.surface2, border: `1px solid ${T.ink4}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.grey2, fontSize: 14, cursor: 'pointer',
            }}>✕</div>

          {/* Big gold mark */}
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: `linear-gradient(135deg, ${T.gold2}, ${T.gold})`,
            color: T.base, fontWeight: 900, fontSize: 22,
            fontFamily: T.font, letterSpacing: -0.8,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            margin: '8px auto 14px',
            boxShadow: '0 8px 24px rgba(212,168,67,0.35)',
          }}>PR</div>

          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
            color: T.gold, textTransform: 'uppercase', fontFamily: T.font,
          }}>POCKETREP MAX</div>
          <div style={{
            fontSize: 24, fontWeight: 800, color: T.white,
            fontFamily: T.font, letterSpacing: -0.6, marginTop: 6,
            lineHeight: 1.2,
          }}>Close more.<br/>Type less.</div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: T.grey2,
            fontFamily: T.font, marginTop: 10, lineHeight: 1.5,
            maxWidth: 280, margin: '10px auto 0',
          }}>Unlimited Rex, unlimited sequences, dealer-grade analytics.</div>
        </div>

        {/* Features */}
        <div style={{ padding: '0 16px 18px' }}>
          {[
            { icon: '⚡', t: 'Unlimited Rex chats', s: 'No daily cap. Faster model.' },
            { icon: '◐', t: 'Unlimited sequences', s: 'Run as many cadences as you want.' },
            { icon: '◈', t: 'Dealer analytics', s: 'Pipeline forecast, win-rate by source.' },
            { icon: '↗', t: 'Priority CRM sync', s: 'VinSolutions, DealerSocket, eLead.' },
            { icon: '☎', t: 'Auto call summaries', s: 'Rex listens, logs, files in CRM.' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 4px',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: T.goldBg, border: `1px solid ${T.goldBorder}`,
                color: T.gold, fontSize: 16, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{f.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: T.white,
                  fontFamily: T.font, letterSpacing: -0.2,
                }}>{f.t}</div>
                <div style={{
                  fontSize: 12, color: T.grey2, fontFamily: T.font,
                  marginTop: 2, lineHeight: 1.4,
                }}>{f.s}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Plan toggle */}
        <div style={{ padding: '4px 16px 12px' }}>
          {[
            { id: 'pro',    name: 'Pro · Monthly', sub: 'Cancel anytime', price: '$39', per: '/mo' },
            { id: 'annual', name: 'Pro · Annual',  sub: 'Save $108 · 2 months free', price: '$29', per: '/mo', best: true },
            { id: 'team',   name: 'Team',          sub: 'For 3+ reps · per seat', price: '$24', per: '/mo' },
          ].map(p => (
            <div
              key={p.id}
              onClick={() => setPlan(p.id)}
              style={{
                position: 'relative',
                margin: '8px 0',
                padding: '14px 16px',
                background: plan === p.id ? T.goldBg : T.surface2,
                border: `1.5px solid ${plan === p.id ? T.gold : T.ink4}`,
                borderRadius: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              {p.best && (
                <div style={{
                  position: 'absolute', top: -8, right: 14,
                  background: T.gold, color: T.base,
                  fontSize: 9, fontWeight: 800, letterSpacing: 1.0,
                  padding: '3px 8px', borderRadius: 999,
                  fontFamily: T.font, textTransform: 'uppercase',
                }}>BEST VALUE</div>
              )}
              <div style={{
                width: 22, height: 22, borderRadius: 11,
                border: `2px solid ${plan === p.id ? T.gold : T.ink4}`,
                background: plan === p.id ? T.gold : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {plan === p.id && (
                  <svg width="11" height="9" viewBox="0 0 14 12"><path d="M1 6l4 4 8-9" stroke={T.base} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: T.white,
                  fontFamily: T.font, letterSpacing: -0.2,
                }}>{p.name}</div>
                <div style={{
                  fontSize: 11, color: T.grey2, fontFamily: T.font, marginTop: 2,
                }}>{p.sub}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  fontSize: 20, fontWeight: 800, color: T.white,
                  fontFamily: T.font, letterSpacing: -0.5,
                  fontVariantNumeric: 'tabular-nums',
                }}>{p.price}</span>
                <span style={{
                  fontSize: 11, color: T.grey2, fontFamily: T.font, marginLeft: 2,
                }}>{p.per}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ padding: '4px 16px 20px' }}>
          <button style={{
            width: '100%', height: 52, borderRadius: 14,
            background: `linear-gradient(135deg, ${T.gold2}, ${T.gold})`,
            border: 'none', cursor: 'pointer',
            color: T.base, fontSize: 16, fontWeight: 800,
            fontFamily: T.font, letterSpacing: -0.2,
            boxShadow: '0 8px 24px rgba(212,168,67,0.32)',
          }}>Start 7-day free trial</button>
          <div style={{
            textAlign: 'center', marginTop: 10,
            fontSize: 11, color: T.ghost, fontFamily: T.font,
            letterSpacing: 0.2,
          }}>Cancel anytime · No card required for trial</div>
        </div>

        {/* Safe area */}
        <div style={{ height: 28 }} />
      </div>
    </div>
  );
}

Object.assign(window, { UpgradeSheet });
