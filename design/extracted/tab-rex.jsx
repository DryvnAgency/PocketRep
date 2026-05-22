// Rex Tab — sales coach with Hey Rex wake word + memory compression
const REX_QUICK_CHIPS = [
  'Coach me on a price objection',
  'Train me on the lease vs finance pitch',
  'Reframe this customer response',
  'Inventory match',
  'Pull comps on trade',
  "What's my best move today?",
];

const COACH_OPENERS = [
  "Morning. Sofia's on day 4 silent — I'd send a non-price touch. Want me to draft something?",
  "Quick read on your week: 4 HOT leads aging, 2 deals booked. Where do you want to focus first?",
  "Heads up — Marcus Holloway hits Saturday's test drive without a locked trade. Pre-quote the M240i now.",
];

function RexTypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '6px 2px' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: 3,
          background: T.gold,
          animation: `rexDot 600ms ease-in-out ${i * 200}ms infinite`,
        }} />
      ))}
    </div>
  );
}

function RexMessage({ m }) {
  const isUser = m.from === 'user';
  if (m.system) {
    return (
      <div style={{ padding: '6px 16px', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: T.gold,
          letterSpacing: 1.0, textTransform: 'uppercase',
          fontFamily: T.font, padding: '6px 12px',
          background: T.goldBg, border: `1px solid ${T.goldBorder}`,
          borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke={T.gold} strokeWidth="1" />
            <path d="M3 6l2 2 4-4" stroke={T.gold} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      padding: '8px 16px',
    }}>
      <div style={{ maxWidth: '82%' }}>
        {!isUser && (
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            color: T.gold, textTransform: 'uppercase',
            fontFamily: T.font, marginBottom: 5, paddingLeft: 3,
          }}>
            <span style={{ animation: 'rexPulse 2.2s ease-in-out infinite' }}>R</span>EX · COACH
          </div>
        )}
        <div style={{
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
          background: isUser ? T.goldBg : T.surface2,
          border: `1px solid ${isUser ? T.goldBorder : T.ink4}`,
          fontSize: 14, fontWeight: 500,
          color: isUser ? T.white : T.grey3,
          fontFamily: T.font,
          lineHeight: 1.5, letterSpacing: -0.15,
          whiteSpace: 'pre-wrap',
        }}>{m.text}</div>
        <div style={{
          fontSize: 10, color: T.ghost, fontFamily: T.font,
          marginTop: 4, textAlign: isUser ? 'right' : 'left',
          paddingLeft: 3, paddingRight: 3,
          fontVariantNumeric: 'tabular-nums',
        }}>{m.time}</div>
      </div>
    </div>
  );
}

function RexTab({ orbState, setOrbState }) {
  // Greeting picks one of 3 coach openers each session
  const greetingRef = React.useRef(COACH_OPENERS[Math.floor(Math.random() * COACH_OPENERS.length)]);
  const [messages, setMessages] = React.useState(() => ([
    { from: 'rex', text: greetingRef.current, time: '8:42' },
  ]));
  const [input, setInput] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const [wakeListening, setWakeListening] = React.useState(false);
  const [memoryCompressed, setMemoryCompressed] = React.useState(0);
  const [showDigest, setShowDigest] = React.useState(false);
  const scrollRef = React.useRef(null);
  const recognitionRef = React.useRef(null);

  // Effective message count — UI shows when compression is about to happen
  const totalTurns = messages.filter(m => !m.system).length;
  const turnsInWindow = totalTurns - (memoryCompressed * 20);
  const compressionNear = turnsInWindow >= 18 && turnsInWindow < 20;

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  // Auto-compress every 20 turns
  React.useEffect(() => {
    if (totalTurns > 0 && totalTurns % 20 === 0 && Math.floor(totalTurns / 20) > memoryCompressed) {
      setMemoryCompressed(Math.floor(totalTurns / 20));
      setMessages(m => [...m, {
        system: true,
        text: 'Memory compressed · 20 turns into long-term context',
        time: ''
      }]);
    }
  }, [totalTurns]);

  // Hey Rex wake word — Web Speech API (best-effort, may not work in iframe)
  React.useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = (event.results[i][0].transcript || '').toLowerCase();
          if (t.includes('hey rex') || t.includes('hey, rex')) {
            wakeRex();
            return;
          }
        }
      };
      rec.onerror = () => {};
      rec.onend = () => { if (wakeListening) { try { rec.start(); } catch (e) {} } };
      recognitionRef.current = rec;
    } catch (e) {}
    return () => {
      try { recognitionRef.current && recognitionRef.current.stop(); } catch (e) {}
    };
  }, []);

  const toggleWake = () => {
    const rec = recognitionRef.current;
    if (!rec) {
      // No speech support — simulate wake anyway
      wakeRex();
      return;
    }
    if (wakeListening) {
      try { rec.stop(); } catch (e) {}
      setWakeListening(false);
    } else {
      try { rec.start(); setWakeListening(true); } catch (e) { wakeRex(); }
    }
  };

  const wakeRex = () => {
    setOrbState && setOrbState('listening');
    setTimeout(() => setOrbState && setOrbState('idle'), 2400);
  };

  const send = async (text) => {
    const t = (text || input).trim();
    if (!t) return;
    const now = new Date();
    const stamp = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const userMsg = { from: 'user', text: t, time: stamp };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setTyping(true);

    // Call Rex with coach framing
    try {
      const history = messages.filter(m => !m.system).slice(-12).map(m =>
        `${m.from === 'rex' ? 'Rex' : 'Jake'}: ${m.text}`
      ).join('\n');
      const prompt = `You are Rex — the AI sales coach inside PocketRep. You wear three hats: coach, trainer, manager. You help Jake (senior BMW advisor at BMW of Pleasanton) find deals, train on rebuttals, sharpen responses, and call out blind spots. Be direct. Speak like a confident sales coach: short sentences, specific actions, no fluff. Never give long lectures. If Jake asks for a script, give him one — quoted, ready to copy. If he's stuck, ask one sharp diagnostic question.

Recent conversation:
${history}

Jake: ${t}
Rex:`;
      const out = await window.claude.complete(prompt);
      setTyping(false);
      setMessages(m => [...m, {
        from: 'rex',
        text: (out || '').trim() || "Coming back to you on that — give me a sec.",
        time: stamp,
      }]);
    } catch (e) {
      setTyping(false);
      setMessages(m => [...m, {
        from: 'rex',
        text: "On it. Pulling from current inventory and your customer notes — give me a sec to run the match.",
        time: stamp,
      }]);
    }
  };

  // Weekly digest — Sunday card
  const digestData = {
    hottest: [
      { name: 'Marcus Holloway',     reason: 'Test drive booked Sat 11am' },
      { name: 'Derek Osei',          reason: 'Pre-approved, drive today' },
      { name: 'Priya Raman',         reason: 'Lease maturity Q7 in 30d' },
    ],
    mark_lost: [
      { name: 'Sofia Alvarez-Chen',  reason: 'Cold 4d, recovery failed' },
      { name: 'Ravi Balasubramanian',reason: '21d no reply' },
    ],
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: T.base,
    }}>
      <style>{`
        @keyframes rexDot { 0%,100% { opacity: 0.25 } 50% { opacity: 1 } }
        @keyframes rexPulse { 0%,100% { color: ${T.gold} } 50% { color: ${T.gold2} } }
        @keyframes wakeRing { 0% { transform: scale(0.85); opacity: 0.7 } 100% { transform: scale(1.5); opacity: 0 } }
      `}</style>

      {/* Top bar — terminal style */}
      <div style={{
        padding: '12px 16px 10px',
        borderBottom: `1px solid ${T.ink4}`,
        background: T.ink2,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: 4, background: T.green,
          boxShadow: `0 0 8px ${T.green}`,
        }} />
        <div style={{
          fontSize: 10, fontWeight: 700, color: T.gold,
          letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: T.font,
        }}>REX · COACH MODE</div>
        <div style={{ flex: 1 }} />
        <div
          onClick={() => setShowDigest(true)}
          style={{
            padding: '4px 9px', borderRadius: 999,
            background: T.surface2, border: `1px solid ${T.goldBorder}`,
            fontSize: 9, fontWeight: 700, color: T.gold,
            letterSpacing: 0.5, fontFamily: T.font, cursor: 'pointer',
            textTransform: 'uppercase',
          }}>📊 Digest</div>
        <div
          title={`Memory · ${memoryCompressed} compressed block${memoryCompressed === 1 ? '' : 's'}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: compressionNear ? T.orange : T.grey2,
            fontFamily: T.mono,
            fontVariantNumeric: 'tabular-nums',
          }}>
          <span>◧</span>
          {memoryCompressed > 0 && <span style={{ color: T.gold }}>{memoryCompressed}+</span>}
          {turnsInWindow}/20
        </div>
      </div>

      {/* Memory compression hint */}
      {compressionNear && (
        <div style={{
          padding: '6px 16px', background: T.ink2,
          borderBottom: `1px solid ${T.ink4}`,
          fontSize: 10, color: T.orange, fontFamily: T.font,
          textAlign: 'center', letterSpacing: 0.3,
        }}>⊙ Memory compressing soon — keeping your tone, style, and customer context</div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
        {messages.map((m, i) => <RexMessage key={i} m={m} />)}
        {typing && (
          <div style={{ padding: '8px 16px' }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
              color: T.gold, textTransform: 'uppercase', fontFamily: T.font,
              marginBottom: 5, paddingLeft: 3,
            }}>
              <span style={{ animation: 'rexPulse 2.2s ease-in-out infinite' }}>R</span>EX · COACH
            </div>
            <div style={{
              padding: '10px 14px',
              borderRadius: '4px 16px 16px 16px',
              background: T.surface2,
              border: `1px solid ${T.ink4}`,
              display: 'inline-block',
            }}><RexTypingDots /></div>
          </div>
        )}
      </div>

      {/* Quick chips */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto',
        padding: '10px 14px 8px',
        borderTop: `1px solid ${T.ink4}`,
        background: T.base,
      }}>
        {REX_QUICK_CHIPS.map(chip => (
          <div
            key={chip}
            onClick={() => send(chip)}
            style={{
              padding: '7px 12px',
              background: T.surface2,
              border: `1px solid ${T.goldBorder}`,
              borderRadius: 999,
              fontSize: 12, fontWeight: 600, color: T.gold,
              fontFamily: T.font, whiteSpace: 'nowrap',
              cursor: 'pointer', flexShrink: 0,
            }}
          >{chip}</div>
        ))}
      </div>

      {/* Input bar */}
      <div style={{
        padding: '10px 14px 14px',
        background: T.ink2,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center',
          background: T.ink3,
          border: `1px solid ${input ? T.gold : T.ink4}`,
          borderRadius: 22, padding: '0 4px 0 14px',
          transition: 'border-color 120ms',
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={wakeListening ? 'Say "Hey Rex"…' : 'Ask Rex anything…'}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              outline: 'none', color: T.white, fontSize: 14,
              fontFamily: T.font, padding: '10px 0',
              letterSpacing: -0.15,
            }}
          />
        </div>
        {/* Hey Rex wake mic */}
        <div
          onClick={toggleWake}
          style={{
            position: 'relative',
            width: 40, height: 40, borderRadius: 20,
            background: wakeListening ? T.gold : T.surface2,
            border: `1px solid ${wakeListening ? T.gold : T.goldBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
          title={wakeListening ? "Listening for Hey Rex…" : "Tap to enable Hey Rex"}
        >
          {wakeListening && (
            <>
              <div style={{
                position: 'absolute', inset: -6, borderRadius: '50%',
                border: `1.5px solid ${T.gold}`,
                animation: 'wakeRing 1.4s ease-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: -6, borderRadius: '50%',
                border: `1.5px solid ${T.gold}`,
                animation: 'wakeRing 1.4s ease-out 0.5s infinite',
              }} />
            </>
          )}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="3" width="6" height="11" rx="3" fill={wakeListening ? T.base : T.gold} />
            <path d="M6 12a6 6 0 0012 0M12 18v3M9 21h6" stroke={wakeListening ? T.base : T.gold} strokeWidth="1.6" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div
          onClick={() => send()}
          style={{
            width: 40, height: 40, borderRadius: 20,
            background: input ? T.gold : T.ink4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: input ? 'pointer' : 'default', flexShrink: 0,
            transition: 'background 120ms',
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 12l18-9-7 18-2-8-9-1z" fill={input ? T.base : T.ghost} />
          </svg>
        </div>
      </div>

      {/* Weekly digest sheet */}
      {showDigest && (
        <WeeklyDigest
          data={digestData}
          onClose={() => setShowDigest(false)}
          onAction={(action, names) => {
            if (action === 'unsold-sequence') {
              setShowDigest(false);
              setMessages(m => [
                ...m,
                { system: true, text: `${names.length} contacts enrolled in Unsold Follow Up`, time: '' },
              ]);
            }
          }}
        />
      )}
    </div>
  );
}

// Sunday weekly digest sheet
function WeeklyDigest({ data, onClose, onAction }) {
  const [picked, setPicked] = React.useState(new Set(data.mark_lost.map(d => d.name)));
  const toggle = (name) => {
    const n = new Set(picked);
    n.has(name) ? n.delete(name) : n.add(name);
    setPicked(n);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 88, animation: 'fadeIn 200ms ease-out' }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(5,5,8,0.75)',
        backdropFilter: 'blur(6px)',
      }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: '5%',
        background: T.ink2, borderRadius: '24px 24px 0 0',
        borderTop: `1px solid ${T.goldBorder}`,
        animation: 'sheetUp 320ms cubic-bezier(0.2,0.7,0.2,1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 42, height: 4, borderRadius: 2, background: T.ink4 }} />
        </div>
        <div style={{ padding: '8px 18px 16px' }}>
          <Label color={T.gold}>SUNDAY · WEEKLY DIGEST</Label>
          <div style={{
            fontSize: 22, fontWeight: 800, color: T.white,
            fontFamily: T.font, letterSpacing: -0.5, marginTop: 6,
            lineHeight: 1.2,
          }}>Your week, summarized.</div>
          <div style={{
            fontSize: 12, color: T.grey2, fontFamily: T.font,
            marginTop: 4,
          }}>Rex pulled the data so you can plan Monday.</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 16px' }}>
          {/* Hottest leads */}
          <SectionHead label="🔥 HOTTEST LEADS" count={data.hottest.length} color={T.red} />
          <div style={{
            background: T.surface2, border: `1px solid ${T.ink4}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            {data.hottest.map((d, i, arr) => (
              <div key={i} style={{
                padding: '12px 14px',
                borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${T.ink4}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 4, background: T.red,
                  boxShadow: `0 0 6px ${T.red}`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: T.white,
                    fontFamily: T.font, letterSpacing: -0.2,
                  }}>{d.name}</div>
                  <div style={{
                    fontSize: 11, color: T.grey2, fontFamily: T.font, marginTop: 2,
                  }}>{d.reason}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Mark lost + enroll Unsold */}
          <SectionHead label="✕ CONSIDER MARKING LOST" count={data.mark_lost.length} color={T.grey2} />
          <div style={{
            background: T.surface2, border: `1px solid ${T.ink4}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            {data.mark_lost.map((d, i, arr) => (
              <div
                key={i}
                onClick={() => toggle(d.name)}
                style={{
                  padding: '12px 14px',
                  borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${T.ink4}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer',
                }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 11,
                  border: `2px solid ${picked.has(d.name) ? T.gold : T.ink4}`,
                  background: picked.has(d.name) ? T.gold : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {picked.has(d.name) && (
                    <svg width="11" height="9" viewBox="0 0 14 12"><path d="M1 6l4 4 8-9" stroke={T.base} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: T.white,
                    fontFamily: T.font, letterSpacing: -0.2,
                  }}>{d.name}</div>
                  <div style={{
                    fontSize: 11, color: T.grey2, fontFamily: T.font, marginTop: 2,
                  }}>{d.reason}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{
            margin: '14px 0 6px',
            padding: '14px 16px',
            background: T.goldBg,
            border: `1px solid ${T.goldBorder}`,
            borderRadius: 12,
          }}>
            <Label color={T.gold}>REX RECOMMENDS</Label>
            <div style={{
              fontSize: 13, fontWeight: 500, color: T.white,
              fontFamily: T.font, marginTop: 6, lineHeight: 1.5,
            }}>Mark these {picked.size} as lost and enroll in your "Unsold Follow Up" sequence — that's where 18% of marked-lost leads come back over 90 days.</div>
            <button
              onClick={() => onAction('unsold-sequence', Array.from(picked))}
              style={{
                marginTop: 12, padding: '10px 18px', borderRadius: 999,
                background: T.gold, color: T.base,
                border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 800, fontFamily: T.font,
                letterSpacing: 0.3, textTransform: 'uppercase',
              }}>Enroll {picked.size} in Unsold ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RexTab });
