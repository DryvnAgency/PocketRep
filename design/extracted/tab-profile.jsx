// Profile / Settings tab
function ProfileTab({ onShowOnboarding, payPlan, onEditPayPlan }) {
  const Row = ({ icon, label, detail, danger, chevron = true }) => (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '14px 16px', gap: 12,
      borderBottom: `1px solid ${T.ink4}`,
      cursor: 'pointer',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: danger ? 'rgba(224,82,82,0.12)' : T.goldBg,
        border: `1px solid ${danger ? 'rgba(224,82,82,0.3)' : T.goldBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? T.red : T.gold, fontSize: 14, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500,
          color: danger ? T.red : T.white,
          fontFamily: T.font, letterSpacing: -0.1,
        }}>{label}</div>
      </div>
      {detail && (
        <div style={{
          fontSize: 13, color: T.grey2, fontFamily: T.font,
          fontVariantNumeric: 'tabular-nums',
        }}>{detail}</div>
      )}
      {chevron && <span style={{ color: T.ghost, fontSize: 14 }}>›</span>}
    </div>
  );

  return (
    <div style={{ paddingBottom: 30 }}>
      {/* Profile card */}
      <div style={{
        margin: '14px',
        padding: '20px 18px',
        background: 'linear-gradient(135deg, rgba(212,168,67,0.15) 0%, rgba(212,168,67,0.03) 100%)',
        border: `1px solid ${T.goldBorder}`,
        borderRadius: 16,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <Avatar name="Jake Morales" size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 18, fontWeight: 700, color: T.white,
            fontFamily: T.font, letterSpacing: -0.3,
          }}>Jake Morales</div>
          <div style={{
            fontSize: 12, color: T.grey2, fontFamily: T.font, marginTop: 3,
          }}>BMW of Pleasanton · Senior Advisor</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Pill color={T.gold}>PRO</Pill>
            <Pill color={T.green}>34 MO STREAK</Pill>
          </div>
        </div>
      </div>

      {/* Plan callout */}
      <div style={{
        margin: '0 14px 14px',
        padding: '14px 16px',
        background: T.surface2,
        border: `1px solid ${T.ink4}`,
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1 }}>
          <Label color={T.grey2}>PLAN · PRO ANNUAL</Label>
          <div style={{
            fontSize: 13, fontWeight: 500, color: T.grey3,
            fontFamily: T.font, marginTop: 6,
          }}>Renews Aug 12, 2026</div>
        </div>
        <div style={{
          padding: '8px 14px',
          background: T.goldBg, border: `1px solid ${T.gold}`,
          borderRadius: 999, color: T.gold,
          fontSize: 11, fontWeight: 700, letterSpacing: 1.0,
          fontFamily: T.font, cursor: 'pointer',
        }}>MANAGE</div>
      </div>

      {/* Pay plan — featured */}
      <SectionHead label="COMPENSATION" color={T.gold} />
      {payPlan && <PayPlanSummary plan={payPlan} onEdit={onEditPayPlan} />}

      <SectionHead label="WORKSPACE" color={T.grey2} />
      <div style={{
        margin: '0 14px',
        background: T.surface2, border: `1px solid ${T.ink4}`,
        borderRadius: 12, overflow: 'hidden',
      }}>
        <Row icon="🏢" label="Dealership" detail="Pleasanton" />
        <Row icon="🚗" label="Inventory feed" detail="Synced 4m ago" />
        <Row icon="🔔" label="Weekly digest" detail="Mon 7AM" />
        <div style={{ borderBottom: 'none' }}>
          <Row icon="📊" label="Goals & quota" detail="22 / 32" />
        </div>
      </div>

      <SectionHead label="REX" color={T.gold} />
      <div style={{
        margin: '0 14px',
        background: T.surface2, border: `1px solid ${T.ink4}`,
        borderRadius: 12, overflow: 'hidden',
      }}>
        <Row icon="🤖" label="Voice & tone" detail="Direct" />
        <Row icon="🔐" label="Data sources" detail="3 connected" />
        <Row icon="📝" label="Custom prompts" detail="7 saved" />
      </div>

      {/* Replay onboarding — featured */}
      <SectionHead label="LEARN" color={T.gold} />
      <div
        onClick={onShowOnboarding}
        style={{
          margin: '0 14px',
          padding: '16px',
          background: T.goldBg,
          border: `1px solid ${T.goldBorder}`,
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `linear-gradient(135deg, ${T.gold2}, ${T.gold})`,
          color: T.base, fontSize: 18, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>▶</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: T.white,
            fontFamily: T.font, letterSpacing: -0.2,
          }}>Sales rep playbook</div>
          <div style={{
            fontSize: 11, color: T.gold, fontFamily: T.font,
            marginTop: 3, fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0.3,
          }}>8 steps · 5 min · maximize your day</div>
        </div>
        <span style={{ color: T.gold, fontSize: 14 }}>›</span>
      </div>

      <SectionHead label="ACCOUNT" color={T.grey2} />
      <div style={{
        margin: '0 14px',
        background: T.surface2, border: `1px solid ${T.ink4}`,
        borderRadius: 12, overflow: 'hidden',
      }}>
        <Row icon="✉" label="Email" detail="jake@bmwp.com" />
        <Row icon="📱" label="Phone" detail="(925) ••• 4421" />
        <Row icon="🔒" label="Security" detail="Face ID" />
        <Row icon="↗" label="Refer a rep" detail="$50 each" />
      </div>

      <div style={{
        margin: '24px 14px 8px',
        background: T.ink2, border: `1px solid ${T.ink4}`,
        borderRadius: 12, overflow: 'hidden',
      }}>
        <Row icon="↩" label="Sign out" danger chevron={false} />
      </div>

      <div style={{
        textAlign: 'center', padding: '10px',
        fontSize: 11, color: T.ghost, fontFamily: T.mono,
        fontVariantNumeric: 'tabular-nums',
      }}>PocketRep v3.2.4 · build 1042</div>
    </div>
  );
}

Object.assign(window, { ProfileTab });
