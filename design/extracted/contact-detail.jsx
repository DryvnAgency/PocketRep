// Contact detail — view + edit a single contact with notes, AI reply, photo, tags
function ContactDetail({ c, onClose, deals, onLogDeal, onUpdate, allTags }) {
  const tier = TIERS[c.tier];
  const contactDeals = (deals || []).filter(d =>
    d.contactId === c.id || d.name.toLowerCase() === c.name.toLowerCase()
  ).sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalCommission = contactDeals.reduce((s, d) => s + d.amount, 0);

  // Editable local state
  const [notes, setNotes] = React.useState(c.notes || '');
  const [notesDirty, setNotesDirty] = React.useState(false);
  const [editingNotes, setEditingNotes] = React.useState(false);
  const [tagPickerOpen, setTagPickerOpen] = React.useState(false);

  // AI reply
  const [aiOpen, setAiOpen] = React.useState(false);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiText, setAiText] = React.useState('');
  const [aiChannel, setAiChannel] = React.useState('text');
  const [aiReasoning, setAiReasoning] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  // Latest Activity vs Next Step toggle
  const [stepView, setStepView] = React.useState('latest');

  const fileRef = React.useRef(null);

  // Reset state when contact changes
  React.useEffect(() => {
    setNotes(c.notes || '');
    setNotesDirty(false);
    setEditingNotes(false);
    setAiOpen(false);
    setAiText('');
  }, [c.id]);

  const saveNotes = () => {
    onUpdate({ ...c, notes });
    setNotesDirty(false);
    setEditingNotes(false);
  };

  const handlePhoto = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onUpdate({ ...c, photo: e.target.result });
    reader.readAsDataURL(file);
  };

  const toggleTag = (tagName) => {
    const has = (c.tags || []).includes(tagName);
    const next = has
      ? (c.tags || []).filter(t => t !== tagName)
      : [...(c.tags || []), tagName];
    onUpdate({ ...c, tags: next });
  };

  const tagColor = (name) => {
    const t = (allTags || []).find(t => t.name === name);
    return t ? t.color : T.gold;
  };

  // Generate Game Plan — Rex picks channel + drafts message based on notes
  const generateGamePlan = async () => {
    setAiOpen(true);
    setAiLoading(true);
    setAiText('');
    setAiReasoning('');
    setCopied(false);

    const prompt = `You are Rex, the AI sales coach inside PocketRep. Coach Jake (senior BMW advisor at BMW of Pleasanton) on his next move with this customer.

Customer context:
- Name: ${c.name}
- Vehicle of interest: ${c.vehicle}, ${c.trim}
- Budget: $${c.budget}
- Trade-in: ${c.tradeIn || 'none'}
- Plan: ${c.plan}
- Tier: ${tier.label} (${c.days} days since last contact)

Jake's notes on this customer:
${notes || '(no notes yet)'}

Pick the single best NEXT action: call, text, or email. Then draft the exact script.

Respond in EXACTLY this format (no extra text):
CHANNEL: <call | text | email>
WHY: <one sentence, max 18 words>
SCRIPT:
<For a call: opening line + 2-3 key questions. For text: 2-3 sentences, no emojis. For email: short body, no signature. End with "Jake" only on text/email.>`;

    try {
      const out = await window.claude.complete(prompt);
      const raw = (out || '').trim();
      const chMatch = raw.match(/CHANNEL:\s*(call|text|email)/i);
      const whyMatch = raw.match(/WHY:\s*([^\n]+)/i);
      const scrIdx = raw.toUpperCase().indexOf('SCRIPT:');
      setAiChannel(chMatch ? chMatch[1].toLowerCase() : 'text');
      setAiReasoning(whyMatch ? whyMatch[1].trim() : '');
      setAiText(scrIdx >= 0 ? raw.slice(scrIdx + 7).trim() : raw);
    } catch (e) {
      setAiChannel('text');
      setAiReasoning("Cold lead recovery moves fastest by text.");
      setAiText("Hey " + c.name.split(' ')[0] + " — wanted to check in on the " + c.vehicle + ". Any questions I can help with this week?\n\n— Jake");
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopy = () => {
    if (navigator.clipboard && aiText) {
      navigator.clipboard.writeText(aiText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const handleSendText = () => {
    const body = encodeURIComponent(aiText);
    const phone = c.phone.replace(/[^\d]/g, '');
    window.location.href = `sms:${phone}?&body=${body}`;
  };

  const handleCall = () => {
    const phone = c.phone.replace(/[^\d]/g, '');
    window.location.href = `tel:${phone}`;
  };

  const handleSendEmail = () => {
    const subject = encodeURIComponent(`Following up on the ${c.vehicle}`);
    const body = encodeURIComponent(aiText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 80,
      background: T.base,
      animation: 'detailIn 220ms cubic-bezier(0.2,0.7,0.2,1)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <style>{`@keyframes detailIn { from { transform: translateX(20px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => handlePhoto(e.target.files && e.target.files[0])}
      />

      {/* Top bar */}
      <div style={{
        padding: '52px 14px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${T.ink4}`,
        background: T.ink2,
      }}>
        <div onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 18,
          background: T.surface2, border: `1px solid ${T.ink4}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.gold, fontSize: 18, cursor: 'pointer',
        }}>‹</div>
        <div style={{ flex: 1 }} />
        <div style={{
          width: 36, height: 36, borderRadius: 18,
          background: T.surface2, border: `1px solid ${T.ink4}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.grey2, fontSize: 14, cursor: 'pointer',
        }}>⋯</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>
        {/* Hero */}
        <div style={{ padding: '20px 16px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Photo / Avatar — tap to upload */}
          <div
            onClick={() => fileRef.current && fileRef.current.click()}
            style={{
              position: 'relative', cursor: 'pointer', flexShrink: 0,
            }}>
            {c.photo ? (
              <img src={c.photo} alt={c.name} style={{
                width: 68, height: 68, borderRadius: 34, objectFit: 'cover',
                border: `2px solid ${T.goldBorderStrong}`,
              }} />
            ) : (
              <Avatar name={c.name} size={68} />
            )}
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 24, height: 24, borderRadius: 12,
              background: T.gold, color: T.base,
              border: `2px solid ${T.base}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800,
            }}>
              {c.photo ? '↻' : '＋'}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 22, fontWeight: 700, color: T.white,
              fontFamily: T.font, letterSpacing: -0.5,
            }}>{c.name}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Pill color={tier.color}>{tier.icon} {tier.label}</Pill>
              <Pill color={T.gold}>{c.plan}</Pill>
            </div>
          </div>
        </div>

        {/* Quick action row */}
        <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px' }}>
          {[
            { label: 'Call',  icon: '📞', href: `tel:${c.phone.replace(/[^\d]/g, '')}` },
            { label: 'Text',  icon: '💬', href: `sms:${c.phone.replace(/[^\d]/g, '')}` },
            { label: 'Email', icon: '✉️', href: `mailto:` },
            { label: 'Note',  icon: '📝', onClick: () => { setEditingNotes(true); setTimeout(() => { document.getElementById('notes-area')?.focus(); }, 50); } },
          ].map(a => (
            <a
              key={a.label}
              href={a.href}
              onClick={(e) => { if (a.onClick) { e.preventDefault(); a.onClick(); } }}
              style={{
                flex: 1, textDecoration: 'none',
                background: T.goldBg, border: `1px solid ${T.goldBorder}`,
                borderRadius: 10, padding: '12px 6px',
                textAlign: 'center', cursor: 'pointer',
                display: 'block',
              }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{a.icon}</div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: T.gold,
                letterSpacing: 1.0, textTransform: 'uppercase', fontFamily: T.font,
              }}>{a.label}</div>
            </a>
          ))}
        </div>

        {/* Custom tags row */}
        <div style={{
          display: 'flex', gap: 6, padding: '0 14px 16px',
          flexWrap: 'wrap',
        }}>
          {(c.tags || []).map(t => (
            <div
              key={t}
              onClick={() => toggleTag(t)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 10px',
                background: `color-mix(in oklab, ${tagColor(t)} 12%, transparent)`,
                border: `1px solid color-mix(in oklab, ${tagColor(t)} 35%, transparent)`,
                borderRadius: 999, cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                color: tagColor(t),
                letterSpacing: 0.3, fontFamily: T.font,
              }}>
              <span style={{
                width: 5, height: 5, borderRadius: 3,
                background: tagColor(t),
              }} />
              {t}
            </div>
          ))}
          <div
            onClick={() => setTagPickerOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 10px',
              border: `1px dashed ${T.goldBorder}`,
              borderRadius: 999, cursor: 'pointer',
              fontSize: 11, fontWeight: 700,
              color: T.gold,
              letterSpacing: 0.3, fontFamily: T.font,
            }}>
            ＋ Add tag
          </div>
        </div>

        {/* Vehicle interest */}
        <SectionHead label="VEHICLE INTEREST" />
        <div style={{
          margin: '0 14px', padding: '14px 16px',
          background: T.surface2, border: `1px solid ${T.ink4}`,
          borderRadius: 12,
        }}>
          <div style={{
            fontSize: 17, fontWeight: 700, color: T.white,
            fontFamily: T.font, letterSpacing: -0.3,
          }}>{c.vehicle}</div>
          <div style={{
            fontSize: 12, color: T.grey2, fontFamily: T.font, marginTop: 4,
          }}>{c.trim}</div>
          <div style={{
            display: 'flex', gap: 12, marginTop: 12,
            paddingTop: 12, borderTop: `1px solid ${T.ink4}`,
          }}>
            <div style={{ flex: 1 }}>
              <Label color={T.grey2}>BUDGET</Label>
              <div style={{
                fontSize: 16, fontWeight: 700, color: T.white,
                fontFamily: T.font, fontVariantNumeric: 'tabular-nums', marginTop: 4,
              }}>${c.budget}</div>
            </div>
            <div style={{ flex: 1 }}>
              <Label color={T.grey2}>TRADE-IN</Label>
              <div style={{
                fontSize: 14, fontWeight: 600, color: T.white,
                fontFamily: T.font, marginTop: 4,
              }}>{c.tradeIn}</div>
            </div>
          </div>
        </div>

        {/* Latest Activity / Next Step toggle */}
        <div style={{ padding: '20px 14px 8px' }}>
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
              left: stepView === 'latest' ? 3 : 'calc(50% + 0px)',
              background: T.surface2,
              border: `1px solid ${T.goldBorder}`,
              borderRadius: 8,
              transition: 'left 200ms cubic-bezier(0.2,0.7,0.2,1)',
            }} />
            {[
              { id: 'latest', label: 'Latest Activity' },
              { id: 'next',   label: 'Next Step' },
            ].map(k => (
              <div
                key={k.id}
                onClick={() => setStepView(k.id)}
                style={{
                  flex: 1, padding: '9px 0', textAlign: 'center',
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                  color: stepView === k.id ? T.gold : T.grey2,
                  textTransform: 'uppercase', fontFamily: T.font,
                  position: 'relative', zIndex: 1, cursor: 'pointer',
                }}>{k.label}</div>
            ))}
          </div>
        </div>

        {stepView === 'latest' ? (
          <div style={{
            margin: '0 14px',
            background: T.surface2, border: `1px solid ${T.ink4}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            {(c.milestones || []).map((m, i, arr) => {
              const milestoneIcon = {
                'visit':       { i: '👋', c: T.gold },
                'test-drive':  { i: '🚗', c: T.green },
                'numbers':     { i: '🧮', c: T.gold2 },
                'docs':        { i: '📄', c: T.grey3 },
                'objection':   { i: '⚠', c: T.orange },
                'no-response': { i: '∅', c: T.red },
              }[m.kind] || { i: '●', c: T.gold };
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px',
                  borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${T.ink4}`,
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 8,
                    background: `color-mix(in oklab, ${milestoneIcon.c} 14%, transparent)`,
                    border: `1px solid color-mix(in oklab, ${milestoneIcon.c} 30%, transparent)`,
                    color: milestoneIcon.c,
                    fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 1,
                  }}>{milestoneIcon.i}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: 1.0,
                      color: milestoneIcon.c, textTransform: 'uppercase',
                      fontFamily: T.font, marginBottom: 3,
                    }}>{m.kind.replace('-', ' ')}</div>
                    <div style={{
                      fontSize: 13, fontWeight: 500, color: T.grey3,
                      fontFamily: T.font, letterSpacing: -0.1, lineHeight: 1.4,
                    }}>{m.t}</div>
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: T.ghost,
                    fontFamily: T.font, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                  }}>{m.d}</div>
                </div>
              );
            })}
            <div style={{
              padding: '10px 14px',
              borderTop: `1px solid ${T.ink4}`,
              background: T.ink2,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9,
                background: `radial-gradient(circle at 35% 30%, ${T.gold2} 0%, ${T.gold} 70%)`,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 11, color: T.grey2, fontFamily: T.font,
                letterSpacing: -0.1, fontStyle: 'italic',
              }}>Rex auto-logs milestones when you update notes</span>
            </div>
          </div>
        ) : (
          <div style={{
            margin: '0 14px',
            background: T.goldBg,
            border: `1px solid ${T.goldBorder}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 14px 0',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 11,
                background: `radial-gradient(circle at 35% 30%, ${T.gold2} 0%, ${T.gold} 70%)`,
                boxShadow: '0 0 6px rgba(212,168,67,0.4)',
                flexShrink: 0,
              }} />
              <Label color={T.gold}>REX RECOMMENDS</Label>
            </div>
            <div style={{
              padding: '10px 14px 14px',
              fontSize: 14, fontWeight: 500, color: T.white,
              fontFamily: T.font, lineHeight: 1.5, letterSpacing: -0.1,
            }}>{c.nextStep || 'Add notes and tap Game Plan — Rex will write your next move.'}</div>
            <div style={{
              padding: '10px 12px',
              borderTop: `1px solid ${T.goldBorder}`,
              background: 'rgba(0,0,0,0.18)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ flex: 1, fontSize: 10, fontWeight: 600, color: T.gold, letterSpacing: 0.3 }}>Auto-generated from your notes</div>
              <span style={{
                fontSize: 10, fontWeight: 700, color: T.gold,
                fontFamily: T.font, cursor: 'pointer',
                letterSpacing: 0.5, textTransform: 'uppercase',
              }}>↻ Refresh</span>
            </div>
          </div>
        )}

        {/* NOTES — editable + AI generate */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '20px 16px 8px',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            textTransform: 'uppercase', color: T.gold,
            fontFamily: T.font,
          }}>NOTES</span>
          <div style={{ flex: 1 }} />
          {editingNotes ? (
            <>
              <span
                onClick={() => { setNotes(c.notes || ''); setEditingNotes(false); setNotesDirty(false); }}
                style={{
                  fontSize: 11, fontWeight: 600, color: T.grey2,
                  fontFamily: T.font, cursor: 'pointer',
                  padding: '4px 8px',
                }}>Cancel</span>
              <span
                onClick={saveNotes}
                style={{
                  fontSize: 11, fontWeight: 700, color: T.gold,
                  fontFamily: T.font, cursor: 'pointer',
                  padding: '4px 8px', letterSpacing: 0.3,
                  textTransform: 'uppercase',
                }}>Save</span>
            </>
          ) : (
            <span
              onClick={() => setEditingNotes(true)}
              style={{
                fontSize: 11, fontWeight: 700, color: T.gold,
                fontFamily: T.font, cursor: 'pointer',
                letterSpacing: 0.5, textTransform: 'uppercase',
              }}>Edit ›</span>
          )}
        </div>

        <div
          onClick={() => !editingNotes && setEditingNotes(true)}
          style={{
            margin: '0 14px',
            background: T.surface2, border: `1px solid ${editingNotes ? T.gold : T.ink4}`,
            borderRadius: 12, padding: '14px 16px',
            cursor: editingNotes ? 'text' : 'pointer',
            transition: 'border-color 120ms',
          }}>
          {editingNotes ? (
            <textarea
              id="notes-area"
              value={notes}
              onChange={e => { setNotes(e.target.value); setNotesDirty(true); }}
              autoFocus
              style={{
                width: '100%', minHeight: 120,
                background: 'transparent', border: 'none', outline: 'none',
                color: T.white, fontSize: 13, fontWeight: 500,
                fontFamily: T.font, letterSpacing: -0.1, lineHeight: 1.55,
                resize: 'vertical', padding: 0,
              }}
              placeholder="What did you learn from the customer today?"
            />
          ) : (
            <div style={{
              fontSize: 13, fontWeight: 500, color: notes ? T.grey3 : T.ghost,
              fontFamily: T.font, letterSpacing: -0.1, lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              fontStyle: notes ? 'normal' : 'italic',
            }}>{notes || 'Tap to add notes about this customer…'}</div>
          )}
        </div>

        {/* GAME PLAN button — single CTA, Rex picks the channel */}
        <div style={{ padding: '12px 14px 0' }}>
          <button
            onClick={generateGamePlan}
            disabled={aiLoading}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12,
              background: `linear-gradient(135deg, ${T.gold2}, ${T.gold})`,
              border: 'none', color: T.base, cursor: 'pointer',
              fontSize: 14, fontWeight: 800, fontFamily: T.font,
              letterSpacing: 0.2,
              boxShadow: '0 6px 18px rgba(212,168,67,0.32)',
              opacity: aiLoading ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
            <svg width="22" height="12" viewBox="0 0 22 12" fill="none">
              <circle cx="3" cy="6" r="2.5" fill={T.base}/>
              <path d="M5.5 6h3" stroke={T.base} strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="11" cy="6" r="2.5" fill={T.base}/>
              <path d="M13.5 6h3" stroke={T.base} strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="19" cy="6" r="2.5" fill={T.base}/>
            </svg>
            <span>GAME PLAN</span>
            <span style={{
              fontSize: 10, fontWeight: 700, opacity: 0.6,
              letterSpacing: 0.3,
            }}>{aiLoading ? 'thinking…' : '· Rex picks the move'}</span>
          </button>
        </div>

        {/* AI reply box */}
        {aiOpen && (
          <div style={{
            margin: '12px 14px 0',
            background: T.surface2,
            border: `1px solid ${T.goldBorder}`,
            borderRadius: 12, overflow: 'hidden',
            animation: 'detailIn 220ms cubic-bezier(0.2,0.7,0.2,1)',
          }}>
            <div style={{
              padding: '10px 14px',
              borderBottom: `1px solid ${T.ink4}`,
              display: 'flex', alignItems: 'center', gap: 8,
              background: T.goldBg,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 11,
                background: `radial-gradient(circle at 35% 30%, ${T.gold2} 0%, ${T.gold} 70%)`,
                boxShadow: '0 0 6px rgba(212,168,67,0.4)',
              }} />
              <span style={{
                fontSize: 10, fontWeight: 700, color: T.gold,
                fontFamily: T.font, letterSpacing: 1.2, textTransform: 'uppercase',
              }}>REX SAYS · {aiLoading ? 'THINKING' : (aiChannel || 'TEXT').toUpperCase()}</span>
              <div style={{ flex: 1 }} />
              {!aiLoading && (
                <span
                  onClick={generateGamePlan}
                  style={{
                    fontSize: 11, fontWeight: 700, color: T.gold,
                    fontFamily: T.font, cursor: 'pointer',
                    letterSpacing: 0.3, textTransform: 'uppercase',
                  }}>↻ Regenerate</span>
              )}
            </div>

            {!aiLoading && aiReasoning && (
              <div style={{
                padding: '10px 14px',
                borderBottom: `1px solid ${T.ink4}`,
                fontSize: 12, fontWeight: 500, color: T.gold,
                fontFamily: T.font, letterSpacing: -0.1, lineHeight: 1.45,
                fontStyle: 'italic',
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <span style={{ flexShrink: 0 }}>“</span>
                <span style={{ flex: 1 }}>{aiReasoning}</span>
              </div>
            )}

            <div style={{ padding: '12px 14px', minHeight: 100 }}>
              {aiLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: 4, background: T.gold,
                      animation: `rexDot 600ms ease-in-out ${i * 200}ms infinite`,
                    }} />
                  ))}
                  <span style={{
                    fontSize: 11, color: T.gold, fontFamily: T.font,
                    marginLeft: 6, letterSpacing: 0.3,
                  }}>Reading your notes…</span>
                </div>
              ) : (
                <textarea
                  value={aiText}
                  onChange={e => setAiText(e.target.value)}
                  style={{
                    width: '100%', minHeight: 110,
                    background: 'transparent', border: 'none', outline: 'none',
                    color: T.white, fontSize: 13, fontWeight: 500,
                    fontFamily: T.font, letterSpacing: -0.1, lineHeight: 1.55,
                    resize: 'vertical', padding: 0,
                  }}
                />
              )}
            </div>

            {!aiLoading && aiText && (
              <div style={{
                display: 'flex', gap: 6, padding: '10px 12px',
                borderTop: `1px solid ${T.ink4}`,
                background: T.ink2,
              }}>
                <button onClick={handleCopy} style={actionBtn(copied)}>
                  {copied ? '✓ Copied' : '⧉ Copy'}
                </button>
                {aiChannel === 'call' && (
                  <button onClick={handleCall} style={actionBtn(false, true)}>
                    📞 Call
                  </button>
                )}
                {aiChannel === 'text' && (
                  <button onClick={handleSendText} style={actionBtn(false, true)}>
                    💬 Text
                  </button>
                )}
                {aiChannel === 'email' && (
                  <button onClick={handleSendEmail} style={actionBtn(false, true)}>
                    ✉ Email
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* DEAL LOG */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '20px 16px 8px',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            textTransform: 'uppercase', color: T.gold,
            fontFamily: T.font,
          }}>DEAL LOG</span>
          {contactDeals.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: T.gold,
              background: T.goldBg,
              border: `1px solid ${T.goldBorder}`,
              padding: '2px 6px', borderRadius: 999,
              fontFamily: T.font, letterSpacing: 0.5,
              fontVariantNumeric: 'tabular-nums',
            }}>{contactDeals.length}</span>
          )}
          <div style={{ flex: 1 }} />
          <span
            onClick={() => onLogDeal && onLogDeal(c)}
            style={{
              fontSize: 11, fontWeight: 700, color: T.gold,
              fontFamily: T.font, cursor: 'pointer',
              letterSpacing: 0.5, textTransform: 'uppercase',
            }}>＋ Log deal</span>
        </div>

        {contactDeals.length === 0 ? (
          <div
            onClick={() => onLogDeal && onLogDeal(c)}
            style={{
              margin: '0 14px',
              padding: '20px 16px',
              border: `1.5px dashed ${T.goldBorder}`,
              borderRadius: 12, textAlign: 'center', cursor: 'pointer',
            }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: T.gold,
              fontFamily: T.font, letterSpacing: -0.1,
            }}>No deals yet — close them and log it here</div>
            <div style={{
              fontSize: 11, color: T.grey2, fontFamily: T.font,
              marginTop: 4,
            }}>Flows straight into your Metrics</div>
          </div>
        ) : (
          <>
            <div style={{
              margin: '0 14px 8px',
              padding: '12px 14px',
              background: T.goldBg,
              border: `1px solid ${T.goldBorder}`,
              borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <Label color={T.gold}>LIFETIME COMMISSION</Label>
                <div style={{
                  fontSize: 11, color: T.grey2, fontFamily: T.font,
                  marginTop: 3, fontVariantNumeric: 'tabular-nums',
                }}>{contactDeals.length} delivery{contactDeals.length === 1 ? '' : 's'}</div>
              </div>
              <div style={{
                fontSize: 22, fontWeight: 800, color: T.gold2,
                fontFamily: T.font, letterSpacing: -0.6,
                fontVariantNumeric: 'tabular-nums',
              }}>${totalCommission.toLocaleString()}</div>
            </div>
            <div style={{
              margin: '0 14px',
              background: T.surface2,
              border: `1px solid ${T.ink4}`,
              borderRadius: 12, overflow: 'hidden',
            }}>
              {contactDeals.map((d, i) => {
                const dt = new Date(d.date + 'T12:00:00');
                return (
                  <div key={d.id} style={{
                    padding: '12px 14px',
                    borderBottom: i === contactDeals.length - 1 ? 'none' : `1px solid ${T.ink4}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{
                      width: 4, alignSelf: 'stretch',
                      background: T.gold, borderRadius: 2,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: T.mono, color: T.gold,
                          background: T.goldBg, padding: '2px 6px', borderRadius: 4,
                          fontSize: 10, letterSpacing: 0.3, fontWeight: 700,
                        }}>{d.stock}</span>
                        <span style={{
                          fontSize: 10, color: T.ghost,
                          fontVariantNumeric: 'tabular-nums', fontWeight: 600, letterSpacing: 0.3,
                        }}>{dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: T.white,
                        fontFamily: T.font, letterSpacing: -0.15, marginTop: 3,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{d.vehicle}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                        <Pill color={d.type === 'CPO' ? T.grey2 : T.gold} style={{ fontSize: 8, padding: '2px 5px' }}>{d.type}</Pill>
                        <Pill color={d.funding === 'lease' ? T.green : d.funding === 'cash' ? T.grey2 : T.gold} style={{ fontSize: 8, padding: '2px 5px' }}>{d.funding ? d.funding.toUpperCase() : 'FIN'}</Pill>
                        {d.split && (
                          <Pill color={T.orange} style={{ fontSize: 8, padding: '2px 5px' }}>
                            ½ SPLIT{d.splitWith ? ` · ${d.splitWith.split(' ')[0]}` : ''}
                          </Pill>
                        )}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 18, fontWeight: 800, color: T.green,
                      fontFamily: T.font, letterSpacing: -0.4,
                      fontVariantNumeric: 'tabular-nums',
                    }}>${d.amount.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ height: 30 }} />
      </div>

      {/* Tag picker overlay */}
      {tagPickerOpen && (
        <SingleContactTagPicker
          c={c}
          allTags={allTags}
          onClose={() => setTagPickerOpen(false)}
          onToggle={toggleTag}
          onCreateTag={(name, color) => {
            // Tag creation is handled in parent; here we apply to this contact too
            // Apply locally:
            const next = [...(c.tags || []), name];
            onUpdate({ ...c, tags: next });
          }}
        />
      )}
    </div>
  );
}

const actionBtn = (active, primary) => ({
  flex: 1, padding: '10px 8px', borderRadius: 8,
  background: active ? T.green : primary ? T.gold : T.surface2,
  border: `1px solid ${active ? T.green : primary ? T.gold : T.ink4}`,
  color: active ? T.white : primary ? T.base : T.gold,
  cursor: 'pointer',
  fontSize: 12, fontWeight: 700, fontFamily: T.font,
  letterSpacing: 0.3, textTransform: 'uppercase',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  transition: 'all 140ms',
});

// Single-contact tag picker (overlay) — pick from library, with a quick create option
function SingleContactTagPicker({ c, allTags, onClose, onToggle, onCreateTag }) {
  const [newName, setNewName] = React.useState('');
  const has = (t) => (c.tags || []).includes(t);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 90,
      animation: 'fadeIn 180ms',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(5,5,8,0.75)',
        backdropFilter: 'blur(6px)',
      }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: T.ink2, border: `1px solid ${T.goldBorder}`,
        borderRadius: '24px 24px 0 0',
        padding: '14px 0 28px',
        animation: 'sheetUp 320ms cubic-bezier(0.2,0.7,0.2,1)',
        maxHeight: '80%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <div style={{ width: 42, height: 4, borderRadius: 2, background: T.ink4 }} />
        </div>
        <div style={{ padding: '4px 18px 14px' }}>
          <Label color={T.gold}>TAGS FOR {c.name.toUpperCase()}</Label>
          <div style={{
            fontSize: 11, color: T.grey2, fontFamily: T.font,
            marginTop: 4,
          }}>Tap to toggle. Create new ones from the carousel.</div>
        </div>
        <div style={{
          padding: '0 14px', overflowY: 'auto',
          display: 'flex', flexWrap: 'wrap', gap: 6,
        }}>
          {allTags.map(t => (
            <div
              key={t.name}
              onClick={() => onToggle(t.name)}
              style={{
                padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
                background: has(t.name) ? `color-mix(in oklab, ${t.color} 18%, transparent)` : T.surface2,
                border: `1.5px solid ${has(t.name) ? t.color : T.ink4}`,
                color: has(t.name) ? t.color : T.grey3,
                fontSize: 12, fontWeight: 700, fontFamily: T.font,
                letterSpacing: 0.3,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              {has(t.name) && <span>✓</span>}
              {t.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ContactDetail });
