// DealLogger — sheet modal for capturing a closed deal
// Used from Metrics (+LOG A DEAL) and Contact detail (+Log deal).
function calcCommission(d, plan) {
  if (!d.frontGross || !d.backGross) return 0;
  const front = (d.frontGross * plan.frontPct) / 100;
  const back = (d.backGross * plan.backPct) / 100;
  const base = Math.max(front + back, plan.flatMini);
  const splitMult = d.split ? 0.5 : 1;
  return Math.round((base + (plan.manuBonus || 0) + (plan.csiBonus || 0)) * splitMult);
}

function DealField({ label, children, full }) {
  return (
    <div style={{ flex: full ? '1 1 100%' : '1 1 calc(50% - 6px)' }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 1.0,
        color: T.grey2, textTransform: 'uppercase',
        fontFamily: T.font, marginBottom: 6,
      }}>{label}</div>
      {children}
    </div>
  );
}

const dlInput = {
  width: '100%',
  background: T.surface2,
  border: `1px solid ${T.ink4}`,
  borderRadius: 10, padding: '12px 12px',
  color: T.white, fontSize: 14, fontWeight: 600,
  fontFamily: T.font, outline: 'none',
  letterSpacing: -0.1, boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
};

function DealLogger({ open, onClose, onSave, prefill, payPlan }) {
  const [d, setD] = React.useState(() => ({
    name: '', stock: '', vehicle: '',
    date: new Date().toISOString().slice(0, 10),
    type: 'NEW', funding: 'finance',
    frontGross: '', backGross: '',
    split: false, splitWith: '',
    contactId: null,
  }));

  // When opened from a contact, pre-fill the relevant fields
  React.useEffect(() => {
    if (open && prefill) {
      setD(s => ({
        ...s,
        name: prefill.name || s.name,
        vehicle: prefill.vehicle || s.vehicle,
        contactId: prefill.id || null,
      }));
    } else if (open && !prefill) {
      setD({
        name: '', stock: '', vehicle: '',
        date: new Date().toISOString().slice(0, 10),
        type: 'NEW', funding: 'finance',
        frontGross: '', backGross: '',
        split: false, splitWith: '',
        contactId: null,
      });
    }
  }, [open, prefill]);

  if (!open) return null;

  const set = (k, v) => setD(s => ({ ...s, [k]: v }));
  const numVal = (v) => v === '' ? '' : Number(v);
  const fg = Number(d.frontGross) || 0;
  const bg = Number(d.backGross) || 0;
  const totalGross = fg + bg;
  const commission = calcCommission({
    frontGross: fg, backGross: bg, type: d.type, split: d.split,
  }, payPlan);

  const canSave = d.name && d.stock && d.vehicle && (fg > 0 || bg > 0);

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: Date.now(),
      date: d.date,
      name: d.name.trim(),
      contactId: d.contactId,
      stock: d.stock.trim().toUpperCase(),
      vehicle: d.vehicle.trim(),
      type: d.type,
      funding: d.funding,
      split: d.split,
      splitWith: d.split ? d.splitWith.trim() : '',
      frontGross: fg,
      backGross: bg,
      amount: commission,
    });
    onClose();
  };

  const segBtn = (val, current, onTap, label) => (
    <div
      onClick={() => onTap(val)}
      style={{
        flex: 1, padding: '10px 0', textAlign: 'center',
        cursor: 'pointer',
        background: current === val ? T.goldBg : 'transparent',
        border: `1px solid ${current === val ? T.gold : T.ink4}`,
        borderRadius: 8,
        fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
        color: current === val ? T.gold : T.grey2,
        textTransform: 'uppercase', fontFamily: T.font,
      }}>{label}</div>
  );

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 92,
      animation: 'fadeIn 200ms ease-out',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(5,5,8,0.72)',
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
        {/* grabber + header */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 42, height: 4, borderRadius: 2, background: T.ink4 }} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px 14px',
        }}>
          <div
            onClick={onClose}
            style={{
              padding: '7px 14px', borderRadius: 16,
              background: T.surface2, border: `1px solid ${T.ink4}`,
              color: T.grey2, fontSize: 12, fontWeight: 600,
              fontFamily: T.font, cursor: 'pointer',
            }}>Cancel</div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
              color: T.gold, textTransform: 'uppercase', fontFamily: T.font,
            }}>NEW DEAL</div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: T.white,
              fontFamily: T.font, marginTop: 2, letterSpacing: -0.2,
            }}>Log delivery</div>
          </div>
          <div
            onClick={handleSave}
            style={{
              padding: '7px 14px', borderRadius: 16,
              background: canSave ? T.gold : T.ink4,
              color: canSave ? T.base : T.ghost,
              fontSize: 12, fontWeight: 700, fontFamily: T.font,
              cursor: canSave ? 'pointer' : 'default',
              transition: 'all 120ms',
            }}>Save</div>
        </div>

        {/* Body */}
        <div style={{
          padding: '4px 16px 14px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Customer */}
          <DealField label="CUSTOMER" full>
            <input
              value={d.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Full name"
              style={dlInput}
            />
          </DealField>

          {/* Stock + Date */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <DealField label="STOCK #">
              <input
                value={d.stock}
                onChange={e => set('stock', e.target.value.toUpperCase())}
                placeholder="P8421"
                style={{ ...dlInput, fontFamily: T.mono, letterSpacing: 0.5 }}
              />
            </DealField>
            <DealField label="DELIVERY DATE">
              <input
                type="date"
                value={d.date}
                onChange={e => set('date', e.target.value)}
                style={{ ...dlInput, colorScheme: 'dark' }}
              />
            </DealField>
          </div>

          {/* Vehicle */}
          <DealField label="VEHICLE" full>
            <input
              value={d.vehicle}
              onChange={e => set('vehicle', e.target.value)}
              placeholder="'26 M3 Competition · Brooklyn Grey"
              style={dlInput}
            />
          </DealField>

          {/* Type */}
          <DealField label="INVENTORY" full>
            <div style={{ display: 'flex', gap: 6 }}>
              {segBtn('NEW', d.type, v => set('type', v), 'New')}
              {segBtn('CPO', d.type, v => set('type', v), 'CPO')}
              {segBtn('USED', d.type, v => set('type', v), 'Used')}
            </div>
          </DealField>

          {/* Funding */}
          <DealField label="FUNDING" full>
            <div style={{ display: 'flex', gap: 6 }}>
              {segBtn('finance', d.funding, v => set('funding', v), 'Finance')}
              {segBtn('lease', d.funding, v => set('funding', v), 'Lease')}
              {segBtn('cash', d.funding, v => set('funding', v), 'Cash')}
            </div>
          </DealField>

          {/* Split toggle */}
          <DealField label="SPLIT DEAL?" full>
            <div
              onClick={() => set('split', !d.split)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
                background: d.split ? T.goldBg : T.surface2,
                border: `1px solid ${d.split ? T.gold : T.ink4}`,
                borderRadius: 10, cursor: 'pointer',
                transition: 'all 140ms',
              }}>
              {/* Split icon — SVG */}
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: d.split ? T.gold : T.ink3,
                border: `1px solid ${d.split ? T.gold : T.ink4}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 140ms',
              }}>
                <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
                  <path d="M4 4l6 7-6 7" stroke={d.split ? T.base : T.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M18 4l-6 7 6 7" stroke={d.split ? T.base : T.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: d.split ? T.gold : T.white,
                  fontFamily: T.font, letterSpacing: -0.1,
                }}>{d.split ? 'Split with another rep' : 'Full deal'}</div>
                <div style={{
                  fontSize: 11, color: T.grey2, fontFamily: T.font,
                  marginTop: 2, letterSpacing: -0.05,
                }}>{d.split ? 'Counts as ½ unit · commission halved' : 'Counts as 1 unit'}</div>
              </div>
              {d.split && (
                <div style={{
                  fontSize: 22, fontWeight: 900, color: T.gold,
                  fontFamily: T.font, letterSpacing: -1,
                  fontVariantNumeric: 'tabular-nums',
                }}>½</div>
              )}
            </div>

            {/* Split-with name */}
            {d.split && (
              <div style={{
                marginTop: 8,
                background: T.surface2,
                border: `1px solid ${T.goldBorder}`,
                borderRadius: 10,
                padding: '0 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                animation: 'detailIn 220ms cubic-bezier(0.2,0.7,0.2,1)',
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: T.gold,
                  letterSpacing: 0.8, textTransform: 'uppercase',
                  fontFamily: T.font, flexShrink: 0,
                }}>WITH</span>
                <input
                  value={d.splitWith}
                  onChange={e => set('splitWith', e.target.value)}
                  placeholder="Co-rep name"
                  style={{
                    flex: 1,
                    background: 'transparent', border: 'none', outline: 'none',
                    color: T.white, fontSize: 14, fontWeight: 600,
                    fontFamily: T.font, padding: '12px 0', letterSpacing: -0.1,
                  }}
                />
                {d.splitWith && (
                  <span
                    onClick={() => set('splitWith', '')}
                    style={{
                      color: T.gold, cursor: 'pointer', fontSize: 14,
                      flexShrink: 0,
                    }}>✕</span>
                )}
              </div>
            )}
          </DealField>

          {/* Gross */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <DealField label="FRONT GROSS">
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 14, top: '50%',
                  transform: 'translateY(-50%)', color: T.grey2,
                  fontSize: 14, fontWeight: 600, pointerEvents: 'none',
                }}>$</span>
                <input
                  type="number"
                  value={d.frontGross}
                  onChange={e => set('frontGross', numVal(e.target.value))}
                  placeholder="0"
                  style={{ ...dlInput, paddingLeft: 26 }}
                />
              </div>
            </DealField>
            <DealField label="BACK GROSS">
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 14, top: '50%',
                  transform: 'translateY(-50%)', color: T.grey2,
                  fontSize: 14, fontWeight: 600, pointerEvents: 'none',
                }}>$</span>
                <input
                  type="number"
                  value={d.backGross}
                  onChange={e => set('backGross', numVal(e.target.value))}
                  placeholder="0"
                  style={{ ...dlInput, paddingLeft: 26 }}
                />
              </div>
            </DealField>
          </div>

          {/* Calc summary */}
          <div style={{
            padding: '14px 16px',
            background: T.goldBg,
            border: `1px solid ${T.goldBorder}`,
            borderRadius: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Label color={T.gold}>YOUR PAYOUT</Label>
              <div style={{ flex: 1 }} />
              <span style={{
                fontSize: 9, color: T.gold, fontFamily: T.font,
                opacity: 0.7, fontVariantNumeric: 'tabular-nums',
              }}>
                {payPlan.frontPct}% front · {payPlan.backPct}% back · +${(payPlan.manuBonus || 0) + (payPlan.csiBonus || 0)}/unit{d.split ? ' · ×0.5 split' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 11, color: T.grey2, fontFamily: T.font,
                  fontVariantNumeric: 'tabular-nums',
                }}>Total gross</div>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: T.white,
                  fontFamily: T.font, letterSpacing: -0.4,
                  fontVariantNumeric: 'tabular-nums', marginTop: 2,
                }}>${totalGross.toLocaleString()}</div>
              </div>
              <div style={{
                width: 1, height: 32, background: T.goldBorder,
              }} />
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{
                  fontSize: 11, color: T.gold, fontFamily: T.font,
                  letterSpacing: 0.3, textTransform: 'uppercase',
                  fontWeight: 700,
                }}>Commission</div>
                <div style={{
                  fontSize: 28, fontWeight: 900, color: T.gold2,
                  fontFamily: T.font, letterSpacing: -0.8,
                  fontVariantNumeric: 'tabular-nums', marginTop: 2,
                }}>${commission.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 28 }} />
      </div>
    </div>
  );
}

Object.assign(window, { DealLogger, calcCommission });
