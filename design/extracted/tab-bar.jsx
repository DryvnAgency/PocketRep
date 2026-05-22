// Tab bar with floating "Hey Rex" orb anchor
function TabBar({ active, setActive, onOrbTap, orbState }) {
  const tabs = [
    { id: 'heat',     label: 'Heat' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'metrics',  label: 'Metrics' },
    { id: 'profile',  label: 'You' },
  ];

  // SVG line icons that match the brief
  const renderIcon = (id, isActive) => {
    const c = isActive ? T.gold : T.grey2;
    const sw = 1.7;
    switch (id) {
      case 'heat':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 3c1 3 4 4.5 4 8a4 4 0 11-8 0c0-1.5 1-2.5 2-3.5C11 6 11.5 4.5 12 3z"
              stroke={c} strokeWidth={sw} strokeLinejoin="round"/>
          </svg>
        );
      case 'contacts':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="8" r="3.5" stroke={c} strokeWidth={sw}/>
            <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
            <circle cx="17" cy="9" r="2.5" stroke={c} strokeWidth={sw}/>
            <path d="M16 14c2.5 0.5 4.5 2 4.5 4.5" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
          </svg>
        );
      case 'metrics':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M4 18V10M10 18V5M16 18v-6M22 18H3" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
          </svg>
        );
      case 'gameplan':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3.5" y="4" width="17" height="16" rx="2" stroke={c} strokeWidth={sw}/>
            <path d="M7 9h6M7 13h10M7 17h8" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
          </svg>
        );
      case 'profile':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke={c} strokeWidth={sw}/>
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
          </svg>
        );
    }
  };

  return (
    <div style={{
      position: 'relative',
      borderTop: `1px solid ${T.ink4}`,
      background: T.ink2,
      paddingBottom: 28, // safe area
    }}>
      {/* Floating orb — Hey Rex */}
      <HeyRexOrb state={orbState} onTap={onOrbTap} />

      <div style={{ display: 'flex', height: 58, alignItems: 'stretch' }}>
        {tabs.slice(0, 2).map(t => (
          <TabButton key={t.id} t={t} active={active === t.id}
            onTap={() => setActive(t.id)} renderIcon={renderIcon} />
        ))}
        {/* Orb spacer */}
        <div style={{ flex: 1 }} />
        {tabs.slice(2).map(t => (
          <TabButton key={t.id} t={t} active={active === t.id}
            onTap={() => setActive(t.id)} renderIcon={renderIcon} />
        ))}
      </div>
    </div>
  );
}

function TabButton({ t, active, onTap, renderIcon }) {
  return (
    <div
      onClick={onTap}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 3, cursor: 'pointer', position: 'relative',
      }}
    >
      {active && (
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 26, height: 2, borderRadius: 1.5, background: T.gold,
          boxShadow: `0 0 8px ${T.gold}`,
        }} />
      )}
      {renderIcon(t.id, active)}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
        color: active ? T.gold : T.grey2,
        textTransform: 'uppercase', fontFamily: T.font,
      }}>{t.label}</div>
    </div>
  );
}

// Hey Rex floating orb — Idle / Listening / Processing / Just-saved
function HeyRexOrb({ state = 'idle', onTap }) {
  return (
    <div style={{
      position: 'absolute', top: -28, left: '50%',
      transform: 'translateX(-50%)', zIndex: 30,
    }}>
      {/* Outer rings */}
      {state === 'listening' && (
        <>
          <div style={{
            position: 'absolute', top: -8, left: -8, width: 72, height: 72,
            borderRadius: 36, border: `1.5px solid ${T.gold}`,
            opacity: 0.5, animation: 'orbWave 1.4s ease-out infinite',
          }} />
          <div style={{
            position: 'absolute', top: -8, left: -8, width: 72, height: 72,
            borderRadius: 36, border: `1.5px solid ${T.gold}`,
            opacity: 0.5, animation: 'orbWave 1.4s ease-out 0.5s infinite',
          }} />
        </>
      )}
      {state === 'processing' && (
        <div style={{
          position: 'absolute', top: -6, left: -6, width: 68, height: 68,
          borderRadius: 34,
          background: `conic-gradient(from 0deg, transparent 0deg, ${T.gold} 90deg, transparent 180deg)`,
          animation: 'orbSpin 1.1s linear infinite',
          WebkitMask: 'radial-gradient(transparent 26px, #000 27px)',
          mask: 'radial-gradient(transparent 26px, #000 27px)',
        }} />
      )}
      {state === 'saved' && (
        <div style={{
          position: 'absolute', top: -10, left: -10, width: 76, height: 76,
          borderRadius: 38, background: T.gold, opacity: 0,
          animation: 'orbBloom 700ms ease-out',
        }} />
      )}

      {/* The orb */}
      <div
        onClick={onTap}
        style={{
          width: 56, height: 56, borderRadius: 28,
          background: `radial-gradient(circle at 35% 30%, ${T.gold2} 0%, ${T.gold} 55%, #9a7530 100%)`,
          boxShadow: `
            0 0 24px rgba(212,168,67,0.55),
            inset -3px -3px 8px rgba(0,0,0,0.4),
            inset 3px 3px 6px rgba(255,220,140,0.5)
          `,
          position: 'relative', cursor: 'pointer',
          border: `0.5px solid ${T.gold2}`,
          transform: state === 'listening' ? 'scale(1.08)' : 'scale(1)',
          transition: 'transform 200ms cubic-bezier(0.2,0.7,0.2,1)',
        }}
      >
        {/* Inner highlight */}
        <div style={{
          position: 'absolute', top: 10, left: 12,
          width: 14, height: 10, borderRadius: '50%',
          background: 'rgba(255,255,255,0.55)',
          filter: 'blur(2px)',
        }} />
        {/* Mark */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 800, color: 'rgba(20,15,5,0.7)',
          fontFamily: T.font, letterSpacing: -0.5,
        }}>R</div>
      </div>

      {/* Saved toast */}
      {state === 'saved' && (
        <div style={{
          position: 'absolute', top: -82, left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 14px',
          background: T.ink3, border: `1px solid ${T.gold}`,
          borderRadius: 999, whiteSpace: 'nowrap',
          fontSize: 12, fontWeight: 600, color: T.gold,
          fontFamily: T.font, letterSpacing: -0.1,
          animation: 'toastIn 240ms cubic-bezier(0.2,0.7,0.2,1)',
        }}>✓ Saved to Marcus Holloway</div>
      )}

      <style>{`
        @keyframes orbWave {
          0% { transform: scale(0.85); opacity: 0.6 }
          100% { transform: scale(1.6); opacity: 0 }
        }
        @keyframes orbSpin {
          to { transform: rotate(360deg) }
        }
        @keyframes orbBloom {
          0% { opacity: 0.6; transform: scale(1) }
          100% { opacity: 0; transform: scale(1.7) }
        }
        @keyframes toastIn {
          from { transform: translate(-50%, 6px); opacity: 0 }
          to { transform: translate(-50%, 0); opacity: 1 }
        }
      `}</style>
    </div>
  );
}

Object.assign(window, { TabBar, HeyRexOrb });
