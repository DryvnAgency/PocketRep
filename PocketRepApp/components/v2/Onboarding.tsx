import { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import { colors, radius } from '@/constants/theme';

type Step = {
  n: string;
  label: string;
  title: string;
  body: string;
  bullets?: Array<{ icon: string; t: string; s: string }>;
  tip?: string;
  illo: 'welcome' | 'heat' | 'orb' | 'contact' | 'gameplan' | 'rex' | 'metrics' | 'rhythm';
};

const STEPS: Step[] = [
  {
    n: '01', label: 'WELCOME',
    title: 'Sell more.\nType less.',
    body: 'PocketRep is your pocket sales floor. In 5 minutes you\'ll know exactly how to run your day from this phone — and pull ahead of every rep still using sticky notes.',
    illo: 'welcome',
  },
  {
    n: '02', label: 'YOUR MORNING',
    title: 'Open Heat Sheet first.\nEvery day.',
    body: 'Your watchlist of every active deal, sorted by temperature. Tap a contact to drill in. Counter on the right = days since last contact — when it turns red, move.',
    bullets: [
      { icon: '🔥', t: 'HOT', s: 'Buying within 7 days · touch daily' },
      { icon: '☀️', t: 'WARM', s: 'Active interest · touch every 3-4 days' },
      { icon: '🧊', t: 'COLD', s: 'Cold leads · keep on the radar' },
    ],
    illo: 'heat',
  },
  {
    n: '03', label: 'CAPTURE FAST',
    title: 'Say "Hey Rex.\nTalk like a human."',
    body: 'Walking off the showroom floor? Say "Hey Rex" and talk: "Save Marcus Holloway, M3 Comp Brooklyn Grey, budget 82K, follow up Thursday." Rex parses, files, and sets the reminder.',
    tip: 'Pro tip: the more context you give Rex, the smarter your follow-ups become.',
    illo: 'orb',
  },
  {
    n: '04', label: 'CONTACTS',
    title: 'Every detail.\nOne tap away.',
    body: 'Open any contact to see vehicle interest, budget, trade-in, full activity timeline, and your private notes. Call · Text · Email · Note all log automatically.',
    illo: 'contact',
  },
  {
    n: '05', label: 'GAME PLAN',
    title: 'Set it up once.\nIt runs forever.',
    body: 'From your You tab, open Game Plan. Build sequences (multi-step cadences) and templates. Enroll contacts and PocketRep texts, calls, and emails on your schedule.',
    bullets: [
      { icon: '◐', t: 'Start with 2 sequences', s: '"Fresh Up Follow Up" and "Sold Follow Up"' },
      { icon: '✎', t: 'Edit templates anytime', s: 'Rex shows you which ones convert' },
    ],
    illo: 'gameplan',
  },
  {
    n: '06', label: 'REX CHAT',
    title: 'Stuck? Ask Rex.',
    body: 'Say "Hey Rex" for trade values, payment scenarios, inventory matches, or have Rex draft a follow-up text in your voice. Use the Game Plan button in any contact for one-shot scripts.',
    tip: 'Try: "Hey Rex, pull comps on a \'22 M240i with 32k miles"',
    illo: 'rex',
  },
  {
    n: '07', label: 'METRICS',
    title: 'Watch the money.\nClose the month.',
    body: 'Log every deal as it happens — Metrics auto-calculates commission, units, and your week-over-week trend. End of month, hit "Close" to lock the period and start fresh.',
    illo: 'metrics',
  },
  {
    n: '08', label: 'DAILY RHYTHM',
    title: 'Two checks.\nThat\'s it.',
    body: 'Set this rhythm and you\'ll never let a deal go cold:',
    bullets: [
      { icon: '☀', t: '8:00 AM — Morning brief', s: 'Open Heat Sheet, hit every HOT contact' },
      { icon: '🌙', t: '6:00 PM — Wrap-up', s: 'Log today\'s deals, advance sequences' },
      { icon: '☎', t: 'Friday — Review', s: 'Read Rex\'s weekly digest, tune templates' },
    ],
    illo: 'rhythm',
  },
];

function Illo({ kind }: { kind: Step['illo'] }) {
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <View style={styles.illoWrap}>{children}</View>
  );
  switch (kind) {
    case 'welcome':
      return (
        <Wrap>
          <View style={styles.welcomeCenter}>
            <View style={styles.welcomeBadge}>
              <Text style={styles.welcomeBadgeText}>PR</Text>
            </View>
            <Text style={styles.welcomeLabel}>POCKETREP</Text>
          </View>
        </Wrap>
      );
    case 'heat':
      return (
        <Wrap>
          <View style={{ gap: 6 }}>
            {[
              { name: 'Marcus Holloway', t: colors.red, days: 1 },
              { name: 'Priya Raman', t: colors.red, days: 2 },
              { name: 'Jonah Breckenridge', t: colors.orange, days: 6 },
            ].map(r => (
              <View key={r.name} style={styles.heatIlloRow}>
                <View style={[styles.heatStripe, { backgroundColor: r.t }]} />
                <Text style={styles.heatIlloName}>{r.name}</Text>
                <Text style={[styles.heatIlloDays, { color: r.days > 3 ? colors.orange : colors.green }]}>
                  {r.days}d
                </Text>
              </View>
            ))}
          </View>
        </Wrap>
      );
    case 'orb':
      return (
        <Wrap>
          <View style={styles.orbCenter}>
            <View style={styles.illoOrb} />
            <View style={styles.orbBubble}>
              <Text style={styles.orbBubbleText}>"Hey Rex — save Marcus, M3 Comp, follow Thursday"</Text>
            </View>
          </View>
        </Wrap>
      );
    case 'contact':
      return (
        <Wrap>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.contactAvatar}>
                <Text style={styles.contactAvatarText}>MH</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>Marcus Holloway</Text>
                <Text style={styles.contactSub}>🔥 HOT · THIS WEEK</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {['Call', 'Text', 'Email', 'Note'].map(a => (
                <View key={a} style={styles.contactAction}>
                  <Text style={styles.contactActionText}>{a.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </View>
        </Wrap>
      );
    case 'gameplan':
      return (
        <Wrap>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.gpKicker}>FIRST TOUCH · COLD</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.gpLive}>● LIVE</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              {[1, 1, 0, 0].map((on, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', flex: i === 3 ? 0 : 1 }}>
                  <View style={[
                    styles.gpStep,
                    on ? { backgroundColor: colors.goldBg, borderColor: colors.gold } : { backgroundColor: colors.ink3, borderColor: colors.ink4 },
                  ]}>
                    <Text style={{ fontSize: 10 }}>{i === 2 ? '📞' : i === 3 ? '✉' : '💬'}</Text>
                  </View>
                  {i < 3 ? (
                    <View style={[styles.gpLine, i < 1 && { backgroundColor: colors.gold }]} />
                  ) : null}
                </View>
              ))}
            </View>
            <Text style={styles.gpFoot}>12 enrolled · next in 1d</Text>
          </View>
        </Wrap>
      );
    case 'rex':
      return (
        <Wrap>
          <View style={{ gap: 6 }}>
            <View style={[styles.bubble, styles.bubbleUser]}>
              <Text style={styles.bubbleText}>What's a fair trade on a '22 M240i?</Text>
            </View>
            <View style={[styles.bubble, styles.bubbleRex]}>
              <Text style={[styles.bubbleText, { color: colors.grey3 }]}>
                $39K trade-in. Recent auction avg: $39.6K. Lean $39K — gives you a $1K cushion.
              </Text>
            </View>
          </View>
        </Wrap>
      );
    case 'metrics':
      return (
        <Wrap>
          <View style={{ gap: 8 }}>
            <View>
              <Text style={styles.metricsLabel}>COMMISSION MTD</Text>
              <Text style={styles.metricsValue}>$19,480</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 36 }}>
              {[3.2, 4.1, 2.8, 5.3, 4.7, 6.1, 5.8].map((v, i, arr) => (
                <View
                  key={i}
                  style={[
                    styles.metricsBar,
                    {
                      height: `${(v / 6.5) * 100}%`,
                      backgroundColor: i === arr.length - 1 ? colors.gold : colors.goldBorder,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        </Wrap>
      );
    case 'rhythm':
      return (
        <Wrap>
          <View style={{ gap: 12 }}>
            {[
              { time: '8:00 AM', label: 'Heat Sheet brief' },
              { time: '12:00 PM', label: 'Mid-day Rex check' },
              { time: '6:00 PM', label: 'Log deals · advance' },
            ].map(r => (
              <View key={r.time} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={styles.rhythmTime}>{r.time}</Text>
                <View style={styles.rhythmDash} />
                <Text style={styles.rhythmLabel}>{r.label}</Text>
              </View>
            ))}
          </View>
        </Wrap>
      );
    default:
      return null;
  }
}

export default function Onboarding({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  if (!open) return null;
  const s = STEPS[i];
  const last = i === STEPS.length - 1;

  const go = (delta: number) => {
    const next = i + delta;
    if (next < 0) return;
    if (next >= STEPS.length) {
      onClose();
      setTimeout(() => setI(0), 200);
      return;
    }
    setI(next);
  };

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.progress}>
          {STEPS.map((_, k) => (
            <View
              key={k}
              style={[
                styles.progressBar,
                { backgroundColor: k <= i ? colors.gold : colors.ink4 },
              ]}
            />
          ))}
        </View>
        <Pressable onPress={() => { onClose(); setTimeout(() => setI(0), 200); }} hitSlop={6}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.bigN}>{s.n}</Text>
        <Text style={styles.label}>{s.label}</Text>
        <Text style={styles.title}>{s.title}</Text>
        <Text style={styles.body}>{s.body}</Text>

        {s.bullets ? (
          <View style={{ gap: 8, marginTop: 16 }}>
            {s.bullets.map((b, k) => (
              <View key={k} style={styles.bullet}>
                <View style={styles.bulletIcon}><Text style={styles.bulletIconText}>{b.icon}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bulletTitle}>{b.t}</Text>
                  <Text style={styles.bulletSub}>{b.s}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {s.tip ? (
          <View style={styles.tip}>
            <Text style={{ fontSize: 14 }}>💡</Text>
            <Text style={styles.tipText}>{s.tip}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 22 }}>
          <Illo kind={s.illo} />
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        <Pressable
          onPress={() => go(-1)}
          disabled={i === 0}
          style={[styles.backBtn, i === 0 && { opacity: 0.4 }]}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Pressable onPress={() => go(1)} style={styles.nextBtn}>
          <Text style={styles.nextBtnText}>
            {last ? "Let's go" : `Next · ${i + 2}/${STEPS.length}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.ink,
    zIndex: 95,
  } as any,
  top: {
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progress: { flex: 1, flexDirection: 'row', gap: 4 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  skip: { fontSize: 12, fontWeight: '600', color: colors.grey2, paddingHorizontal: 8 },

  content: { padding: 24, paddingTop: 8, paddingBottom: 24 },
  bigN: { fontSize: 60, fontWeight: '900', color: colors.gold, letterSpacing: -2, lineHeight: 60, opacity: 0.85 },
  label: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4, marginTop: 8 },
  title: { fontSize: 30, fontWeight: '800', color: colors.white, marginTop: 10, lineHeight: 34, letterSpacing: -0.8 },
  body: { fontSize: 14, color: colors.grey3, marginTop: 14, lineHeight: 22 },

  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
  },
  bulletIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  bulletIconText: { fontSize: 14 },
  bulletTitle: { fontSize: 13, fontWeight: '700', color: colors.white },
  bulletSub: { fontSize: 12, color: colors.grey2, marginTop: 2, lineHeight: 17 },

  tip: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tipText: { flex: 1, fontSize: 12, color: colors.gold, fontWeight: '600', lineHeight: 17 },

  illoWrap: {
    maxWidth: 320,
    aspectRatio: 16 / 9,
    backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.xl,
    padding: 14,
    overflow: 'hidden',
  },
  welcomeCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  welcomeBadge: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  welcomeBadgeText: { color: colors.ink, fontWeight: '900', fontSize: 24 },
  welcomeLabel: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },

  heatIlloRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: 8,
    position: 'relative',
  },
  heatStripe: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, borderTopLeftRadius: 8, borderBottomLeftRadius: 8,
  } as any,
  heatIlloName: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.white, paddingLeft: 4 },
  heatIlloDays: { fontSize: 14, fontWeight: '800' },

  orbCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  illoOrb: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.gold,
  },
  orbBubble: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: 999,
  },
  orbBubbleText: { fontSize: 11, color: colors.gold, fontWeight: '600' },

  contactAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  contactAvatarText: { color: colors.gold, fontSize: 11, fontWeight: '700' },
  contactName: { fontSize: 12, fontWeight: '700', color: colors.white },
  contactSub: { fontSize: 9, color: colors.gold, marginTop: 1 },
  contactAction: {
    flex: 1, alignItems: 'center',
    paddingVertical: 7,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: 7,
  },
  contactActionText: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 0.5 },

  gpKicker: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 1.2 },
  gpLive: { fontSize: 8, color: colors.green, fontWeight: '700' },
  gpStep: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  gpLine: { flex: 1, height: 1.5, backgroundColor: colors.ink4, marginHorizontal: 3 },
  gpFoot: { fontSize: 9, color: colors.grey2 },

  bubble: {
    paddingHorizontal: 11, paddingVertical: 8,
    maxWidth: '85%',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: 12,
    borderBottomRightRadius: 4,
  },
  bubbleRex: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: 12,
    borderTopLeftRadius: 4,
  },
  bubbleText: { fontSize: 10, color: colors.white, lineHeight: 15 },

  metricsLabel: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 1.0, marginBottom: 4 },
  metricsValue: { fontSize: 24, fontWeight: '800', color: colors.gold2, letterSpacing: -0.6 },
  metricsBar: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 } as any,

  rhythmTime: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 0.5, width: 56 },
  rhythmDash: { flex: 1, height: 1, backgroundColor: colors.ink4 },
  rhythmLabel: { fontSize: 10, fontWeight: '600', color: colors.grey3 },

  bottom: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 30,
    backgroundColor: colors.ink,
    borderTopWidth: 1, borderTopColor: colors.ink4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { color: colors.gold, fontSize: 18 },
  nextBtn: {
    flex: 1, height: 48, borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtnText: { color: colors.ink, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
});
