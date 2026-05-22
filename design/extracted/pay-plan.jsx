// Pay Plan editor — rep configures their comp structure
function PPField({ label, sub, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1.0,
          color: T.grey2, textTransform: 'uppercase',
          fontFamily: T.font,
        }}>{label}</span>
        {sub && <span style={{
          fontSize: 10, color: T.ghost, fontFamily: T.font,
          fontWeight: 500,
        }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function PPNumberInput({ value, onChange, prefix, suffix, big }) {
  return (
    <div style={{
      position: 'relative',
      display: 'flex', alignItems: 'center',
    }}>
      {prefix && (
        <span style={{
          position: 'absolute', left: 14, color: T.grey2,
          fontSize: big ? 18 : 14, fontWeight: 600,
          pointerEvents: 'none',
        }}>{prefix}</span>
      )}
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value) || 0)}
        style={{
          flex: 1,
          background: T.surface2, border: `1px solid ${T.ink4}`,
          borderRadius: 10,
          padding: prefix ? `12px 14px 12px 26px` : '12px 14px',
          paddingRight: suffix ? 36 : 14,
          color: T.white,
          fontSize: big ? 18 : 14, fontWeight: 700,
          fontFamily: T.font, outline: 'none',
          letterSpacing: -0.1, boxSizing: 'border-box',
          fontVariantNumeric: 'tabular-nums',
          width: '100%',
        }}
      />
      {suffix && (
        <span style={{
          position: 'absolute', right: 14, color: T.grey2,
          fontSize: 13, fontWeight: 600,
          pointerEvents: 'none',
        }}>{suffix}</span>
      )}
    </div>
  );
}

function PayPlanEditor({ open, onClose, plan, setPlan }) {
  const [draft, setDraft] = React.useState(plan);
  React.useEffect(() => { if (open) setDraft(plan); }, [open, plan]);
  if (!open) return null;

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setBonus = (i, k, v) => setDraft(d => ({
    ...d, unitBonuses: d.unitBonuses.map((b, j) => j === i ? { ...b, [k]: v } : b),
  }));
  const addBonus = () => setDraft(d => ({
    ...d, unitBonuses: [...d.unitBonuses, { units: 0, bonus: 0 }],
  }));
  const removeBonus = (i) => setDraft(d => ({
    ...d, unitBonuses: d.unitBonuses.filter((_, j) => j !== i),
  }));

  const handleSave = () => {
    setPlan(draft);
    onClose();
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 94,
      animation: 'fadeIn 200ms ease-out',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(5,5,8,0.78)',
        backdropFilter: 'blur(6px)',
      }} />

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: T.ink2,
        borderTop: `1px solid ${T.goldBorder}`,
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -30px 60px rgba(0,0,0,0.5)',
        animation: 'sheetUp 320ms cubic-bezier(0.2,0.7,0.2,1)',
        maxHeight: '92%', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 42, height: 4, borderRadius: 2, background: T.ink4 }} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px 18px',
        }}>
          <div onClick={onClose} style={{
            padding: '7px 14px', borderRadius: 16,
            background: T.surface2, border: `1px solid ${T.ink4}`,
            color: T.grey2, fontSize: 12, fontWeight: 600,
            fontFamily: T.font, cursor: 'pointer',
          }}>Cancel</div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
              color: T.gold, textTransform: 'uppercase', fontFamily: T.font,
            }}>YOUR PAY PLAN</div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: T.white,
              fontFamily: T.font, marginTop: 2, letterSpacing: -0.2,
            }}>Configure</div>
          </div>
          <div onClick={handleSave} style={{
            padding: '7px 14px', borderRadius: 16,
            background: T.gold, color: T.base,
            fontSize: 12, fontWeight: 700, fontFamily: T.font,
            cursor: 'pointer',
          }}>Save</div>
        </div>

        <div style={{ padding: '4px 16px 14px' }}>
          {/* Commission percentages */}
          <SectionHead label="COMMISSION %" />
          <div style={{ display: 'flex', gap: 12, padding: '0 2px' }}>
            <div style={{ flex: 1 }}>
              <PPField label="Front gross">
                <PPNumberInput value={draft.frontPct} onChange={v => set('frontPct', v)} suffix="%" big />
              </PPField>
            </div>
            <div style={{ flex: 1 }}>
              <PPField label="Back gross">
                <PPNumberInput value={draft.backPct} onChange={v => set('backPct', v)} suffix="%" big />
              </PPField>
            </div>
          </div>

          {/* Mini & base */}
          <div style={{ display: 'flex', gap: 12, padding: '0 2px' }}>
            <div style={{ flex: 1 }}>
              <PPField label="Flat mini" sub="per unit">
                <PPNumberInput value={draft.flatMini} onChange={v => set('flatMini', v)} prefix="$" />
              </PPField>
            </div>
            <div style={{ flex: 1 }}>
              <PPField label="Monthly base">
                <PPNumberInput value={draft.baseSalary} onChange={v => set('baseSalary', v)} prefix="$" />
              </PPField>
            </div>
          </div>

          {/* Multipliers */}
          <SectionHead label="SPIFFS & BONUSES" />
          <div style={{ padding: '0 2px' }}>
            <PPField label="Spiffs" sub="per unit, all deals">
              <PPNumberInput value={draft.manuBonus} onChange={v => set('manuBonus', v)} prefix="$" />
            </PPField>
            <PPField label="Unit bonus" sub="per unit, on top of commission">
              <PPNumberInput value={draft.csiBonus} onChange={v => set('csiBonus', v)} prefix="$" />
            </PPField>
          </div>

          {/* Unit bonuses */}
          <SectionHead label="UNIT BONUSES" count={draft.unitBonuses.length} />
          <div style={{
            margin: '0 2px',
            background: T.surface2, border: `1px solid ${T.ink4}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            {draft.unitBonuses.map((b, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 14px',
                borderBottom: i === draft.unitBonuses.length - 1 ? 'none' : `1px solid ${T.ink4}`,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: T.gold,
                  fontFamily: T.font, letterSpacing: 0.5,
                  textTransform: 'uppercase', flexShrink: 0,
                }}>AT</div>
                <input
                  type="number"
                  value={b.units}
                  onChange={e => setBonus(i, 'units', Number(e.target.value) || 0)}
                  style={{
                    width: 56,
                    background: T.ink3, border: `1px solid ${T.ink4}`,
                    borderRadius: 8, padding: '8px 10px',
                    color: T.white, fontSize: 14, fontWeight: 700,
                    fontFamily: T.font, outline: 'none', textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
                <span style={{
                  fontSize: 12, color: T.grey2, fontFamily: T.font,
                  flexShrink: 0,
                }}>units, pay</span>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{
                    position: 'absolute', left: 10, top: '50%',
                    transform: 'translateY(-50%)', color: T.grey2,
                    fontSize: 13, fontWeight: 600, pointerEvents: 'none',
                  }}>$</span>
                  <input
                    type="number"
                    value={b.bonus}
                    onChange={e => setBonus(i, 'bonus', Number(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      background: T.ink3, border: `1px solid ${T.ink4}`,
                      borderRadius: 8, padding: '8px 10px 8px 22px',
                      color: T.white, fontSize: 14, fontWeight: 700,
                      fontFamily: T.font, outline: 'none',
                      fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div onClick={() => removeBonus(i)} style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: T.ink3, color: T.grey2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: 14, flexShrink: 0,
                }}>−</div>
              </div>
            ))}
          </div>

          <div onClick={addBonus} style={{
            margin: '10px 2px 16px',
            padding: '10px',
            border: `1.5px dashed ${T.goldBorder}`,
            borderRadius: 10, textAlign: 'center',
            color: T.gold, fontSize: 11, fontWeight: 700,
            letterSpacing: 0.5, textTransform: 'uppercase',
            fontFamily: T.font, cursor: 'pointer',
          }}>＋ ADD TIER</div>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// Compact summary card shown in Profile
function PayPlanSummary({ plan, onEdit }) {
  return (
    <div
      onClick={onEdit}
      style={{
        margin: '0 14px',
        padding: '16px',
        background: T.surface2,
        border: `1px solid ${T.goldBorder}`,
        borderRadius: 14,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Label color={T.gold}>YOUR PAY PLAN</Label>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 11, fontWeight: 700, color: T.gold,
          fontFamily: T.font, letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>Edit ›</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, padding: '10px 12px', background: T.ink3, borderRadius: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.grey2, letterSpacing: 0.8, textTransform: 'uppercase' }}>FRONT</div>
          <div style={{
            fontSize: 18, fontWeight: 800, color: T.gold2,
            fontFamily: T.font, letterSpacing: -0.4, marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
          }}>{plan.frontPct}<span style={{ fontSize: 12, opacity: 0.6 }}>%</span></div>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', background: T.ink3, borderRadius: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.grey2, letterSpacing: 0.8, textTransform: 'uppercase' }}>BACK</div>
          <div style={{
            fontSize: 18, fontWeight: 800, color: T.gold2,
            fontFamily: T.font, letterSpacing: -0.4, marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
          }}>{plan.backPct}<span style={{ fontSize: 12, opacity: 0.6 }}>%</span></div>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', background: T.ink3, borderRadius: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.grey2, letterSpacing: 0.8, textTransform: 'uppercase' }}>MINI</div>
          <div style={{
            fontSize: 18, fontWeight: 800, color: T.gold2,
            fontFamily: T.font, letterSpacing: -0.4, marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
          }}>${plan.flatMini}</div>
        </div>
      </div>

      <div style={{
        paddingTop: 12, borderTop: `1px solid ${T.ink4}`,
        display: 'flex', flexWrap: 'wrap', gap: 6,
      }}>
        <Pill color={T.gold}>+${plan.manuBonus}/UNIT SPIFFS</Pill>
        <Pill color={T.gold}>+${plan.csiBonus}/UNIT BONUS</Pill>
        <Pill color={T.gold}>{plan.unitBonuses.length} TIERS</Pill>
      </div>
    </div>
  );
}

Object.assign(window, { PayPlanEditor, PayPlanSummary });
