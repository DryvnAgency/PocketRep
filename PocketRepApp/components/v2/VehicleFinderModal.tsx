// Vehicle Finder — the dedicated finder sheet (EXPO_PUBLIC_VEHICLE_FINDER).
// Rep types shorthand customer notes -> AI + regex extract requirements ->
// inventory-search reads the saved dealership site -> ranked match cards plus a
// "YOU MIGHT LIKE" row of near-miss alternatives. Also opened pre-filled by the
// Rex `find_vehicles` pivot (voice/chat), which passes requirements the model
// already extracted, so that path skips the extraction step. Additive + gated;
// AppShell only mounts this when the flag is on.
//
// Structure mirrors ImportContactsModal: custom overlay (scrim + bottom sheet),
// busy/error state, try/catch/finally. Honest empty states throughout — a site
// we can't read says so; it never invents inventory.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput, Image, Linking, Platform,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { setRepSetting } from '@/lib/v2/repSettings';
import {
  findVehicles,
  extractRequirements,
  getSavedInventoryUrl,
  normalizeInventoryUrl,
  VehicleFinderError,
  type VehicleSearchResult,
} from '@/lib/v2/vehicleFinder';
import type { FindVehiclesPayload } from '@/lib/v2/rexActions';
import type { ScoredVehicle, VehicleRequirements, AlternativePick } from '@/lib/v2/vehicleMatch';

type Phase = 'input' | 'extracting' | 'fetching' | 'results';

export default function VehicleFinderModal({
  open, prefill, onClose,
}: {
  open: boolean;
  prefill?: FindVehiclesPayload | null;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('input');
  const [notes, setNotes] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [result, setResult] = useState<VehicleSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const url = getSavedInventoryUrl();
    setSavedUrl(url);
    setUrlDraft('');
    setResult(null);
    setError(null);
    setPhase('input');
    if (prefill?.requirements) {
      setNotes(prefill.raw_notes ?? '');
      // Voice/chat path — the model already extracted requirements; go straight
      // to fetch (no second AI call). Deferred so state settles first.
      void run(prefill.requirements);
    } else {
      setNotes(prefill?.raw_notes ?? '');
    }
    return () => abortRef.current?.abort();
    // run/prefill handled explicitly; re-run only when the sheet (re)opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const busy = phase === 'extracting' || phase === 'fetching';

  const run = async (reqs?: VehicleRequirements) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    try {
      let requirements = reqs;
      if (!requirements) {
        setPhase('extracting');
        requirements = await extractRequirements(notes, { signal: ctrl.signal });
      }
      setPhase('fetching');
      const res = await findVehicles({ requirements, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setResult(res);
      setPhase('results');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(messageFor(e));
      setPhase('input');
    }
  };

  const saveUrl = () => {
    const normalized = normalizeInventoryUrl(urlDraft);
    if (!normalized) { setError('Enter a full https website, e.g. https://www.yourdealership.com'); return; }
    setRepSetting('inventoryFeed', normalized);
    setSavedUrl(normalized);
    setError(null);
  };

  const refresh = async () => {
    if (!result) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setPhase('fetching');
    try {
      const res = await findVehicles({ requirements: result.requirements, signal: ctrl.signal, force: true });
      if (ctrl.signal.aborted) return;
      setResult(res);
      setPhase('results');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(messageFor(e));
      setPhase('results');
    }
  };

  const close = () => { abortRef.current?.abort(); onClose(); };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable onPress={phase === 'results' ? () => setPhase('input') : close} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>{phase === 'results' ? 'Edit' : 'Cancel'}</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>VEHICLE FINDER</Text>
            <Text style={styles.headerTitle}>
              {phase === 'results' ? `${result?.matches.length ?? 0} match${result?.matches.length === 1 ? '' : 'es'}` : 'What are they after?'}
            </Text>
          </View>
          <View style={[styles.headerBtn, { opacity: 0 }]}><Text style={styles.headerBtnText}> </Text></View>
        </View>

        {phase === 'results' && result
          ? <Results result={result} onRefresh={refresh} error={error} />
          : busy
            ? <Busy phase={phase} />
            : savedUrl
              ? <InputForm notes={notes} setNotes={setNotes} onRun={() => run()} error={error} savedUrl={savedUrl} onEditUrl={() => setSavedUrl('')} />
              : <NoUrlForm urlDraft={urlDraft} setUrlDraft={setUrlDraft} onSave={saveUrl} error={error} />}
      </View>
    </View>
  );
}

function messageFor(e: unknown): string {
  if (e instanceof VehicleFinderError) {
    switch (e.code) {
      case 'no_url': return 'Save your dealership website first.';
      case 'bad_url': return "That website was rejected — check it in Profile → Dealership website (must be a public https site).";
      case 'unreachable': return "Couldn't reach the inventory service. It may not be turned on yet.";
      default: return 'Search failed. Try again in a moment.';
    }
  }
  return 'Something went wrong. Try again.';
}

// --- sub-views ---------------------------------------------------------------

function InputForm({
  notes, setNotes, onRun, error, savedUrl, onEditUrl,
}: {
  notes: string; setNotes: (v: string) => void; onRun: () => void;
  error: string | null; savedUrl: string; onEditUrl: () => void;
}) {
  let host = savedUrl;
  try { host = new URL(savedUrl).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Customer notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder={'e.g. 500/mo SUV, 6 seats minimum, darker colors, 3k down, 600 credit, remote start + heated seats'}
        placeholderTextColor={colors.grey}
        multiline
        style={styles.notesInput}
      />
      <Pressable onPress={onRun} disabled={!notes.trim()} style={[styles.primaryBtn, !notes.trim() && { opacity: 0.4 }]}>
        <Text style={styles.primaryBtnText}>Find matches</Text>
      </Pressable>
      <Pressable onPress={onEditUrl} style={styles.sourceRow}>
        <Text style={styles.sourceRowText}>Reading inventory from <Text style={{ color: colors.grey3 }}>{host}</Text></Text>
        <Text style={styles.sourceRowEdit}>Change</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.disclaimer}>Payments shown after a search are estimates only — not a finance quote.</Text>
    </ScrollView>
  );
}

function NoUrlForm({
  urlDraft, setUrlDraft, onSave, error,
}: {
  urlDraft: string; setUrlDraft: (v: string) => void; onSave: () => void; error: string | null;
}) {
  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.bigHint}>Save your dealership website</Text>
      <Text style={styles.hint}>
        Rex reads your site’s public inventory pages to match customers to real stock. Add it once — you can change it any time in Profile → Dealership website.
      </Text>
      <TextInput
        value={urlDraft}
        onChangeText={setUrlDraft}
        placeholder={'https://www.yourdealership.com'}
        placeholderTextColor={colors.grey}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={Platform.OS === 'web' ? 'default' : 'url'}
        style={styles.urlInput}
      />
      <Pressable onPress={onSave} disabled={!urlDraft.trim()} style={[styles.primaryBtn, !urlDraft.trim() && { opacity: 0.4 }]}>
        <Text style={styles.primaryBtnText}>Save website</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function Busy({ phase }: { phase: Phase }) {
  return (
    <View style={styles.busyWrap}>
      <Text style={styles.busyText}>
        {phase === 'extracting' ? 'Reading the notes…' : 'Searching the lot…'}
      </Text>
    </View>
  );
}

function Results({
  result, onRefresh, error,
}: {
  result: VehicleSearchResult; onRefresh: () => void; error: string | null;
}) {
  const { matches, alternatives, requirements, total_parsed, source_url, from_cache } = result;
  let host = source_url;
  try { host = new URL(source_url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }

  const chips = requirementChips(requirements);

  return (
    <ScrollView contentContainerStyle={styles.resultsBody}>
      {chips.length ? (
        <View style={styles.chipRow}>
          {chips.map((c, i) => <View key={i} style={styles.chip}><Text style={styles.chipText}>{c}</Text></View>)}
        </View>
      ) : null}

      {matches.length === 0 && total_parsed === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Couldn’t read this site’s inventory</Text>
          <Text style={styles.emptyBody}>
            The built-in reader couldn’t pull listings from {host}. Some sites load inventory in a way it can’t see yet — showing nothing rather than a guess.
          </Text>
        </View>
      ) : (
        <>
          {matches.map(m => <MatchCard key={m.vehicle.id} scored={m} />)}
          {alternatives.length ? (
            <>
              <Text style={styles.sectionHeader}>YOU MIGHT LIKE</Text>
              {alternatives.map(a => <AltCard key={a.scored.vehicle.id} alt={a} />)}
            </>
          ) : null}
        </>
      )}

      <View style={styles.footerRow}>
        <Text style={styles.footerMeta}>
          From {host}{from_cache ? ' · cached' : ''}
        </Text>
        <Pressable onPress={onRefresh}><Text style={styles.footerRefresh}>Refresh</Text></Pressable>
      </View>
      <Text style={styles.disclaimer}>Payments are estimates only — not a finance quote.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function requirementChips(r: VehicleRequirements): string[] {
  const out: string[] = [];
  if (r.vehicle_type) out.push(r.vehicle_type.toUpperCase());
  if (r.monthly_budget) out.push(`$${r.monthly_budget}/mo`);
  if (r.down_payment) out.push(`$${r.down_payment.toLocaleString()} down`);
  if (r.credit_score) out.push(`${r.credit_score} credit`);
  if (r.min_seats) out.push(`${r.min_seats}+ seats`);
  if (r.color_pref) out.push(`${r.color_pref} colors`);
  (r.features ?? []).forEach(f => out.push(f.replace(/_/g, ' ')));
  return out;
}

function vehicleTitle(v: ScoredVehicle['vehicle']): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Vehicle';
}

function subLine(v: ScoredVehicle['vehicle']): string {
  const bits: string[] = [];
  if (v.mileage != null) bits.push(v.mileage >= 1000 ? `${Math.round(v.mileage / 1000)}k mi` : `${v.mileage} mi`);
  if (v.color) bits.push(v.color);
  if (v.stock) bits.push(`Stock ${v.stock}`);
  return bits.join(' · ');
}

function Photo({ url }: { url?: string | null }) {
  const ok = !!url && /^https:\/\//.test(url);
  const [failed, setFailed] = useState(false);
  if (!ok || failed) return <View style={[styles.photo, styles.photoPlaceholder]}><Text style={styles.photoPlaceholderText}>🚗</Text></View>;
  return <Image source={{ uri: url! }} style={styles.photo} resizeMode="cover" onError={() => setFailed(true)} />;
}

function MatchCard({ scored }: { scored: ScoredVehicle }) {
  const v = scored.vehicle;
  const canLink = !!v.listing_url && /^https:\/\//.test(v.listing_url);
  return (
    <View style={styles.card}>
      <Photo url={v.photo_url} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>{vehicleTitle(v)}</Text>
          <View style={styles.matchBadge}><Text style={styles.matchBadgeText}>{scored.match_pct}%</Text></View>
        </View>
        <View style={styles.priceRow}>
          {v.price != null ? <Text style={styles.price}>${v.price.toLocaleString()}</Text> : null}
          {scored.est_monthly != null ? <View style={styles.estPill}><Text style={styles.estPillText}>EST ${scored.est_monthly}/mo</Text></View> : null}
        </View>
        {subLine(v) ? <Text style={styles.cardSub}>{subLine(v)}</Text> : null}
        {scored.reasons.slice(0, 3).map((r, i) => <Text key={i} style={styles.reason}>• {r}</Text>)}
        {canLink ? (
          <Pressable onPress={() => Linking.openURL(v.listing_url!)} style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>View listing →</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function AltCard({ alt }: { alt: AlternativePick }) {
  const v = alt.scored.vehicle;
  const canLink = !!v.listing_url && /^https:\/\//.test(v.listing_url);
  return (
    <View style={[styles.card, styles.altCard]}>
      <Photo url={v.photo_url} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>{vehicleTitle(v)}</Text>
          <View style={styles.closeChip}><Text style={styles.closeChipText}>CLOSE MATCH</Text></View>
        </View>
        <View style={styles.priceRow}>
          {v.price != null ? <Text style={styles.price}>${v.price.toLocaleString()}</Text> : null}
          {alt.scored.est_monthly != null ? <View style={styles.estPill}><Text style={styles.estPillText}>EST ${alt.scored.est_monthly}/mo</Text></View> : null}
        </View>
        {subLine(v) ? <Text style={styles.cardSub}>{subLine(v)}</Text> : null}
        <Text style={styles.tradeoff}>{alt.tradeoff}</Text>
        {canLink ? (
          <Pressable onPress={() => Linking.openURL(v.listing_url!)} style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>View listing →</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.72)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, top: '8%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1, borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden',
  } as any,
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: colors.ink4, marginTop: 10, marginBottom: 4 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
  },
  headerBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    minWidth: 70, alignItems: 'center',
  },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 12 },
  label: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 1 },
  notesInput: {
    minHeight: 110, textAlignVertical: 'top' as any,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md, padding: 12, color: colors.white, fontSize: 14, lineHeight: 20,
  } as any,
  urlInput: {
    height: 48, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md, paddingHorizontal: 12, color: colors.white, fontSize: 14,
  },
  primaryBtn: { height: 48, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  sourceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sourceRowText: { fontSize: 12, color: colors.grey2 },
  sourceRowEdit: { fontSize: 12, fontWeight: '700', color: colors.gold },
  bigHint: { fontSize: 17, fontWeight: '800', color: colors.white },
  hint: { fontSize: 13, color: colors.grey2, lineHeight: 19 },
  error: { color: colors.red, fontSize: 13, marginTop: 6 },
  disclaimer: { fontSize: 11, color: colors.grey, lineHeight: 15, marginTop: 8 },

  busyWrap: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  busyText: { fontSize: 14, color: colors.grey2, fontWeight: '600' },

  resultsBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.gold2 },

  sectionHeader: { fontSize: 11, fontWeight: '800', color: colors.grey2, letterSpacing: 1.4, marginTop: 18, marginBottom: 8 },

  card: {
    flexDirection: 'row', gap: 12,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: 10, marginBottom: 10,
  },
  altCard: { borderColor: colors.goldBorder, backgroundColor: colors.ink3 },
  photo: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.ink4 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoPlaceholderText: { fontSize: 30, opacity: 0.5 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.white, lineHeight: 18 },
  matchBadge: { backgroundColor: colors.gold, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  matchBadgeText: { fontSize: 12, fontWeight: '900', color: colors.ink },
  closeChip: { backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  closeChipText: { fontSize: 9, fontWeight: '800', color: colors.gold2, letterSpacing: 0.5 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  price: { fontSize: 15, fontWeight: '800', color: colors.white },
  estPill: { backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  estPillText: { fontSize: 10, fontWeight: '800', color: colors.gold2 },
  cardSub: { fontSize: 12, color: colors.grey2, marginTop: 3 },
  reason: { fontSize: 12, color: colors.grey3, marginTop: 3, lineHeight: 16 },
  tradeoff: { fontSize: 12, color: colors.gold2, fontStyle: 'italic', marginTop: 5, lineHeight: 16 },
  linkBtn: { marginTop: 8, alignSelf: 'flex-start' },
  linkBtnText: { fontSize: 12, fontWeight: '700', color: colors.gold },

  emptyWrap: { padding: 20, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.white, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: colors.grey2, lineHeight: 19, textAlign: 'center', marginTop: 8 },

  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  footerMeta: { fontSize: 11, color: colors.grey },
  footerRefresh: { fontSize: 12, fontWeight: '700', color: colors.gold },
});
