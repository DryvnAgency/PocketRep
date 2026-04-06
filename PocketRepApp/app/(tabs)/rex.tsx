// ─── Rex / AI Closer Screen ────────────────────────────────────────────────────
// PocketRep — AICloserScreen ported from Snack v8 FINAL

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Clipboard, Image,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  C, SUPABASE_URL, OBJECTIONS, INDUSTRIES,
  extractAiText, generateFallbackRebuttal, generateFallbackCoaching,
} from '@/lib/constants';
import { authService, contactService, aiService } from '@/lib/services';
import {
  Avatar, Card, SwipeBackView,
} from '@/components/shared';

// ─── Lazy image picker ────────────────────────────────────────────────────────
let ImagePicker: any = null;
try { ImagePicker = require('expo-image-picker'); } catch {}

// ─── Types ────────────────────────────────────────────────────────────────────
type View_ = 'home' | 'rebuttal' | 'coaching';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  ts: number;
}

interface RexUsage {
  count: number;
  limit: number;
}

interface CoachingPhoto {
  uri: string;
  name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const REBUTTAL_INDUSTRIES = ['auto', 'mortgage', 'realestate', 'insurance', 'solar', 'b2b'];

const QUICK_PROMPTS = [
  'Need to think',
  'Payment too high',
  'First stop',
  'Spouse needs to see',
  'Found it cheaper',
  'Deal falling apart',
  'Script my opener',
  'Build follow-up',
];

const VARIATION_SEEDS = [
  'Use a rapport-first angle.',
  'Use a scarcity and urgency angle.',
  'Use a logic and value angle.',
  'Use a story-based approach.',
  'Use a direct and bold closing angle.',
  'Use an empathy and understanding angle.',
];

function pickSeed(): string {
  return VARIATION_SEEDS[Math.floor(Math.random() * VARIATION_SEEDS.length)];
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AICloserScreen() {
  // Navigation
  const [view, setView] = useState<View_>('home');

  // User / plan
  const [userProfile, setUserProfile] = useState<any>(null);

  // Contacts
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Rebuttal view
  const [selectedIndustry, setSelectedIndustry] = useState('auto');
  const [expandedObj, setExpandedObj] = useState<string | null>(null);
  const [rebuttalText, setRebuttalText] = useState('');
  const [rebuttalLoading, setRebuttalLoading] = useState(false);

  // Coaching view
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [coachingPhotos, setCoachingPhotos] = useState<CoachingPhoto[]>([]);
  const [rexUsage, setRexUsage] = useState<RexUsage>({ count: 0, limit: 10 });
  const [rexRecording, setRexRecording] = useState(false);

  const chatScrollRef = useRef<ScrollView>(null);

  // ─── Load user on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    authService.getUser()
      .then(u => {
        if (u) setUserProfile(u);
      })
      .catch(() => {});
  }, []);

  // ─── Load contacts when needed ──────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    try {
      const all = await contactService.getAll();
      setAllContacts(all);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (view !== 'home') loadContacts();
    }, [view, loadContacts])
  );

  useEffect(() => {
    if (view === 'rebuttal' || view === 'coaching') loadContacts();
  }, [view]);

  // ─── Load Rex usage (Pro plan only) ────────────────────────────────────────
  const loadRexUsage = useCallback(async () => {
    try {
      const session = await authService.getSession();
      if (!session) return;
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('rex_usage')
        .select('count, limit')
        .eq('user_id', session.user.id)
        .eq('date', today)
        .maybeSingle();
      if (data) {
        setRexUsage({ count: data.count ?? 0, limit: data.limit ?? 10 });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (view === 'coaching') loadRexUsage();
  }, [view]);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const isElite = userProfile?.plan === 'elite';
  const isPro = userProfile?.plan === 'pro';
  const showUsageBar = isPro && !isElite;
  const usageLeft = Math.max(0, rexUsage.limit - rexUsage.count);
  const usagePct = rexUsage.limit > 0 ? rexUsage.count / rexUsage.limit : 0;

  const filteredContacts = allContacts.filter(c => {
    if (!contactSearch.trim()) return false;
    const needle = contactSearch.trim().toLowerCase();
    return [c.first_name, c.last_name, c.phone, c.product, c.notes]
      .some(v => String(v || '').toLowerCase().includes(needle));
  }).slice(0, 8);

  // ─── Rebuttal handlers ──────────────────────────────────────────────────────
  const handleExpandObj = async (obj: string) => {
    if (expandedObj === obj) {
      setExpandedObj(null);
      setRebuttalText('');
      return;
    }
    setExpandedObj(obj);
    setRebuttalText('');
    setRebuttalLoading(true);
    try {
      const result = await aiService.call('rebuttal', {
        contact_id: selectedContact?.id ?? null,
        objection: obj,
      });
      setRebuttalText(extractAiText(result, generateFallbackRebuttal({ contact: selectedContact, objection: obj })));
    } catch {
      setRebuttalText(generateFallbackRebuttal({ contact: selectedContact, objection: obj }));
    } finally {
      setRebuttalLoading(false);
    }
  };

  const handleNewAngle = async (obj: string) => {
    setRebuttalLoading(true);
    setRebuttalText('');
    try {
      const result = await aiService.call('coaching', {
        contact_id: null,
        chat_history: [],
        message: `Give me a COMPLETELY DIFFERENT rebuttal for this objection: "${obj}". Use different words, a different angle, a different tone. Do not repeat what you said before.`,
      });
      setRebuttalText(extractAiText(result, generateFallbackRebuttal({ contact: selectedContact, objection: obj })));
    } catch {
      setRebuttalText(generateFallbackRebuttal({ contact: selectedContact, objection: obj }));
    } finally {
      setRebuttalLoading(false);
    }
  };

  const handleIndustryChange = (ind: string) => {
    setSelectedIndustry(ind);
    setExpandedObj(null);
    setRebuttalText('');
    if (selectedContact) {
      setSelectedContact({ ...selectedContact, industry_context: ind });
    } else {
      setSelectedContact({ industry_context: ind, id: null });
    }
  };

  // ─── Coaching / send ────────────────────────────────────────────────────────
  const sendCoaching = async (overrideText?: string) => {
    const rawText = (overrideText ?? chatInput).trim();
    if (!rawText || chatLoading) return;

    const cleanHistory = chatMessages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: m.text,
    }));

    const seed = pickSeed();
    const seededMessage = rawText + ' ' + seed;

    const userMsg: ChatMessage = { role: 'user', text: rawText, ts: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setCoachingPhotos([]);
    setChatLoading(true);

    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const session = await authService.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(SUPABASE_URL + '/functions/v1/ai-closer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          action: 'coaching',
          contact_id: selectedContact?.id ?? null,
          chat_history: cleanHistory,
          message: seededMessage,
        }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        if (data?.usage) setRexUsage(data.usage);
        const limitMsg: ChatMessage = {
          role: 'ai',
          text: 'Daily limit reached. Come back tomorrow or upgrade your plan for more Rex messages.',
          ts: Date.now(),
        };
        setChatMessages(prev => [...prev, limitMsg]);
        setChatLoading(false);
        return;
      }

      const data = await res.json();
      if (data?.usage) setRexUsage(data.usage);

      const aiText = extractAiText(
        data.result ?? data.results ?? data,
        generateFallbackCoaching({ message: rawText, contact: selectedContact, plan: userProfile?.plan })
      );
      const aiMsg: ChatMessage = { role: 'ai', text: aiText, ts: Date.now() };
      setChatMessages(prev => [...prev, aiMsg]);
    } catch {
      const fallback = generateFallbackCoaching({ message: rawText, contact: selectedContact, plan: userProfile?.plan });
      setChatMessages(prev => [...prev, { role: 'ai', text: fallback, ts: Date.now() }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    sendCoaching(prompt);
  };

  const handleMic = async () => {
    if (Platform.OS === 'web') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        Alert.alert('Not supported', 'Speech recognition is not available in this browser.');
        return;
      }
      setRexRecording(true);
      const recognition = new SR();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.onresult = (e: any) => {
        const transcript = e.results?.[0]?.[0]?.transcript || '';
        setChatInput(transcript);
        setRexRecording(false);
        setTimeout(() => sendCoaching(transcript), 300);
      };
      recognition.onerror = () => setRexRecording(false);
      recognition.onend = () => setRexRecording(false);
      recognition.start();
    } else {
      Alert.alert('Voice Input', 'Voice input uses your browser\'s speech recognition. Open PocketRep in a web browser to use this feature.');
    }
  };

  const pickImageFromLibrary = async () => {
    if (!ImagePicker) {
      Alert.alert('Not available', 'expo-image-picker is required to attach photos. Please install it with: npx expo install expo-image-picker');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? 'images',
        allowsMultipleSelection: false,
        quality: 0.8,
        base64: false,
      });
      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        const name = asset.fileName || `photo_${Date.now()}.jpg`;
        setCoachingPhotos(prev => [...prev, { uri: asset.uri, name }]);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not open image library.');
    }
  };

  // ─── HOME VIEW ──────────────────────────────────────────────────────────────
  if (view === 'home') {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink }}>
        {/* Header */}
        <View style={{
          paddingTop: Platform.select({ ios: 54, android: 40, default: 40 }),
          paddingHorizontal: 20,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}>
          <View style={{
            width: 38, height: 38, borderRadius: 10, backgroundColor: C.gold,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: C.ink }}>R</Text>
          </View>
          <View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: 0.3 }}>Rex</Text>
            <Text style={{ fontSize: 12, color: C.grey2 }}>Your AI Sales Closer</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Text style={{ fontSize: 13, color: C.grey2, marginBottom: 4 }}>
            What do you need help with?
          </Text>

          {/* Card 1: Objection Rebuttals */}
          <TouchableOpacity
            onPress={() => setView('rebuttal')}
            activeOpacity={0.82}
            style={{
              backgroundColor: C.surface,
              borderWidth: 1,
              borderColor: C.border,
              borderRadius: 14,
              padding: 20,
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 26 }}>💬</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>Objection Rebuttals</Text>
            <Text style={{ fontSize: 13, color: C.grey2, lineHeight: 20 }}>
              Touch any objection — get Rex's exact rebuttal instantly
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: C.gold, fontWeight: '600' }}>Open →</Text>
            </View>
          </TouchableOpacity>

          {/* Card 2: Coach Rex */}
          <TouchableOpacity
            onPress={() => setView('coaching')}
            activeOpacity={0.82}
            style={{
              backgroundColor: C.surface,
              borderWidth: 1,
              borderColor: C.border,
              borderRadius: 14,
              padding: 20,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 26 }}>🔴</Text>
              {(isPro || isElite) && (
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderRadius: 6,
                  backgroundColor: isElite ? 'rgba(212,168,67,0.22)' : 'rgba(55,138,221,0.18)',
                  borderWidth: 1,
                  borderColor: isElite ? C.goldBorder : 'rgba(55,138,221,0.35)',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: isElite ? C.gold : C.blue, letterSpacing: 1 }}>
                    {isElite ? 'ELITE' : 'PRO'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>Coach Rex</Text>
            <Text style={{ fontSize: 13, color: C.grey2, lineHeight: 20 }}>
              Real-time AI coaching — search a contact and ask Rex anything
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: C.gold, fontWeight: '600' }}>Open →</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─── REBUTTAL VIEW ──────────────────────────────────────────────────────────
  if (view === 'rebuttal') {
    const currentObjList = OBJECTIONS[selectedIndustry] || OBJECTIONS['auto'] || [];

    return (
      <SwipeBackView onBack={() => { setView('home'); setExpandedObj(null); setRebuttalText(''); }} style={{ flex: 1, backgroundColor: C.ink }}>
        {/* Header */}
        <View style={{
          paddingTop: Platform.select({ ios: 54, android: 40, default: 40 }),
          paddingHorizontal: 20,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}>
          <TouchableOpacity onPress={() => { setView('home'); setExpandedObj(null); setRebuttalText(''); }} style={{ padding: 4 }}>
            <Text style={{ fontSize: 22, color: C.grey3 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.text, flex: 1 }}>Objection Rebuttals</Text>
        </View>

        {/* Industry chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.border }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
        >
          {REBUTTAL_INDUSTRIES.map(ind => {
            const cfg = INDUSTRIES.find(i => i.value === ind);
            const active = selectedIndustry === ind;
            return (
              <TouchableOpacity
                key={ind}
                onPress={() => handleIndustryChange(ind)}
                style={{
                  height: 26,
                  paddingHorizontal: 12,
                  borderRadius: 13,
                  backgroundColor: active ? C.gold : C.surface2,
                  borderWidth: 1,
                  borderColor: active ? C.gold : C.border2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 4,
                }}
              >
                {cfg?.icon ? <Text style={{ fontSize: 11 }}>{cfg.icon}</Text> : null}
                <Text style={{ fontSize: 11, fontWeight: '600', color: active ? C.ink : C.grey3 }}>
                  {cfg?.label?.split(' ')[0] ?? ind}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Objection list */}
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {currentObjList.map(obj => {
            const isExpanded = expandedObj === obj;
            return (
              <TouchableOpacity
                key={obj}
                activeOpacity={0.82}
                onPress={() => handleExpandObj(obj)}
                style={{
                  backgroundColor: isExpanded ? C.goldBg : C.surface,
                  borderWidth: 1,
                  borderColor: isExpanded ? C.goldBorder : C.border,
                  borderRadius: 12,
                  padding: 16,
                  gap: isExpanded ? 12 : 0,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: isExpanded ? C.gold : C.text, flex: 1 }}>
                    {obj}
                  </Text>
                  <Text style={{ fontSize: 16, color: isExpanded ? C.gold : C.grey2 }}>{isExpanded ? '▼' : '▶'}</Text>
                </View>

                {isExpanded && (
                  <View>
                    {rebuttalLoading ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 }}>
                        <ActivityIndicator color={C.gold} size="small" />
                        <Text style={{ fontSize: 13, color: C.grey2 }}>Rex is writing your rebuttal...</Text>
                      </View>
                    ) : (
                      <>
                        <Text style={{ fontSize: 13, color: C.text, lineHeight: 21 }}>{rebuttalText}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                          <TouchableOpacity
                            onPress={() => {
                              if (rebuttalText) {
                                Clipboard.setString(rebuttalText);
                                Alert.alert('Copied', 'Rebuttal copied to clipboard.');
                              }
                            }}
                            style={{
                              flex: 1, backgroundColor: C.goldBg, borderWidth: 1,
                              borderColor: C.goldBorder, borderRadius: 8, paddingVertical: 9,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ fontSize: 12, color: C.gold, fontWeight: '600' }}>📋 Copy</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleNewAngle(obj)}
                            style={{
                              flex: 1, backgroundColor: C.surface2, borderWidth: 1,
                              borderColor: C.border2, borderRadius: 8, paddingVertical: 9,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ fontSize: 12, color: C.grey3, fontWeight: '600' }}>🔄 New angle</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SwipeBackView>
    );
  }

  // ─── COACHING VIEW ──────────────────────────────────────────────────────────
  return (
    <SwipeBackView onBack={() => { setView('home'); setChatMessages([]); setSelectedContact(null); setContactSearch(''); }} style={{ flex: 1, backgroundColor: C.ink }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Rex Header */}
        <View style={{
          paddingTop: Platform.select({ ios: 54, android: 40, default: 40 }),
          paddingHorizontal: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}>
          <TouchableOpacity onPress={() => { setView('home'); setChatMessages([]); setSelectedContact(null); setContactSearch(''); }} style={{ padding: 4 }}>
            <Text style={{ fontSize: 22, color: C.grey3 }}>←</Text>
          </TouchableOpacity>

          {/* Gold R avatar */}
          <View style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: C.ink }}>R</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>Rex</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }} />
              <Text style={{ fontSize: 11, color: C.green, fontWeight: '600' }}>Live</Text>
            </View>
          </View>

          {chatMessages.length > 0 && (
            <TouchableOpacity
              onPress={() => { setChatMessages([]); setSelectedContact(null); setContactSearch(''); }}
              style={{
                paddingHorizontal: 12, paddingVertical: 6,
                borderRadius: 8, borderWidth: 1, borderColor: C.border2,
              }}
            >
              <Text style={{ fontSize: 12, color: C.grey2 }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Usage bar (Pro only) */}
        {showUsageBar && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 11, color: C.grey2 }}>
                {usageLeft > 0 ? `${usageLeft} Rex messages left today` : 'Daily limit reached'}
              </Text>
              <Text style={{ fontSize: 11, color: C.grey2 }}>{rexUsage.count}/{rexUsage.limit}</Text>
            </View>
            <View style={{ height: 4, backgroundColor: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{
                height: 4, borderRadius: 2,
                width: `${Math.min(100, usagePct * 100)}%`,
                backgroundColor: usagePct > 0.85 ? C.red : C.gold,
              }} />
            </View>
          </View>
        )}

        {/* Contact search */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
          {selectedContact ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldBorder,
              borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
              alignSelf: 'flex-start', maxWidth: '100%',
            }}>
              <Avatar
                name={`${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`}
                size={22}
                photoUri={selectedContact.photo_uri}
              />
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gold }} numberOfLines={1}>
                  {selectedContact.first_name} {selectedContact.last_name}
                </Text>
                {(selectedContact.product || selectedContact.stage) && (
                  <Text style={{ fontSize: 11, color: C.grey2 }} numberOfLines={1}>
                    {[selectedContact.product, selectedContact.stage].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => { setSelectedContact(null); setContactSearch(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 14, color: C.grey2 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <TextInput
                value={contactSearch}
                onChangeText={setContactSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Search a contact (optional)..."
                placeholderTextColor={C.grey}
                style={{
                  backgroundColor: C.surface2,
                  borderWidth: 1,
                  borderColor: searchFocused ? C.gold : C.border2,
                  borderRadius: 10,
                  height: 38,
                  paddingHorizontal: 12,
                  fontSize: 13,
                  color: C.text,
                }}
              />
              {contactSearch.trim().length > 0 && filteredContacts.length > 0 && (
                <View style={{
                  position: 'absolute', top: 42, left: 0, right: 0, zIndex: 100,
                  backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border2,
                  borderRadius: 10, overflow: 'hidden', elevation: 10,
                }}>
                  {filteredContacts.map((c, i) => (
                    <TouchableOpacity
                      key={c.id || i}
                      onPress={() => { setSelectedContact(c); setContactSearch(''); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingHorizontal: 14, paddingVertical: 10,
                        borderBottomWidth: i < filteredContacts.length - 1 ? 1 : 0,
                        borderBottomColor: C.border,
                      }}
                    >
                      <Avatar name={`${c.first_name || ''} ${c.last_name || ''}`} size={28} photoUri={c.photo_uri} />
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>
                          {c.first_name} {c.last_name}
                        </Text>
                        {(c.product || c.stage) && (
                          <Text style={{ fontSize: 11, color: C.grey2 }}>
                            {[c.product, c.stage].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Quick prompts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.border }}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8, gap: 7 }}
        >
          {QUICK_PROMPTS.map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => handleQuickPrompt(p)}
              disabled={chatLoading}
              style={{
                height: 28, paddingHorizontal: 12, borderRadius: 14,
                backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border2,
                alignItems: 'center', justifyContent: 'center',
                opacity: chatLoading ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 12, color: C.grey3, fontWeight: '500' }}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Chat messages */}
        <ScrollView
          ref={chatScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
        >
          {chatMessages.length === 0 && !chatLoading && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, gap: 12 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 16, backgroundColor: C.gold,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: C.gold, shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.45, shadowRadius: 20, elevation: 10,
              }}>
                <Text style={{ fontSize: 26, fontWeight: '900', color: C.ink }}>R</Text>
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.text }}>Rex is ready.</Text>
              <Text style={{ fontSize: 13, color: C.grey2, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
                Ask about an objection, a deal situation, or drop in a screenshot.{'\n'}Rex gives you exact words — not generic tips.
              </Text>
              <Text style={{ fontSize: 12, color: C.grey, textAlign: 'center', fontStyle: 'italic', lineHeight: 18, maxWidth: 260, marginTop: 4 }}>
                "Customer said payment's too high"{'\n'}
                "Need help closing this lease today"{'\n'}
                "They found it $500 cheaper online"
              </Text>
            </View>
          )}

          {chatMessages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <View
                key={msg.ts + '-' + idx}
                style={{
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  gap: 4,
                }}
              >
                {!isUser && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <View style={{
                      width: 18, height: 18, borderRadius: 5,
                      backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: C.ink }}>R</Text>
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: C.gold, letterSpacing: 1 }}>REX</Text>
                  </View>
                )}
                <View style={{
                  backgroundColor: isUser ? C.gold : C.surface2,
                  borderRadius: 14,
                  borderBottomRightRadius: isUser ? 4 : 14,
                  borderBottomLeftRadius: isUser ? 14 : 4,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  maxWidth: '84%',
                }}>
                  <Text style={{
                    fontSize: 14, lineHeight: 21,
                    color: isUser ? C.ink : C.text,
                  }}>
                    {msg.text}
                  </Text>
                </View>
              </View>
            );
          })}

          {chatLoading && (
            <View style={{ alignItems: 'flex-start', gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{
                  width: 18, height: 18, borderRadius: 5,
                  backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: C.ink }}>R</Text>
                </View>
                <ActivityIndicator color={C.gold} size="small" />
                <Text style={{ fontSize: 12, color: C.grey2 }}>Rex is thinking...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Attached photo previews */}
        {coachingPhotos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, borderTopWidth: 1, borderTopColor: C.border }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
          >
            {coachingPhotos.map((p, i) => (
              <View key={i} style={{ position: 'relative' }}>
                <Image
                  source={{ uri: p.uri }}
                  style={{ width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: C.border2 }}
                />
                <TouchableOpacity
                  onPress={() => setCoachingPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  style={{
                    position: 'absolute', top: -4, right: -4,
                    width: 18, height: 18, borderRadius: 9,
                    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border2,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 9, color: C.grey2 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Input box */}
        <View style={{
          borderTopWidth: 1,
          borderTopColor: C.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
          paddingBottom: Platform.select({ ios: 24, android: 12, default: 12 }),
          backgroundColor: C.ink,
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            backgroundColor: C.surface2,
            borderWidth: 1,
            borderColor: C.border2,
            borderRadius: 14,
            paddingHorizontal: 10,
            paddingVertical: 8,
            gap: 6,
          }}>
            {/* Photo button */}
            <TouchableOpacity
              onPress={pickImageFromLibrary}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 18 }}>📷</Text>
            </TouchableOpacity>

            {/* Mic button */}
            <TouchableOpacity
              onPress={handleMic}
              disabled={rexRecording || chatLoading}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              {rexRecording
                ? <ActivityIndicator color={C.gold} size="small" />
                : <Text style={{ fontSize: 18 }}>🎤</Text>
              }
            </TouchableOpacity>

            {/* Text input */}
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Talk to Rex — objection, situation, screenshot..."
              placeholderTextColor={C.grey}
              multiline
              style={{
                flex: 1,
                fontSize: 14,
                color: C.text,
                maxHeight: 100,
                paddingTop: 2,
                paddingBottom: 2,
                textAlignVertical: 'top',
              }}
              returnKeyType="default"
              blurOnSubmit={false}
            />

            {/* Send button */}
            <TouchableOpacity
              onPress={() => sendCoaching()}
              disabled={!chatInput.trim() || chatLoading}
              style={{
                width: 34, height: 34,
                borderRadius: 10,
                backgroundColor: chatInput.trim() && !chatLoading ? C.gold : C.surface,
                borderWidth: 1,
                borderColor: chatInput.trim() && !chatLoading ? C.gold : C.border2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{
                fontSize: 16, fontWeight: '700',
                color: chatInput.trim() && !chatLoading ? C.ink : C.grey,
              }}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SwipeBackView>
  );
}
