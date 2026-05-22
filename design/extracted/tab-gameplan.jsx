// Gameplan tab — Sequences + Templates with inline template editor
const SEQUENCES = [
  {
    id: 1, name: 'Fresh Up Follow Up', live: true,
    enrolled: 12, step: 2, total: 4, nextIn: '1d',
    channels: ['text', 'text', 'call', 'email'],
  },
  {
    id: 2, name: 'Sold Follow Up · 30 / 60 / 90', live: true,
    enrolled: 8, step: 2, total: 4, nextIn: '4d',
    channels: ['text', 'email', 'call', 'text'],
  },
  {
    id: 3, name: 'Unsold Follow Up · marked lost', live: false,
    enrolled: 0, step: 0, total: 5, nextIn: 'draft',
    channels: ['text', 'email', 'text', 'call', 'email'],
  },
  {
    id: 4, name: 'Lease ending · 60 day', live: false,
    enrolled: 0, step: 0, total: 3, nextIn: 'draft',
    channels: ['text', 'email', 'call'],
  },
];

const TEMPLATES = [
  { id: 1, kind: 'text',  name: 'Fresh Up — first touch',     used: 84,
    body: "Hey {{first_name}}, this is {{rep_name}} at {{dealer}}. Saw you looked at the {{vehicle}} — want me to send a quick walkaround video?" },
  { id: 2, kind: 'text',  name: 'Sold Follow Up — 30 day',    used: 71,
    body: "Hi {{first_name}}, hope the {{vehicle}} has been treating you right these first few weeks. Any questions on the tech or service? Always here." },
  { id: 3, kind: 'text',  name: 'Trade-in follow-up',         used: 62,
    body: "Hi {{first_name}}, pulled comps on your {{trade_year}} {{trade_model}} — I can hit {{trade_value}} today if numbers work. Stop by?" },
  { id: 4, kind: 'text',  name: 'Test drive thank you',       used: 49,
    body: "Thanks for coming in today, {{first_name}}. Numbers attached. Anything else you want me to dig into on the {{vehicle}}?" },
  { id: 5, kind: 'email', name: 'Sold Follow Up — 90 day',    used: 38,
    body: "Hi {{first_name}},\n\nIt's been 90 days with the {{vehicle}} — you're due for your first service. Want me to set the appointment?\n\n– {{rep_name}}" },
  { id: 6, kind: 'email', name: 'Inventory match',            used: 37,
    body: "Hi {{first_name}},\n\nNew {{vehicle}} matching your wishlist just hit the lot in {{color}}. Pricing locked through Sunday.\n\n– {{rep_name}}" },
  { id: 7, kind: 'text',  name: 'Unsold recovery',            used: 22,
    body: "Hey {{first_name}}, things change — wanted to circle back. Have a few new {{vehicle}} allocations and the rates moved your way. Worth a quick look?" },
  { id: 8, kind: 'email', name: 'Lease maturity nudge',       used: 18,
    body: "Hi {{first_name}},\n\nYour {{vehicle}} lease matures {{lease_end}}. Equity position looks favorable — want a quick payoff scenario?\n\n– {{rep_name}}" },
];

const channelIcon = (k) => {
  const s = { fontSize: 11, color: T.gold };
  if (k === 'text') return <span style={s}>💬</span>;
  if (k === 'call') return <span style={s}>📞</span>;
  return <span style={s}>✉</span>;
};

function SequenceCard({ s, onTap }) {
  const pct = s.total ? (s.step / s.total) * 100 : 0;
  return (
    <div
      onClick={onTap}
      style={{
        position: 'relative',
        margin: '6px 14px',
        padding: '14px 14px 14px 18px',
        background: T.surface2,
        border: `1px solid ${s.live ? T.goldBorder : T.ink4}`,
        borderRadius: 12, cursor: 'pointer',
      }}
    >
      <HeatStripe color={s.live ? T.green : T.ghost} style={{ borderRadius: '12px 0 0 12px' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: T.white,
            fontFamily: T.font, letterSpacing: -0.2,
          }}>{s.name}</div>
          <div style={{
            fontSize: 11, color: T.grey2, fontFamily: T.font,
            marginTop: 3, fontVariantNumeric: 'tabular-nums',
          }}>
            {s.live ? `${s.enrolled} enrolled · next ${s.nextIn}` : 'Draft · not running'}
          </div>
        </div>
        {s.live ? (
          <Pill color={T.green}>● LIVE</Pill>
        ) : (
          <Pill color={T.grey2}>DRAFT</Pill>
        )}
      </div>

      {/* Channel pipeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {s.channels.map((c, i) => (
          <React.Fragment key={i}>
            <div style={{
              width: 22, height: 22, borderRadius: 11,
              background: i < s.step ? T.goldBg : T.ink3,
              border: `1px solid ${i < s.step ? T.gold : T.ink4}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: i < s.step ? 1 : 0.7,
            }}>{channelIcon(c)}</div>
            {i < s.channels.length - 1 && (
              <div style={{
                flex: 1, height: 1.5,
                background: i < s.step - 1 ? T.gold : T.ink4,
              }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {s.live && (
        <div style={{
          marginTop: 10, height: 3, borderRadius: 2,
          background: T.ink3, overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: `linear-gradient(90deg, ${T.gold2}, ${T.gold})`,
            transition: 'width 600ms',
          }} />
        </div>
      )}
    </div>
  );
}

function TemplateRow({ t, onTap }) {
  return (
    <div
      onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 16px',
        borderBottom: `1px solid ${T.ink4}`,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: T.goldBg, border: `1px solid ${T.goldBorder}`,
        color: T.gold, fontSize: 15, fontWeight: 700,
        fontFamily: T.font, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{t.kind === 'text' ? '💬' : '✉'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: T.white,
          fontFamily: T.font, letterSpacing: -0.15,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{t.name}</div>
        <div style={{
          fontSize: 11, color: T.grey2, fontFamily: T.font,
          marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>Used {t.used}× this month</div>
      </div>
      <span style={{ color: T.ghost, fontSize: 14 }}>›</span>
    </div>
  );
}

// Render template body with {{tokens}} highlighted gold
function renderBody(text) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((p, i) => {
    if (p.startsWith('{{') && p.endsWith('}}')) {
      return (
        <span key={i} style={{
          color: T.gold, fontWeight: 600,
          background: T.goldBg,
          padding: '1px 4px', borderRadius: 4,
          fontFamily: T.font,
        }}>{p.slice(2, -2)}</span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function TemplateEditor({ t, onClose, onSave }) {
  const [body, setBody] = React.useState(t.body);
  const [name, setName] = React.useState(t.name);
  const [showPreview, setShowPreview] = React.useState(true);

  const insertToken = (tok) => {
    setBody(b => b + ' {{' + tok + '}}');
  };

  const tokens = ['first_name', 'rep_name', 'dealer', 'vehicle', 'color', 'trade_value', 'lease_end'];

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 80,
      background: T.base,
      animation: 'detailIn 220ms cubic-bezier(0.2,0.7,0.2,1)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        padding: '52px 14px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${T.ink4}`,
        background: T.ink2,
      }}>
        <div
          onClick={onClose}
          style={{
            padding: '8px 14px', borderRadius: 18,
            background: T.surface2, border: `1px solid ${T.ink4}`,
            color: T.grey2, fontSize: 13, fontWeight: 600,
            fontFamily: T.font, cursor: 'pointer',
          }}>Cancel</div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            color: T.gold, textTransform: 'uppercase', fontFamily: T.font,
          }}>{t.kind === 'text' ? 'TEXT TEMPLATE' : 'EMAIL TEMPLATE'}</div>
          <div style={{
            fontSize: 13, fontWeight: 600, color: T.white,
            fontFamily: T.font, marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 200, margin: '2px auto 0',
          }}>Edit</div>
        </div>
        <div
          onClick={() => { onSave({ ...t, name, body }); onClose(); }}
          style={{
            padding: '8px 14px', borderRadius: 18,
            background: T.gold, color: T.base,
            fontSize: 13, fontWeight: 700, fontFamily: T.font,
            cursor: 'pointer',
          }}>Save</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {/* Name */}
        <div style={{ padding: '14px 14px 0' }}>
          <Label color={T.grey2}>TEMPLATE NAME</Label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: '100%', marginTop: 8,
              background: T.surface2,
              border: `1px solid ${T.ink4}`,
              borderRadius: 10, padding: '12px 14px',
              color: T.white, fontSize: 15, fontWeight: 600,
              fontFamily: T.font, outline: 'none',
              letterSpacing: -0.2,
            }}
          />
        </div>

        {/* Body */}
        <div style={{ padding: '14px 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Label color={T.grey2}>BODY</Label>
            <div
              onClick={() => setShowPreview(p => !p)}
              style={{
                fontSize: 11, fontWeight: 700, color: T.gold,
                letterSpacing: 1.0, fontFamily: T.font,
                cursor: 'pointer', textTransform: 'uppercase',
              }}>{showPreview ? 'Edit raw' : 'Preview'}</div>
          </div>
          {showPreview ? (
            <div style={{
              marginTop: 8,
              background: T.surface2, border: `1px solid ${T.ink4}`,
              borderRadius: 10, padding: '14px',
              minHeight: 130,
              color: T.grey3, fontSize: 14, lineHeight: 1.55,
              fontFamily: T.font, letterSpacing: -0.1,
              whiteSpace: 'pre-wrap',
            }}>{renderBody(body)}</div>
          ) : (
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              style={{
                width: '100%', marginTop: 8,
                background: T.surface2,
                border: `1px solid ${T.ink4}`,
                borderRadius: 10, padding: '14px',
                color: T.white, fontSize: 14, lineHeight: 1.55,
                fontFamily: T.mono, outline: 'none', resize: 'vertical',
                minHeight: 130,
              }}
            />
          )}
        </div>

        {/* Token chips */}
        <div style={{ padding: '16px 14px 6px' }}>
          <Label color={T.grey2}>INSERT TOKEN</Label>
        </div>
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto',
          padding: '0 14px 14px', flexWrap: 'wrap',
        }}>
          {tokens.map(tok => (
            <div
              key={tok}
              onClick={() => insertToken(tok)}
              style={{
                padding: '7px 11px',
                background: T.surface2,
                border: `1px solid ${T.goldBorder}`,
                borderRadius: 999,
                fontSize: 11, fontWeight: 600, color: T.gold,
                fontFamily: T.mono, cursor: 'pointer',
                letterSpacing: -0.1,
              }}>{`{{${tok}}}`}</div>
          ))}
        </div>

        {/* Coach card from Rex */}
        <div style={{
          margin: '6px 14px 0',
          padding: '12px 14px',
          background: T.goldBg,
          border: `1px solid ${T.goldBorder}`,
          borderRadius: 12,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 13, flexShrink: 0,
            background: `radial-gradient(circle at 35% 30%, ${T.gold2} 0%, ${T.gold} 70%)`,
            boxShadow: '0 0 8px rgba(212,168,67,0.4)',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
              color: T.gold, textTransform: 'uppercase', fontFamily: T.font,
            }}>REX SUGGESTS</div>
            <div style={{
              fontSize: 12, color: T.grey3, fontFamily: T.font,
              marginTop: 4, lineHeight: 1.45,
            }}>Open rate on this template is 62%. Try asking one specific question instead of "anything else?" — your high-reply variant gets 81%.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameplanTab() {
  const [editing, setEditing] = React.useState(null);
  const [tab, setTab] = React.useState('sequences'); // sequences | templates
  const [templates, setTemplates] = React.useState(TEMPLATES);

  const saveTemplate = (t) => {
    setTemplates(arr => arr.map(x => x.id === t.id ? t : x));
  };

  return (
    <div style={{ paddingBottom: 20 }}>
      {/* Inner segmented */}
      <div style={{ padding: '10px 14px 4px' }}>
        <div style={{
          display: 'flex',
          background: T.ink2,
          border: `1px solid ${T.ink4}`,
          borderRadius: 10, padding: 3,
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: 3, bottom: 3,
            width: 'calc(50% - 3px)',
            left: tab === 'sequences' ? 3 : 'calc(50% + 0px)',
            background: T.surface2,
            border: `1px solid ${T.goldBorder}`,
            borderRadius: 8,
            transition: 'left 200ms cubic-bezier(0.2,0.7,0.2,1)',
          }} />
          {['sequences', 'templates'].map(k => (
            <div
              key={k}
              onClick={() => setTab(k)}
              style={{
                flex: 1, padding: '9px 0', textAlign: 'center',
                fontSize: 12, fontWeight: 700, letterSpacing: 0.8,
                color: tab === k ? T.gold : T.grey2,
                textTransform: 'uppercase', fontFamily: T.font,
                position: 'relative', zIndex: 1, cursor: 'pointer',
              }}>{k === 'sequences' ? `Sequences · ${SEQUENCES.filter(s => s.live).length}` : `Templates · ${templates.length}`}</div>
          ))}
        </div>
      </div>

      {tab === 'sequences' && (
        <>
          {/* Status banner */}
          <div style={{
            margin: '10px 14px 4px',
            padding: '12px 14px',
            background: T.goldBg, border: `1px solid ${T.goldBorder}`,
            borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <Label color={T.gold}>THIS WEEK</Label>
              <div style={{
                fontSize: 13, fontWeight: 600, color: T.white,
                fontFamily: T.font, marginTop: 3, letterSpacing: -0.1,
              }}>20 in cadence · 7 replies · 3 booked</div>
            </div>
            <StatNumber value="35" suffix="%" size={24} color={T.gold2} />
          </div>

          <SectionHead label="ACTIVE" count={SEQUENCES.filter(s => s.live).length} color={T.green} />
          {SEQUENCES.filter(s => s.live).map(s => <SequenceCard key={s.id} s={s} />)}

          <SectionHead label="DRAFTS" count={SEQUENCES.filter(s => !s.live).length} color={T.grey2} />
          {SEQUENCES.filter(s => !s.live).map(s => <SequenceCard key={s.id} s={s} />)}

          {/* New sequence */}
          <div style={{ padding: '14px' }}>
            <button style={{
              width: '100%', height: 48, borderRadius: 12,
              background: 'transparent',
              border: `1.5px dashed ${T.goldBorderStrong}`,
              color: T.gold, fontSize: 13, fontWeight: 700,
              fontFamily: T.font, letterSpacing: 0.5,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>＋ NEW SEQUENCE</button>
          </div>
        </>
      )}

      {tab === 'templates' && (
        <>
          {/* Sub-segment by channel */}
          <div style={{ display: 'flex', gap: 6, padding: '12px 14px 6px', overflowX: 'auto' }}>
            {['All', 'Text · 4', 'Email · 2', 'Most used'].map((f, i) => (
              <div key={f} style={{
                padding: '6px 12px',
                background: i === 0 ? T.gold : T.surface2,
                border: `1px solid ${i === 0 ? T.gold : T.ink4}`,
                borderRadius: 999, cursor: 'pointer', flexShrink: 0,
                fontSize: 12, fontWeight: 600,
                color: i === 0 ? T.base : T.grey3, fontFamily: T.font,
              }}>{f}</div>
            ))}
          </div>

          <SectionHead label="YOUR TEMPLATES" count={templates.length} />
          <div style={{
            margin: '0 14px',
            background: T.surface2,
            border: `1px solid ${T.ink4}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            {templates.map((t, i) => (
              <div key={t.id} style={i === templates.length - 1 ? {} : {}}>
                <TemplateRow t={t} onTap={() => setEditing(t)} />
              </div>
            ))}
          </div>

          {/* New template */}
          <div style={{ padding: '14px' }}>
            <button style={{
              width: '100%', height: 48, borderRadius: 12,
              background: 'transparent',
              border: `1.5px dashed ${T.goldBorderStrong}`,
              color: T.gold, fontSize: 13, fontWeight: 700,
              fontFamily: T.font, letterSpacing: 0.5,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>＋ NEW TEMPLATE</button>
          </div>

          {/* Rex coach */}
          <SectionHead label="REX'S TAKE" color={T.gold} />
          <div style={{
            margin: '0 14px',
            padding: '14px 16px',
            background: T.surface2,
            border: `1px solid ${T.goldBorder}`,
            borderRadius: 12,
          }}>
            <div style={{
              fontSize: 13, fontWeight: 500, color: T.grey3,
              fontFamily: T.font, lineHeight: 1.5, letterSpacing: -0.1,
            }}>Your "Trade-in follow-up" is converting 41% to reply — that's top decile. Want me to clone it into a lease variant and queue it for your 8 maturing leases?</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <div style={{
                padding: '8px 14px', borderRadius: 999,
                background: T.gold, color: T.base,
                fontSize: 12, fontWeight: 700, fontFamily: T.font,
                cursor: 'pointer',
              }}>Clone it</div>
              <div style={{
                padding: '8px 14px', borderRadius: 999,
                background: 'transparent', color: T.gold,
                border: `1px solid ${T.goldBorder}`,
                fontSize: 12, fontWeight: 700, fontFamily: T.font,
                cursor: 'pointer',
              }}>Dismiss</div>
            </div>
          </div>
        </>
      )}

      {/* Editor overlay */}
      {editing && (
        <TemplateEditor
          t={editing}
          onClose={() => setEditing(null)}
          onSave={saveTemplate}
        />
      )}
    </div>
  );
}

Object.assign(window, { GameplanTab });
