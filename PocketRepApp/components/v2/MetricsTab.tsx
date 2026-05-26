import { useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { Label, Pill, SectionHead } from './atoms';
import { useUserDeals, type V2DealRich } from '@/lib/v2/useUserDeals';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FUNDING_LABEL: Record<string, string> = { finance: 'FIN', lease: 'LEA', cash: 'CASH' };
const FUNDING_COLOR: Record<string, string> = {
  finance: colors.gold, lease: colors.green, cash: colors.grey2,
};

function fmtUnits(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function unitsOf(ds: V2DealRich[]): number {
  return ds.reduce((s, d) => s + (d.split ? 0.5 : 1), 0);
}

function StatCard({
  label, value, prefix, suffix, color = colors.white, primary, hint,
}: {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  color?: string;
  primary?: boolean;
  hint?: string;
}) {
  return (
    <View style={[styles.statCard, primary && styles.statCardPrimary]}>
      <Text style={[styles.statLabel, primary && { color: colors.gold }]}>{label}</Text>
      <View style={styles.statValueRow}>
        {prefix ? <Text style={[styles.statPrefix, { color }]}>{prefix}</Text> : null}
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        {suffix ? <Text style={[styles.statSuffix, { color }]}>{suffix}</Text> : null}
      </View>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function DealRow({ d }: { d: V2DealRich }) {
  const dt = d.closedAt ? new Date(d.closedAt + 'T12:00:00') : new Date();
  return (
    <View style={styles.dealRow}>
      <View style={styles.dealDate}>
        <Text style={styles.dealMo}>{MONTHS_SHORT[dt.getMonth()]}</Text>
        <Text style={styles.dealDay}>{dt.getDate()}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.dealName} numberOfLines={1}>{d.name}</Text>
        <View style={styles.dealMeta}>
          {d.stock ? (
            <View style={styles.dealStock}>
              <Text style={styles.dealStockText}>{d.stock}</Text>
            </View>
          ) : null}
          <Text style={styles.dealVehicle} numberOfLines={1}>{d.vehicle ?? '—'}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.dealAmount}>${d.amount.toLocaleString()}</Text>
        <View style={styles.dealPills}>
          {d.dealType ? <Pill color={d.dealType === 'CPO' ? colors.grey2 : colors.gold}>{d.dealType}</Pill> : null}
          {d.funding ? <Pill color={FUNDING_COLOR[d.funding] ?? colors.grey2}>{FUNDING_LABEL[d.funding] ?? d.funding.toUpperCase()}</Pill> : null}
        </View>
      </View>
    </View>
  );
}

function MonthAccordion({
  label, deals, expanded, onToggle, primary,
}: {
  label: string;
  deals: V2DealRich[];
  expanded: boolean;
  onToggle: () => void;
  primary?: boolean;
}) {
  const total = deals.reduce((s, d) => s + d.amount, 0);
  const grossSum = deals.reduce((s, d) => s + (d.frontGross ?? 0) + (d.backGross ?? 0), 0);
  const units = unitsOf(deals);
  return (
    <View style={[styles.month, primary ? styles.monthPrimary : styles.monthSecondary]}>
      <Pressable onPress={onToggle} style={styles.monthHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.monthLabel, { color: primary ? colors.gold : colors.grey2 }]}>{label}</Text>
          <Text style={[styles.monthSub, { color: primary ? colors.white : colors.grey3 }]}>
            {fmtUnits(units)} unit{units === 1 ? '' : 's'} · ${grossSum.toLocaleString()} gross
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.monthAmount, { color: primary ? colors.gold2 : colors.white }]}>
            ${total.toLocaleString()}
          </Text>
          <Text style={styles.monthSubLabel}>COMMISSION</Text>
        </View>
        <Text style={[styles.monthChev, { transform: [{ rotate: expanded ? '90deg' : '0deg' }] }]}>›</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.monthDeals}>
          {deals.map(d => <DealRow key={d.id} d={d} />)}
        </View>
      ) : null}
    </View>
  );
}

export default function MetricsTab({
  refetchKey = 0,
  onLogDeal,
}: {
  refetchKey?: number;
  onLogDeal?: () => void;
} = {}) {
  const deals = useUserDeals(refetchKey);
  const now = new Date();
  const curMo = now.getMonth();
  const curYr = now.getFullYear();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    [`${curYr}-${curMo}`]: true,
  });

  const stats = useMemo(() => {
    const list = deals ?? [];
    const ytd = list.filter(d => d.year === curYr);
    const ytdCommission = ytd.reduce((s, d) => s + d.amount, 0);
    const ytdUnits = unitsOf(ytd);
    const ytdGross = ytd.reduce((s, d) => s + (d.frontGross ?? 0) + (d.backGross ?? 0), 0);
    const avgPerUnit = ytdUnits ? Math.round(ytdCommission / ytdUnits) : 0;

    const cur = ytd.filter(d => d.month === curMo);
    const curCommission = cur.reduce((s, d) => s + d.amount, 0);
    const curUnits = unitsOf(cur);

    const monthDay = now.getDate();
    const daysInMonth = new Date(curYr, curMo + 1, 0).getDate();
    const projected = monthDay ? Math.round((curCommission / monthDay) * daysInMonth) : 0;

    const byMonth: Record<string, { mo: number; deals: V2DealRich[] }> = {};
    ytd.forEach(d => {
      const k = `${curYr}-${d.month}`;
      (byMonth[k] ??= { mo: d.month, deals: [] }).deals.push(d);
    });
    const months = Object.values(byMonth).sort((a, b) => b.mo - a.mo);

    const moTotals = Array.from({ length: 12 }, (_, i) => ({
      mo: i,
      commission: ytd.filter(d => d.month === i).reduce((s, d) => s + d.amount, 0),
    }));
    const maxC = Math.max(1, ...moTotals.map(m => m.commission));

    return { ytdCommission, ytdUnits, ytdGross, avgPerUnit, curCommission, curUnits, projected, months, moTotals, maxC };
  }, [deals, curMo, curYr]);

  if (deals === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const toggle = (k: string) => setExpanded(prev => ({ ...prev, [k]: !prev[k] }));

  return (
    <View style={styles.root}>
      <View style={styles.ytdCard}>
        <View style={styles.ytdHead}>
          <Label color={colors.gold}>YEAR TO DATE · {curYr}</Label>
          <View style={{ flex: 1 }} />
          <Text style={styles.ytdMonths}>
            {stats.months.length}/{curMo + 1} MONTHS LOGGED
          </Text>
        </View>
        <View style={styles.ytdValueRow}>
          <Text style={styles.ytdDollar}>$</Text>
          <Text style={styles.ytdAmount}>{stats.ytdCommission.toLocaleString()}</Text>
        </View>
        <Text style={styles.ytdSubLabel}>TOTAL YTD COMMISSION</Text>

        <View style={styles.ytdStats}>
          <View style={styles.ytdStat}>
            <Text style={styles.ytdStatLabel}>UNITS</Text>
            <Text style={styles.ytdStatValue}>{fmtUnits(stats.ytdUnits)}</Text>
          </View>
          <View style={styles.ytdDivider} />
          <View style={styles.ytdStat}>
            <Text style={styles.ytdStatLabel}>AVG / UNIT</Text>
            <Text style={styles.ytdStatValue}>${stats.avgPerUnit.toLocaleString()}</Text>
          </View>
          <View style={styles.ytdDivider} />
          <View style={[styles.ytdStat, { flex: 1.2 }]}>
            <Text style={styles.ytdStatLabel}>GROSS</Text>
            <Text style={styles.ytdStatValue}>
              ${(stats.ytdGross / 1000).toFixed(1)}<Text style={{ fontSize: 14, opacity: 0.6 }}>K</Text>
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.chartCard}>
        <Label color={colors.grey2}>MONTHLY COMMISSION · {curYr}</Label>
        <View style={styles.barRow}>
          {stats.moTotals.map((m, i) => {
            const h = m.commission ? (m.commission / stats.maxC) * 100 : 4;
            const isCur = i === curMo;
            const isFuture = i > curMo;
            const barColor = isFuture
              ? colors.ink4
              : isCur
              ? colors.gold
              : colors.goldBorderStrong;
            return (
              <View key={i} style={styles.barCol}>
                <View style={[
                  styles.bar,
                  { height: `${h}%`, backgroundColor: barColor, opacity: isFuture ? 0.5 : 1 },
                ]} />
              </View>
            );
          })}
        </View>
        <View style={styles.barLabels}>
          {MONTHS_SHORT.map((m, i) => (
            <Text key={m} style={[styles.barLabel, i === curMo && { color: colors.gold }]}>{m}</Text>
          ))}
        </View>
      </View>

      <View style={styles.statRow}>
        <StatCard
          label={`${MONTHS_SHORT[curMo].toUpperCase()} · MTD`}
          value={stats.curCommission.toLocaleString()}
          prefix="$"
          color={colors.gold2}
          primary
          hint={`${fmtUnits(stats.curUnits)} unit${stats.curUnits === 1 ? '' : 's'} delivered`}
        />
        <StatCard
          label="PROJECTED"
          value={stats.projected.toLocaleString()}
          prefix="$"
          hint="end of month"
        />
      </View>

      <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
        <Pressable onPress={onLogDeal} style={styles.logDeal}>
          <Text style={styles.logDealText}>＋ LOG A DEAL</Text>
        </Pressable>
      </View>

      <SectionHead label="MONTHLY BREAKDOWN" />
      {stats.months.map(({ mo, deals: ds }) => {
        const k = `${curYr}-${mo}`;
        const primary = mo === curMo;
        return (
          <MonthAccordion
            key={k}
            label={`${MONTHS_SHORT[mo]} ${curYr}${primary ? ' · CURRENT' : ''}`}
            deals={ds}
            expanded={!!expanded[k]}
            onToggle={() => toggle(k)}
            primary={primary}
          />
        );
      })}

      <View style={{ paddingHorizontal: 14, paddingVertical: 16, alignItems: 'center' }}>
        <Text style={styles.closeMonth}>Close {MONTHS_SHORT[curMo]} →</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: spacing.xl },
  center: { padding: spacing.xl, alignItems: 'center' },

  ytdCard: {
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.xl,
  },
  ytdHead: { flexDirection: 'row', alignItems: 'center' },
  ytdMonths: { fontSize: 10, fontWeight: '700', color: colors.green, letterSpacing: 0.3 },
  ytdValueRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 },
  ytdDollar: { fontSize: 30, fontWeight: '800', color: colors.gold2, opacity: 0.7, marginTop: 4 },
  ytdAmount: { fontSize: 44, fontWeight: '900', color: colors.gold2, letterSpacing: -1.5, lineHeight: 44 },
  ytdSubLabel: {
    fontSize: 11, fontWeight: '600', color: colors.grey2, marginTop: 4, letterSpacing: 0.3,
  },
  ytdStats: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 14,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
  },
  ytdStat: { flex: 1 },
  ytdStatLabel: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 0.8 },
  ytdStatValue: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.6, marginTop: 2 },
  ytdDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.goldBorder },

  chartCard: {
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 64,
    marginTop: 14,
  },
  barCol: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  bar: { minHeight: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 } as any,
  barLabels: { flexDirection: 'row', gap: 5, marginTop: 6 },
  barLabel: {
    flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '600',
    color: colors.grey, letterSpacing: 0.3,
  },

  statRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  statCardPrimary: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 1.0, marginBottom: 8 },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  statPrefix: { fontSize: 14, opacity: 0.75, fontWeight: '800' },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.8 },
  statSuffix: { fontSize: 11, opacity: 0.6, fontWeight: '800', marginLeft: 2 },
  statHint: { fontSize: 10, fontWeight: '600', color: colors.grey2, marginTop: 6 },

  logDeal: {
    height: 50,
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logDealText: { fontSize: 15, fontWeight: '800', color: colors.ink, letterSpacing: -0.1 },

  month: {
    marginHorizontal: 14,
    marginVertical: 4,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  monthPrimary: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  monthSecondary: { backgroundColor: colors.ink2, borderColor: colors.ink4 },
  monthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  monthLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  monthSub: { fontSize: 13, fontWeight: '500', marginTop: 3 },
  monthAmount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, lineHeight: 18 },
  monthSubLabel: {
    fontSize: 9, fontWeight: '700', color: colors.grey2,
    letterSpacing: 0.8, marginTop: 4,
  },
  monthChev: { color: colors.gold, fontSize: 14 },
  monthDeals: { backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: colors.ink4 },

  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  dealDate: { width: 36 },
  dealMo: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 0.6 },
  dealDay: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.6, marginTop: 2 },
  dealName: { fontSize: 14, fontWeight: '600', color: colors.white, letterSpacing: -0.2 },
  dealMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  dealStock: {
    backgroundColor: colors.goldBg,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dealStockText: { fontFamily: 'Menlo', fontSize: 10, color: colors.gold, fontWeight: '600', letterSpacing: 0.3 },
  dealVehicle: { fontSize: 11, color: colors.grey2 },
  dealAmount: { fontSize: 16, fontWeight: '800', color: colors.green, letterSpacing: -0.4 },
  dealPills: { flexDirection: 'row', gap: 4, marginTop: 3 },

  closeMonth: { fontSize: 12, color: colors.grey2 },
});
