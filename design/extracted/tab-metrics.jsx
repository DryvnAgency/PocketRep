// Metrics Tab — personal P&L with YTD rundown + month archive
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FUNDING_LABEL = { finance: 'FIN', lease: 'LEA', cash: 'CASH' };
const FUNDING_COLOR = { finance: T.gold, lease: T.green, cash: T.grey2 };

function parseDeal(d) {
  const dt = new Date(d.date + 'T12:00:00');
  return { ...d, _d: dt, _mo: dt.getMonth(), _yr: dt.getFullYear() };
}

function StatCard({ label, value, color = T.white, size = 28, prefix, suffix, primary, hint }) {
  return (
    <div style={{
      flex: 1,
      background: primary ? T.goldBg : T.surface2,
      border: `1px solid ${primary ? T.goldBorder : T.ink4}`,
      borderRadius: 12,
      padding: '14px 12px',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 1.0,
        color: primary ? T.gold : T.grey2, textTransform: 'uppercase',
        fontFamily: T.font, marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontSize: size, fontWeight: 800, color,
        letterSpacing: -0.8, lineHeight: 1,
        fontFamily: T.font, fontVariantNumeric: 'tabular-nums',
      }}>
        {prefix && <span style={{ fontSize: size * 0.65, opacity: 0.75, marginRight: 1 }}>{prefix}</span>}
        {value}
        {suffix && <span style={{ fontSize: size * 0.5, opacity: 0.6, marginLeft: 2 }}>{suffix}</span>}
      </div>
      {hint && (
        <div style={{
          fontSize: 10, fontWeight: 600, color: T.grey2,
          fontFamily: T.font, marginTop: 6,
          fontVariantNumeric: 'tabular-nums',
        }}>{hint}</div>
      )}
    </div>
  );
}

function DealRow({ d }) {
  const dt = new Date(d.date + 'T12:00:00');
  const day = dt.getDate();
  const mo = MONTHS_SHORT[dt.getMonth()];
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '12px 14px',
      borderBottom: `1px solid ${T.ink4}`,
      gap: 10,
    }}>
      <div style={{ width: 36, flexShrink: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: T.gold,
          letterSpacing: 0.6, textTransform: 'uppercase',
          fontFamily: T.font,
        }}>{mo}</div>
        <div style={{
          fontSize: 18, fontWeight: 800, color: T.white,
          letterSpacing: -0.6, fontFamily: T.font, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums', marginTop: 2,
        }}>{day}</div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          flexWrap: 'wrap', marginBottom: 2,
        }}>
          <span style={{
            fontSize: 14, fontWeight: 600, color: T.white,
            fontFamily: T.font, letterSpacing: -0.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}>{d.name}</span>
        </div>
        <div style={{
          fontSize: 11, color: T.grey2, fontFamily: T.font,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: T.mono, color: T.gold,
            background: T.goldBg, padding: '1px 5px', borderRadius: 4,
            fontSize: 10, letterSpacing: 0.3, fontWeight: 600,
          }}>{d.stock}</span>
          <span style={{
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 160,
          }}>{d.vehicle}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0 }}>
        <div style={{
          fontSize: 16, fontWeight: 800, color: T.green,
          letterSpacing: -0.4, fontFamily: T.font,
          fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>${d.amount.toLocaleString()}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Pill color={d.type === 'CPO' ? T.grey2 : T.gold} style={{ fontSize: 8, padding: '2px 5px' }}>{d.type}</Pill>
          <Pill color={FUNDING_COLOR[d.funding] || T.grey2} style={{ fontSize: 8, padding: '2px 5px' }}>{FUNDING_LABEL[d.funding] || d.funding}</Pill>
          {d.split && (
            <Pill color={T.orange} style={{ fontSize: 8, padding: '2px 5px' }}>
              ½ SPLIT{d.splitWith ? ` · ${d.splitWith.split(' ')[0]}` : ''}
            </Pill>
          )}
        </div>
      </div>
    </div>
  );
}

function MonthAccordion({ label, deals, expanded, onToggle, primary }) {
  const total = deals.reduce((s, d) => s + d.amount, 0);
  const grossSum = deals.reduce((s, d) => s + (d.frontGross || 0) + (d.backGross || 0), 0);
  const units = deals.reduce((s, d) => s + (d.split ? 0.5 : 1), 0);
  const unitsLabel = Number.isInteger(units) ? String(units) : units.toFixed(1);
  return (
    <div style={{
      margin: '8px 14px',
      background: primary ? T.goldBg : T.ink2,
      border: `1px solid ${primary ? T.goldBorder : T.ink4}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            color: primary ? T.gold : T.grey2, textTransform: 'uppercase',
            fontFamily: T.font,
          }}>{label}</div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: primary ? T.white : T.grey3,
            fontFamily: T.font, marginTop: 3,
            fontVariantNumeric: 'tabular-nums',
          }}>{unitsLabel} unit{units === 1 ? '' : 's'} · ${grossSum.toLocaleString()} gross</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 18, fontWeight: 800,
            color: primary ? T.gold2 : T.white,
            fontFamily: T.font, letterSpacing: -0.5,
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          }}>${total.toLocaleString()}</div>
          <div style={{
            fontSize: 9, fontWeight: 700, color: T.grey2,
            letterSpacing: 0.8, marginTop: 4, textTransform: 'uppercase',
          }}>COMMISSION</div>
        </div>
        <span style={{
          color: T.gold, fontSize: 14,
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 200ms',
        }}>›</span>
      </div>
      {expanded && (
        <div style={{ background: T.base, borderTop: `1px solid ${T.ink4}` }}>
          {deals.map(d => <DealRow key={d.id} d={d} />)}
        </div>
      )}
    </div>
  );
}

function MetricsTab({ deals, onLogDeal, payPlan }) {
  const enriched = deals.map(parseDeal);
  const now = new Date('2026-04-20');  // demo date
  const curMo = now.getMonth();
  const curYr = now.getFullYear();

  // Each deal is 1 unit, or 0.5 if split
  const unitsOf = (ds) => ds.reduce((s, d) => s + (d.split ? 0.5 : 1), 0);
  const fmtUnits = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);

  // Group by year-month
  const byMonth = {};
  enriched.forEach(d => {
    if (d._yr !== curYr) return;
    const key = `${d._yr}-${d._mo}`;
    if (!byMonth[key]) byMonth[key] = { mo: d._mo, yr: d._yr, deals: [] };
    byMonth[key].deals.push(d);
  });
  const months = Object.values(byMonth).sort((a, b) => b.mo - a.mo);

  // YTD totals
  const ytdCommission = enriched.filter(d => d._yr === curYr).reduce((s, d) => s + d.amount, 0);
  const ytdUnits = unitsOf(enriched.filter(d => d._yr === curYr));
  const ytdGross = enriched.filter(d => d._yr === curYr).reduce((s, d) => s + (d.frontGross || 0) + (d.backGross || 0), 0);
  const avgPerUnit = ytdUnits ? Math.round(ytdCommission / ytdUnits) : 0;

  // Current month
  const curDeals = enriched.filter(d => d._yr === curYr && d._mo === curMo);
  const curCommission = curDeals.reduce((s, d) => s + d.amount, 0);
  const curUnits = unitsOf(curDeals);

  // Goal projection
  const monthDay = now.getDate();
  const daysInMonth = new Date(curYr, curMo + 1, 0).getDate();
  const projected = Math.round((curCommission / Math.max(monthDay, 1)) * daysInMonth);

  // 12-mo bars (use what we have)
  const moTotals = Array.from({ length: 12 }, (_, i) => ({
    mo: i,
    units: enriched.filter(d => d._yr === curYr && d._mo === i).length,
    commission: enriched.filter(d => d._yr === curYr && d._mo === i).reduce((s, d) => s + d.amount, 0),
  }));
  const maxC = Math.max(1, ...moTotals.map(m => m.commission));

  // Accordion state
  const [expanded, setExpanded] = React.useState({ [`${curYr}-${curMo}`]: true });
  const toggle = (k) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  return (
    <div style={{ paddingBottom: 20 }}>
      {/* YTD HERO */}
      <div style={{
        margin: '12px 14px 0',
        padding: '18px 18px 16px',
        background: `linear-gradient(160deg, rgba(212,168,67,0.18) 0%, rgba(212,168,67,0.02) 100%)`,
        border: `1px solid ${T.goldBorder}`,
        borderRadius: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <Label color={T.gold}>YEAR TO DATE · {curYr}</Label>
          <div style={{ flex: 1 }} />
          <div style={{
            fontSize: 10, fontWeight: 700, color: T.green,
            fontFamily: T.font, fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0.3,
          }}>{months.length}/{curMo + 1} MONTHS LOGGED</div>
        </div>
        <div style={{
          fontSize: 44, fontWeight: 900, color: T.gold2,
          fontFamily: T.font, letterSpacing: -1.5,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1, marginTop: 12,
        }}>
          <span style={{ fontSize: 30, opacity: 0.7, marginRight: 1 }}>$</span>
          {ytdCommission.toLocaleString()}
        </div>
        <div style={{
          fontSize: 11, fontWeight: 600, color: T.grey2,
          fontFamily: T.font, marginTop: 4, letterSpacing: 0.3,
          textTransform: 'uppercase',
        }}>Total YTD commission</div>

        <div style={{
          marginTop: 14, paddingTop: 14,
          borderTop: `1px solid ${T.goldBorder}`,
          display: 'flex', gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.grey2, letterSpacing: 0.8, textTransform: 'uppercase' }}>UNITS</div>
            <div style={{
              fontSize: 22, fontWeight: 800, color: T.white,
              fontFamily: T.font, letterSpacing: -0.6, marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}>{fmtUnits(ytdUnits)}</div>
          </div>
          <div style={{ width: 1, background: T.goldBorder, alignSelf: 'stretch' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.grey2, letterSpacing: 0.8, textTransform: 'uppercase' }}>AVG / UNIT</div>
            <div style={{
              fontSize: 22, fontWeight: 800, color: T.white,
              fontFamily: T.font, letterSpacing: -0.6, marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}>${avgPerUnit.toLocaleString()}</div>
          </div>
          <div style={{ width: 1, background: T.goldBorder, alignSelf: 'stretch' }} />
          <div style={{ flex: 1.2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.grey2, letterSpacing: 0.8, textTransform: 'uppercase' }}>GROSS</div>
            <div style={{
              fontSize: 22, fontWeight: 800, color: T.white,
              fontFamily: T.font, letterSpacing: -0.6, marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}>${(ytdGross / 1000).toFixed(1)}<span style={{ fontSize: 14, opacity: 0.6 }}>K</span></div>
          </div>
        </div>
      </div>

      {/* 12-month bar chart */}
      <div style={{
        margin: '12px 14px 0',
        padding: '14px 16px',
        background: T.surface2,
        border: `1px solid ${T.ink4}`,
        borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <Label color={T.grey2}>MONTHLY COMMISSION · {curYr}</Label>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64 }}>
          {moTotals.map((m, i) => {
            const h = m.commission ? (m.commission / maxC) * 100 : 4;
            const isCur = i === curMo;
            const isFuture = i > curMo;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{
                  height: `${h}%`, minHeight: 3,
                  background: isFuture ? T.ink4 : isCur ? T.gold : T.goldBorderStrong,
                  borderRadius: '3px 3px 0 0',
                  opacity: isFuture ? 0.5 : 1,
                  transition: 'height 240ms',
                }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
          {MONTHS_SHORT.map((m, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center',
              fontSize: 9, fontWeight: 600,
              color: i === curMo ? T.gold : T.ghost,
              fontFamily: T.font, letterSpacing: 0.3,
            }}>{m}</div>
          ))}
        </div>
      </div>

      {/* Current month projection */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 14px 0' }}>
        <StatCard
          label={`${MONTHS_SHORT[curMo].toUpperCase()} · MTD`}
          value={curCommission.toLocaleString()} prefix="$"
          color={T.gold2} size={22} primary
          hint={`${fmtUnits(curUnits)} unit${curUnits === 1 ? '' : 's'} delivered`}
        />
        <StatCard
          label="PROJECTED"
          value={projected.toLocaleString()} prefix="$"
          color={T.white} size={22}
          hint="end of month"
        />
      </div>

      {/* Log Deal CTA */}
      <div style={{ padding: '12px 14px 8px' }}>
        <button
          onClick={onLogDeal}
          style={{
            width: '100%', height: 50, borderRadius: 12,
            background: `linear-gradient(135deg, ${T.gold2}, ${T.gold})`,
            border: 'none',
            color: T.base, fontSize: 15, fontWeight: 800,
            fontFamily: T.font, letterSpacing: -0.1,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 6px 18px rgba(212,168,67,0.32)',
          }}
        >＋ LOG A DEAL</button>
      </div>

      <SectionHead label="MONTHLY BREAKDOWN" />
      {months.map(({ mo, yr, deals: ds }) => {
        const k = `${yr}-${mo}`;
        const primary = mo === curMo && yr === curYr;
        return (
          <MonthAccordion
            key={k}
            label={`${MONTHS_SHORT[mo]} ${yr}${primary ? ' · CURRENT' : ''}`}
            deals={ds.sort((a, b) => new Date(b.date) - new Date(a.date))}
            expanded={!!expanded[k]}
            onToggle={() => toggle(k)}
            primary={primary}
          />
        );
      })}

      {/* Close month — ghost */}
      <div style={{ padding: '12px 14px 20px', textAlign: 'center' }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: T.grey2,
          fontFamily: T.font, cursor: 'pointer', padding: 8,
        }}>Close {MONTHS_SHORT[curMo]} →</div>
      </div>
    </div>
  );
}

Object.assign(window, { MetricsTab });
