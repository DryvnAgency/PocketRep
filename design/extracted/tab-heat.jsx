// Heat Sheet — trading desk watchlist
function HeatRow({ c, onTap }) {
  const tier = TIERS[c.tier];
  const staleC = stalenessColor(c.days);
  return (
    <div
      onClick={onTap}
      style={{
        position: 'relative',
        background: T.surface2,
        border: `1px solid ${T.ink4}`,
        borderRadius: 10,
        margin: '6px 14px',
        padding: '12px 14px 12px 18px',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
        transition: 'transform 100ms ease-out, opacity 100ms',
      }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; e.currentTarget.style.opacity = 0.85; }}
      onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }}
    >
      <HeatStripe color={tier.color} style={{ borderRadius: '10px 0 0 10px' }} />

      {/* Name + vehicle */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: T.white,
          fontFamily: T.font, letterSpacing: -0.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{c.name}</div>
        <div style={{
          fontSize: 11, fontWeight: 500, color: T.grey2,
          fontFamily: T.font, marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{c.vehicle} · {c.trim}</div>
      </div>

      {/* Days since counter */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontSize: 18, fontWeight: 800, color: staleC,
          fontFamily: T.font, letterSpacing: -0.5, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>{c.days === 0 ? '•' : c.days}</div>
        <div style={{
          fontSize: 9, fontWeight: 600, color: T.ghost,
          fontFamily: T.font, marginTop: 4, letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}>{c.days === 0 ? 'today' : c.days === 1 ? '1 day' : 'days'}</div>
      </div>
    </div>
  );
}

function HeatSheetTab({ onSelect }) {
  const hot = CONTACTS.filter(c => c.tier === 'hot');
  const warm = CONTACTS.filter(c => c.tier === 'warm');
  const watch = CONTACTS.filter(c => c.tier === 'watch');

  return (
    <div style={{ paddingBottom: 20 }}>
      {/* Top banner — today's pulse */}
      <div style={{
        margin: '12px 14px 4px',
        padding: '14px 16px',
        background: T.goldBg,
        border: `1px solid ${T.goldBorder}`,
        borderRadius: 14,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            color: T.gold, textTransform: 'uppercase', fontFamily: T.font,
          }}>TODAY · APR 20</div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: T.white,
            fontFamily: T.font, marginTop: 4, letterSpacing: -0.2,
          }}>3 follow-ups overdue · 1 appt at 2:30</div>
        </div>
        <StatNumber value="4" size={32} color={T.gold2} />
      </div>

      <SectionHead label="HOT" count={hot.length} color={T.red} icon="🔥" />
      {hot.map(c => <HeatRow key={c.id} c={c} onTap={() => onSelect(c)} />)}

      <SectionHead label="WARM" count={warm.length} color={T.orange} icon="☀️" />
      {warm.map(c => <HeatRow key={c.id} c={c} onTap={() => onSelect(c)} />)}

      <SectionHead label="WATCH" count={watch.length} color={T.grey2} icon="👁" />
      {watch.map(c => <HeatRow key={c.id} c={c} onTap={() => onSelect(c)} />)}
    </div>
  );
}

Object.assign(window, { HeatSheetTab });
