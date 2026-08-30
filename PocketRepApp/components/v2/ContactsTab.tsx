import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Platform, Linking } from 'react-native';
import RadarLoader from './RadarLoader';
import { colors, radius, spacing } from '@/constants/theme';
import { Avatar, rgbaTint } from './atoms';
import { TIERS, type TierKey } from './tokens';
import type { V2Contact } from '@/lib/v2/useContacts';
import type { V2Tag } from '@/lib/v2/useTags';
import { logInteraction } from '@/lib/v2/interactions';
import { logContactTouch, type CallOutcome } from '@/lib/v2/updateContact';
import { launchSms } from '@/lib/v2/smsLauncher';
import { supabase } from '@/lib/supabase';

type FilterTag = null | { kind: 'tier'; tier: TierKey; name: string; color: string; icon: string } | { kind: 'custom'; name: string; color: string };
const TIER_CHIPS: Extract<FilterTag, { kind: 'tier' }>[] = [
  { kind: 'tier', tier: 'hot', name: 'Hot', color: colors.red, icon: '🔥' },
  { kind: 'tier', tier: 'warm', name: 'Warm', color: colors.orange, icon: '☀️' },
  { kind: 'tier', tier: 'cold', name: 'Cold', color: colors.grey2, icon: '🧊' },
];
const digitsOnly = (s: string | null | undefined) => (s ?? '').replace(/[^\d]/g, '');

function CallQueue({ contacts, onClose }: { contacts: V2Contact[]; onClose: () => void }) {
  const queue = useMemo(() => contacts.filter(c => !!digitsOnly(c.phone)), [contacts]);
  const [index, setIndex] = useState(0);
  const [called, setCalled] = useState(false);
  const [outcome, setOutcome] = useState<'answered' | 'no-answer' | 'voicemail' | 'wrong-number' | null>(null);
  const [textOpened, setTextOpened] = useState(false);
  const [copied, setCopied] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const actionBusyRef = useRef(false);
  // The no-answer text signs off with the rep's own first name — never a
  // hardcoded persona. Falls back to no self-ID (not a fabricated name) when
  // the rep hasn't set one, same neutral-fallback rule as Rex's coach identity.
  const [repFirstName, setRepFirstName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        const full = String(data?.full_name ?? '').trim();
        if (full && !cancelled) setRepFirstName(full.split(/\s+/)[0]);
      } catch { /* keep the no-self-ID fallback */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const current = queue[index] ?? null;
  const textBody = current
    ? `Hey ${current.name.split(' ')[0]}, ${repFirstName ? `it’s ${repFirstName}. ` : ''}Just tried giving you a call. Wanted to catch up with you real quick. Give me a call or text when you get a chance.`
    : '';
  const record = async (type: 'call' | 'text', notes: string, callOutcome?: CallOutcome) => {
    if (!current) return;
    try { await logContactTouch(current.id, type, notes, callOutcome); } catch (e) { console.warn('call queue touch', e); }
    try { await logInteraction(current.id, type, notes, callOutcome); } catch (e) { console.warn('call queue interaction', e); }
  };
  const openCall = async () => {
    if (!current || actionBusyRef.current) return;
    actionBusyRef.current = true;
    setQueueError(null);
    if (current.isDemo) { setCalled(true); actionBusyRef.current = false; return; }
    try {
      await Linking.openURL(`tel:${digitsOnly(current.phone)}`);
      setCalled(true);
    } catch {
      setQueueError("Couldn't open the phone app. Check this customer's number.");
    } finally {
      actionBusyRef.current = false;
    }
  };
  const chooseOutcome = async (next: NonNullable<typeof outcome>) => {
    if (!current || actionBusyRef.current) return;
    actionBusyRef.current = true;
    setOutcome(next);
    try { await record('call', `Call outcome: ${next.replace('-', ' ')}`, next); }
    finally { actionBusyRef.current = false; }
  };
  const openText = async () => {
    if (!current || actionBusyRef.current) return;
    actionBusyRef.current = true;
    setQueueError(null);
    try {
      const result = await launchSms({
        contact_id: current.id,
        contact_name: current.name,
        phone: current.phone,
        message: textBody,
        isDemo: current.isDemo,
        source: 'manual',
      });
      if (result === 'opened') {
        await record('text', 'Text sent after no answer');
        setTextOpened(true);
      } else if (result === 'unsupported') {
        setQueueError('Open PocketRep on your phone to launch Messages. The text was not marked sent.');
      } else if (result !== 'not_sent') {
        setQueueError("Couldn't open Messages. Check this customer's phone number.");
      }
    } finally {
      actionBusyRef.current = false;
    }
  };
  const copyText = async () => { try { if (typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(textBody); setCopied(true); setTimeout(() => setCopied(false), 1400); } } catch {} };
  const next = () => { setIndex(i => i + 1); setCalled(false); setOutcome(null); setTextOpened(false); setCopied(false); setQueueError(null); };
  if (!current) return <View style={styles.queueOverlay}><View style={styles.queueCard}><Text style={styles.queueEyebrow}>CALL QUEUE</Text><Text style={styles.queueTitle}>You’re done. 🔥</Text><Text style={styles.queueSub}>You worked every contact with a phone number in this list.</Text><Pressable onPress={onClose} style={styles.queuePrimary} accessibilityRole="button" accessibilityLabel="Close call queue"><Text style={styles.queuePrimaryText}>DONE</Text></Pressable></View></View>;
  return <View style={styles.queueOverlay}>
    <View style={styles.queueCard}>
      <View style={styles.queueTop}><View><Text style={styles.queueEyebrow}>CALL QUEUE</Text><Text style={styles.queueCount}>{index + 1} of {queue.length}</Text></View><Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close call queue"><Text style={styles.queueClose}>✕</Text></Pressable></View>
      <View style={styles.queuePerson}><Avatar name={current.name} size={68} photoUrl={current.photoUrl}/><Text style={styles.queueName}>{current.name}</Text><Text style={styles.queuePhone}>{current.phone}</Text>{current.vehicle ? <Text style={styles.queueVehicle}>{current.vehicle}</Text> : null}</View>
      {queueError ? <Text style={styles.error} accessibilityLiveRegion="polite">{queueError}</Text> : null}
      {!called ? <Pressable onPress={openCall} style={styles.queueCall} accessibilityRole="button" accessibilityLabel={`Call ${current.name}`}><Text style={styles.queueCallIcon}>📞</Text><Text style={styles.queueCallText}>CALL {current.name.split(' ')[0].toUpperCase()}</Text></Pressable> : <>
        <Text style={styles.queueQuestion}>What happened?</Text>
        <View style={styles.outcomeGrid}>
          <Pressable onPress={() => chooseOutcome('answered')} style={styles.outcomeBtn} accessibilityRole="button" accessibilityLabel="Call answered"><Text style={styles.outcomeIcon}>✓</Text><Text style={styles.outcomeText}>ANSWERED</Text></Pressable>
          <Pressable onPress={() => chooseOutcome('no-answer')} style={styles.outcomeBtn} accessibilityRole="button" accessibilityLabel="No answer"><Text style={styles.outcomeIcon}>∅</Text><Text style={styles.outcomeText}>NO ANSWER</Text></Pressable>
          <Pressable onPress={() => chooseOutcome('voicemail')} style={styles.outcomeBtn} accessibilityRole="button" accessibilityLabel="Left voicemail"><Text style={styles.outcomeIcon}>▣</Text><Text style={styles.outcomeText}>VOICEMAIL</Text></Pressable>
          <Pressable onPress={() => chooseOutcome('wrong-number')} style={styles.outcomeBtn} accessibilityRole="button" accessibilityLabel="Wrong number"><Text style={styles.outcomeIcon}>×</Text><Text style={styles.outcomeText}>WRONG #</Text></Pressable>
        </View>
      </>}
      {outcome === 'no-answer' && !textOpened ? <View style={styles.textCard}><Text style={styles.textLabel}>NO ANSWER → TEXT</Text><Text style={styles.textBody}>{textBody}</Text><View style={styles.textActions}><Pressable onPress={copyText} style={styles.textSecondary} accessibilityRole="button" accessibilityLabel="Copy follow-up text"><Text style={styles.textSecondaryText}>{copied ? 'COPIED ✓' : 'COPY'}</Text></Pressable><Pressable onPress={openText} style={styles.textPrimary} accessibilityRole="button" accessibilityLabel="Open follow-up text"><Text style={styles.textPrimaryText}>OPEN TEXT ↗</Text></Pressable></View></View> : null}
      {outcome && (outcome !== 'no-answer' || textOpened) ? <Pressable onPress={next} style={styles.nextBtn} accessibilityRole="button" accessibilityLabel="Next customer"><Text style={styles.nextText}>NEXT CUSTOMER →</Text></Pressable> : null}
    </View>
  </View>;
}

function ContactRow({ c, onTap, allTags }: { c: V2Contact; onTap: () => void; allTags: V2Tag[] }) {
  const tierColor = TIERS[c.tier].color;
  const tagColor = (n: string) => allTags.find(t => t.name === n)?.color ?? colors.gold;
  return <Pressable onPress={onTap} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.goldBg }]} accessibilityRole="button" accessibilityLabel={`Open ${c.name}${c.vehicle ? `, ${c.vehicle}` : ''}`}><Avatar name={c.name} size={40}/><View style={styles.rowText}><View style={styles.nameRow}><Text style={styles.name} numberOfLines={1}>{c.name}</Text>{c.isDemo?<Text style={styles.demoPill}>DEMO</Text>:null}</View><Text style={styles.vehicle} numberOfLines={1}>{c.vehicle ?? '—'}</Text>{c.tags.length > 0 && <View style={styles.tagRow}>{c.tags.slice(0,3).map(t => { const col=tagColor(t); return <View key={t} style={[styles.tagPill,{backgroundColor:rgbaTint(col,.12),borderColor:rgbaTint(col,.3)}]}><Text style={[styles.tagText,{color:col}]}>{t}</Text></View>;})}</View>}</View><View style={[styles.tierDot,{backgroundColor:tierColor}]}/></Pressable>;
}
function Chip({ label, icon, color, active, onPress, dashed }: { label:string; icon?:string; color:string; active:boolean; onPress:()=>void; dashed?:boolean }) { return <Pressable onPress={onPress} style={[styles.chip,dashed?{borderStyle:'dashed',borderColor:colors.goldBorder,backgroundColor:'transparent'}:active?{backgroundColor:color,borderColor:color}:{backgroundColor:colors.surface2,borderColor:colors.ink4}]} accessibilityRole="button" accessibilityLabel={dashed?'Add a tag':`Filter contacts by ${label}`} accessibilityState={{selected:active}}>{icon?<Text style={styles.chipIcon}>{icon}</Text>:!dashed?<View style={[styles.chipDot,{backgroundColor:active?colors.white:color}]}/>:null}<Text style={[styles.chipText,{color:dashed?colors.gold:active?(color===colors.gold?colors.ink:colors.white):colors.grey3}]}>{label}</Text></Pressable>; }

export default function ContactsTab({ contacts, error, tags, onSelect, onRetry, onBulkTag, onAddContact, onImportContacts, onFindVehicles, onDeleteTag, searchFocusKey = 0 }: { contacts:V2Contact[]|null; error:string|null; tags:V2Tag[]; onSelect:(c:V2Contact)=>void; onRetry?:()=>void; onBulkTag?:()=>void; onAddContact?:()=>void; onImportContacts?:()=>void; onFindVehicles?:()=>void; onDeleteTag?:(name:string)=>void; searchFocusKey?:number }) {
  const [query,setQuery]=useState(''); const [filter,setFilter]=useState<FilterTag>(null); const [callQueueOpen,setCallQueueOpen]=useState(false);
  const searchRef=useRef<TextInput>(null);
  useEffect(()=>{if(searchFocusKey>0){const id=setTimeout(()=>searchRef.current?.focus(),0);return()=>clearTimeout(id);}},[searchFocusKey]);
  const confirmDeleteTag=(name:string)=>{const proceed=()=>{onDeleteTag?.(name);setFilter(null)};const msg=`Delete the "${name}" tag? It'll be removed from all contacts.`;if(Platform.OS==='web'){if(typeof window==='undefined'||window.confirm(msg))proceed();}else Alert.alert('Delete tag',msg,[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:proceed}]);};
  const filtered=useMemo(()=>{if(!contacts)return[];const q=query.trim().toLowerCase();return contacts.filter(c=>{const mq=!q||c.name.toLowerCase().includes(q)||(c.vehicle??'').toLowerCase().includes(q)||c.tags.some(t=>t.toLowerCase().includes(q));const mf=!filter?true:filter.kind==='tier'?c.tier===filter.tier:c.tags.includes(filter.name);return mq&&mf;});},[contacts,query,filter]);
  const queueContacts=useMemo(()=>filtered.filter(c=>!!digitsOnly(c.phone)),[filtered]);
  const groups=useMemo(()=>{const out:Record<string,V2Contact[]>={};for(const c of filtered){const k=(c.name[0]??'?').toUpperCase();(out[k]??=[]).push(c);}return out;},[filtered]);
  const letters=useMemo(()=>Object.keys(groups).sort(),[groups]);
  if(error&&!contacts)return <View style={styles.center}><Text style={styles.error}>Couldn't load contacts.</Text>{onRetry?<Pressable onPress={onRetry} style={styles.retryBtn}><Text style={styles.retryText}>Try again</Text></Pressable>:null}</View>;
  if(!contacts)return <View style={styles.center}><RadarLoader size={36}/></View>;
  return <View style={styles.root}>
    <View style={styles.searchWrap}><View style={styles.searchBox}><Text style={styles.searchIcon}>⌕</Text><TextInput ref={searchRef} value={query} onChangeText={setQuery} placeholder={`Search ${contacts.length} contacts`} placeholderTextColor={colors.grey} style={styles.searchInput} accessibilityLabel="Search contacts"/>{query?<Pressable onPress={()=>setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear contact search"><Text style={styles.searchClear}>✕</Text></Pressable>:null}</View>{onFindVehicles?<Pressable onPress={onFindVehicles} style={styles.importBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Find vehicles"><Text style={styles.importBtnText}>🚗</Text></Pressable>:null}{onImportContacts?<Pressable onPress={onImportContacts} style={styles.importBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Import contacts"><Text style={styles.importBtnText}>⇪</Text></Pressable>:null}<Pressable onPress={onAddContact} disabled={!onAddContact} style={styles.addBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Add a customer"><Text style={styles.addBtnText}>＋</Text></Pressable></View>
    <Pressable disabled={!queueContacts.length} onPress={()=>setCallQueueOpen(true)} style={[styles.queueLauncher,!queueContacts.length&&styles.queueLauncherDisabled]} accessibilityRole="button" accessibilityLabel={`Start call queue with ${queueContacts.length} customers`} accessibilityState={{disabled:!queueContacts.length}}><Text style={styles.queueLauncherIcon}>📞</Text><View style={{flex:1}}><Text style={styles.queueLauncherTitle}>START CALL QUEUE</Text><Text style={styles.queueLauncherSub}>{queueContacts.length} customer{queueContacts.length===1?'':'s'} with a phone number · call → outcome → text → next</Text></View><Text style={styles.queueLauncherArrow}>→</Text></Pressable>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}><Chip label="All" color={colors.gold} active={filter===null} onPress={()=>setFilter(null)}/>{TIER_CHIPS.map(chip=><Chip key={chip.tier} label={chip.name} icon={chip.icon} color={chip.color} active={filter?.kind==='tier'&&filter.tier===chip.tier} onPress={()=>setFilter(chip)}/>)}{tags.map(t=><Chip key={t.id} label={t.name} color={t.color} active={filter?.kind==='custom'&&filter.name===t.name} onPress={()=>setFilter({kind:'custom',name:t.name,color:t.color})}/>)}<Chip label="＋ Tag" color={colors.gold} active={false} onPress={()=>onBulkTag?.()} dashed/></ScrollView>
    {filter?<View style={styles.filterHint}><Text style={styles.filterLabel}>FILTER</Text><Text style={styles.filterValue}>{filter.kind==='tier'?`${filter.icon} ${filter.name}`:filter.name}</Text><Text style={styles.filterCount}>· {filtered.length} contact{filtered.length===1?'':'s'}</Text><View style={{flex:1}}/>{filter.kind==='custom'&&onDeleteTag?<Pressable onPress={()=>confirmDeleteTag(filter.name)} hitSlop={8}><Text style={styles.filterDelete}>DELETE TAG</Text></Pressable>:null}<Pressable onPress={()=>setFilter(null)} hitSlop={8}><Text style={styles.filterClear}>CLEAR</Text></Pressable></View>:null}
    {letters.length===0?<View style={styles.empty}><Text style={styles.emptyText}>{contacts.length===0?`Your book is empty. Tap ＋ to add a customer${onImportContacts?' or ⇪ to import your book':''}.`:'No matches'}</Text></View>:letters.map(L=><View key={L}><Text style={styles.letterHead}>{L}</Text><View style={styles.group}>{groups[L].map((c,i)=><View key={c.id} style={[i>0&&styles.rowDivider]}><ContactRow c={c} onTap={()=>onSelect(c)} allTags={tags}/></View>)}</View></View>)}
    {callQueueOpen?<CallQueue contacts={queueContacts} onClose={()=>setCallQueueOpen(false)}/>:null}
  </View>;
}

const styles=StyleSheet.create({
  root:{paddingBottom:spacing.xl},center:{padding:spacing.xl,alignItems:'center'},error:{color:colors.red,fontSize:13,marginBottom:12,textAlign:'center'},retryBtn:{paddingHorizontal:18,paddingVertical:10,backgroundColor:colors.goldBg,borderWidth:1,borderColor:colors.gold,borderRadius:radius.full},retryText:{color:colors.gold,fontWeight:'700',fontSize:13},
  searchWrap:{paddingTop:12,paddingHorizontal:14,paddingBottom:8,flexDirection:'row',alignItems:'center',gap:8},searchBox:{flex:1,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.ink4,borderRadius:radius.md,paddingHorizontal:12},addBtn:{width:42,height:42,borderRadius:radius.md,backgroundColor:colors.gold,alignItems:'center',justifyContent:'center'},addBtnText:{fontSize:22,fontWeight:'800',color:colors.ink,lineHeight:24},importBtn:{width:42,height:42,borderRadius:radius.md,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.goldBorder,alignItems:'center',justifyContent:'center'},importBtnText:{fontSize:19,fontWeight:'800',color:colors.gold,lineHeight:22},searchIcon:{color:colors.grey,fontSize:14},searchInput:{flex:1,color:colors.white,fontSize:14,paddingVertical:10},searchClear:{color:colors.gold,fontSize:14},
  queueLauncher:{marginHorizontal:14,marginBottom:6,padding:13,borderRadius:radius.lg,backgroundColor:colors.goldBg,borderWidth:1,borderColor:colors.goldBorder,flexDirection:'row',alignItems:'center',gap:10},queueLauncherDisabled:{opacity:.45},queueLauncherIcon:{fontSize:22},queueLauncherTitle:{color:colors.gold,fontSize:12,fontWeight:'800',letterSpacing:.8},queueLauncherSub:{color:colors.grey2,fontSize:10,marginTop:2},queueLauncherArrow:{color:colors.gold,fontSize:20,fontWeight:'800'},
  chipsRow:{paddingHorizontal:14,paddingTop:4,paddingBottom:10,gap:7},chip:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:13,paddingVertical:7,borderRadius:radius.full,borderWidth:1},chipDot:{width:6,height:6,borderRadius:3},chipIcon:{fontSize:11},chipText:{fontSize:12,fontWeight:'700',letterSpacing:.3},filterHint:{marginHorizontal:14,marginBottom:4,paddingHorizontal:12,paddingVertical:8,backgroundColor:colors.goldBg,borderWidth:1,borderColor:colors.goldBorder,borderRadius:radius.md,flexDirection:'row',alignItems:'center',gap:8},filterLabel:{fontSize:10,fontWeight:'700',letterSpacing:1,color:colors.gold,textTransform:'uppercase'},filterValue:{fontSize:12,fontWeight:'600',color:colors.white},filterCount:{fontSize:11,color:colors.grey2},filterClear:{fontSize:11,fontWeight:'700',color:colors.gold},filterDelete:{fontSize:11,fontWeight:'700',color:colors.red,marginRight:12},
  empty:{marginHorizontal:14,marginTop:16,paddingVertical:32,paddingHorizontal:16,alignItems:'center',backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.ink4,borderRadius:radius.lg},emptyText:{color:colors.grey2,fontSize:14},letterHead:{paddingHorizontal:16,paddingTop:12,paddingBottom:4,fontSize:11,fontWeight:'700',color:colors.gold,letterSpacing:1.2},group:{marginHorizontal:14,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.ink4,borderRadius:radius.lg,overflow:'hidden'},rowDivider:{borderTopWidth:1,borderTopColor:colors.ink3},row:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:10},rowText:{flex:1,minWidth:0},nameRow:{flexDirection:'row',alignItems:'center',gap:6},name:{fontSize:15,fontWeight:'600',color:colors.white,letterSpacing:-.2,flexShrink:1},demoPill:{fontSize:8,fontWeight:'800',letterSpacing:0.8,color:colors.gold,backgroundColor:colors.goldBg,borderWidth:1,borderColor:colors.goldBorder,borderRadius:4,paddingHorizontal:4,paddingVertical:1,overflow:'hidden'},vehicle:{fontSize:11,color:colors.grey2,marginTop:2},tagRow:{flexDirection:'row',flexWrap:'wrap',gap:4,marginTop:4},tagPill:{paddingHorizontal:6,paddingVertical:1,borderRadius:radius.full,borderWidth:1},tagText:{fontSize:9,fontWeight:'700',letterSpacing:.3},tierDot:{width:8,height:8,borderRadius:4},
  queueOverlay:{...StyleSheet.absoluteFillObject,zIndex:100,backgroundColor:'rgba(5,5,8,.92)',alignItems:'center',justifyContent:'center',padding:18},queueCard:{width:'100%',maxWidth:520,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.goldBorder,borderRadius:radius.xl,padding:22,maxHeight:'92%'},queueTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},queueEyebrow:{color:colors.gold,fontSize:10,fontWeight:'800',letterSpacing:1.4},queueCount:{color:colors.grey2,fontSize:12,marginTop:3},queueClose:{color:colors.grey2,fontSize:18},queueTitle:{color:colors.white,fontSize:25,fontWeight:'800',marginTop:16},queueSub:{color:colors.grey2,fontSize:13,lineHeight:19,marginTop:7,marginBottom:18},queuePrimary:{backgroundColor:colors.gold,borderRadius:radius.lg,paddingVertical:15,alignItems:'center'},queuePrimaryText:{color:colors.ink,fontSize:13,fontWeight:'900'},queuePerson:{alignItems:'center',paddingVertical:22},queueName:{color:colors.white,fontSize:25,fontWeight:'800',marginTop:10},queuePhone:{color:colors.grey2,fontSize:13,marginTop:3},queueVehicle:{color:colors.gold,fontSize:12,marginTop:7},queueCall:{backgroundColor:colors.green,borderRadius:radius.lg,paddingVertical:16,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:8},queueCallIcon:{fontSize:18},queueCallText:{color:colors.ink,fontSize:14,fontWeight:'900',letterSpacing:.7},queueQuestion:{color:colors.white,fontSize:14,fontWeight:'700',marginBottom:9},outcomeGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},outcomeBtn:{width:'48%',flexGrow:1,minWidth:150,paddingVertical:14,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.ink4,borderRadius:radius.md,alignItems:'center',gap:4},outcomeIcon:{color:colors.gold,fontSize:18,fontWeight:'800'},outcomeText:{color:colors.grey3,fontSize:10,fontWeight:'800',letterSpacing:.5},textCard:{marginTop:14,padding:14,backgroundColor:colors.goldBg,borderWidth:1,borderColor:colors.goldBorder,borderRadius:radius.md},textLabel:{color:colors.gold,fontSize:10,fontWeight:'900',letterSpacing:1},textBody:{color:colors.white,fontSize:13,lineHeight:19,marginTop:8},textActions:{flexDirection:'row',gap:8,marginTop:12},textSecondary:{flex:1,borderWidth:1,borderColor:colors.ink4,borderRadius:radius.md,paddingVertical:11,alignItems:'center'},textSecondaryText:{color:colors.grey3,fontSize:11,fontWeight:'800'},textPrimary:{flex:1,backgroundColor:colors.gold,borderRadius:radius.md,paddingVertical:11,alignItems:'center'},textPrimaryText:{color:colors.ink,fontSize:11,fontWeight:'900'},nextBtn:{marginTop:14,backgroundColor:colors.gold,borderRadius:radius.lg,paddingVertical:15,alignItems:'center'},nextText:{color:colors.ink,fontSize:13,fontWeight:'900',letterSpacing:.7},
});
