// ─── PocketRep Shared UI Components ──────────────────────────────────────────
// Ported from Snack v8 FINAL

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated, Dimensions, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, ActivityIndicator,
  Modal, Alert, PanResponder, Image,
} from 'react-native';
import { C, clamp, STAGE_COLORS } from '@/lib/constants';

const { width, height } = Dimensions.get('window');

// ─── FADE-IN WRAPPER ──────────────────────────────────────────────────────────
export function FadeIn({ children, duration = 220, delay = 0, style }: any) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);
  return <Animated.View style={[{ opacity }, style]}>{children}</Animated.View>;
}

// ─── SKELETON SHIMMER ─────────────────────────────────────────────────────────
export function Skeleton({ width: w = '100%', height: h = 16, radius = 8, style }: any) {
  const shimmer = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[{ width: w, height: h, borderRadius: radius, backgroundColor: C.surface2, opacity: shimmer }, style]} />;
}

// ─── PRESS SCALE ──────────────────────────────────────────────────────────────
export function PressScale({ children, onPress, style, scale = 0.96 }: any) {
  const sc = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(sc, { toValue: scale, useNativeDriver: true, speed: 50 }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 50 }).start()}
      onPress={onPress}>
      <Animated.View style={[{ transform: [{ scale: sc }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

// ─── SLIDE-UP MODAL WRAPPER ───────────────────────────────────────────────────
export function SlideUp({ children, visible, style }: any) {
  const translateY = useRef(new Animated.Value(400)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 400, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!visible) return null;
  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

// ─── LOGO MARK ────────────────────────────────────────────────────────────────
export function LogoMark({ size = 36, showText = false }: { size?: number; showText?: boolean }) {
  const r = size * 0.22;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.28 }}>
      <View style={{
        width: size, height: size, borderRadius: r, backgroundColor: C.gold,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: C.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: size * 0.3, elevation: 8,
      }}>
        <Text style={{ fontSize: size * 0.42, fontWeight: '900', color: C.ink, letterSpacing: -1, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }) }}>PR</Text>
      </View>
      {showText && (
        <Text style={{ fontSize: size * 0.6, fontWeight: '800', color: C.gold, letterSpacing: 2, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }) }}>
          Pocket<Text style={{ color: C.grey2 }}>Rep</Text>
        </Text>
      )}
    </View>
  );
}

// ─── GOLD BUTTON ──────────────────────────────────────────────────────────────
export function GoldBtn({ label, onPress, loading, outline, small, style, disabled }: any) {
  const sc = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(sc, { toValue: 0.96, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1, useNativeDriver: true }).start()}
      onPress={(!loading && !disabled) ? onPress : undefined}>
      <Animated.View style={[{
        backgroundColor: outline ? 'transparent' : C.gold, borderRadius: 10, height: small ? 40 : 50,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: outline ? 1 : 0, borderColor: outline ? C.border2 : 'transparent',
        shadowColor: outline ? 'transparent' : C.gold,
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: outline ? 0 : 0.28, shadowRadius: 8, elevation: outline ? 0 : 5,
        opacity: disabled ? 0.5 : 1, transform: [{ scale: sc }],
      }, style]}>
        {loading
          ? <ActivityIndicator color={outline ? C.gold : C.ink} size="small" />
          : <Text style={{ fontSize: small ? 13 : 15, fontWeight: '700', color: outline ? C.grey3 : C.ink, letterSpacing: 0.5 }}>{label}</Text>
        }
      </Animated.View>
    </Pressable>
  );
}

// ─── INPUT FIELD ──────────────────────────────────────────────────────────────
export function InputField({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize = 'none', error, right, returnKeyType, onSubmitEditing, inputRef, multiline, editable = true }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 13 }}>
      {label && <Text style={T.label}>{label}</Text>}
      <View style={[T.inputRow, {
        borderColor: error ? C.red : focused ? C.gold : C.border2,
        height: multiline ? undefined : 48,
        alignItems: multiline ? 'flex-start' : 'center',
        paddingVertical: multiline ? 12 : 0,
        opacity: editable ? 1 : 0.5,
      }]}>
        <TextInput
          ref={inputRef}
          style={[T.input, multiline && { height: 80, textAlignVertical: 'top' }]}
          placeholder={placeholder}
          placeholderTextColor={C.grey}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          multiline={multiline}
        />
        {right}
      </View>
      {error && <Text style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{error}</Text>}
    </View>
  );
}

// ─── HEAT BADGE ───────────────────────────────────────────────────────────────
export function HeatBadge({ score }: { score: number }) {
  const color = score >= 80 ? C.green : score >= 60 ? C.gold : score >= 40 ? '#f59e0b' : C.grey2;
  return (
    <View style={{ backgroundColor: `${color}22`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: `${color}44` }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{Math.round(score || 0)}</Text>
    </View>
  );
}

// ─── STAGE BADGE ──────────────────────────────────────────────────────────────
export function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage] || C.grey2;
  return (
    <View style={{ backgroundColor: `${color}22`, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color, textTransform: 'capitalize' }}>{stage}</Text>
    </View>
  );
}

// ─── TAG PILL ─────────────────────────────────────────────────────────────────
export function TagPill({ tag, active, onPress, onRemove, small }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: small ? 10 : 13, paddingVertical: small ? 5 : 8,
      borderRadius: 100, backgroundColor: active ? C.goldBg : C.surface2,
      borderWidth: 1, borderColor: active ? C.goldBorder : C.border2,
      marginRight: 6, marginBottom: 6,
    }}>
      <Text style={{ fontSize: small ? 10 : 12, color: active ? C.gold : C.grey2, fontWeight: '600' }}>#{tag}</Text>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 10, color: C.grey2 }}>✕</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── AVATAR ───────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 36, photoUri }: { name: string; size?: number; photoUri?: string | null }) {
  const initials = (name || '??').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  if (photoUri) {
    return (
      <Image source={{ uri: photoUri }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: C.goldBorder, backgroundColor: C.surface2 }} />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldBorder, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.36, fontWeight: '700', color: C.gold }}>{initials}</Text>
    </View>
  );
}

// ─── CARD ─────────────────────────────────────────────────────────────────────
export function Card({ children, style }: any) {
  return (
    <View style={[{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 20 }, style]}>
      {children}
    </View>
  );
}

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
export function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <LogoMark size={48} />
      <ActivityIndicator color={C.gold} size="large" />
      <Text style={{ color: C.grey2, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

// ─── ERROR BANNER ─────────────────────────────────────────────────────────────
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <View style={{ backgroundColor: 'rgba(228,82,82,0.12)', borderWidth: 1, borderColor: 'rgba(228,82,82,0.3)', borderRadius: 10, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ fontSize: 14 }}>⚠️</Text>
      <Text style={{ flex: 1, fontSize: 13, color: '#f87171' }}>{message}</Text>
    </View>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
      <Text style={{ fontSize: 48 }}>{icon}</Text>
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 13, color: C.grey2, textAlign: 'center', lineHeight: 20 }}>{subtitle}</Text>
    </View>
  );
}

// ─── AI RESPONSE BOX ──────────────────────────────────────────────────────────
export function AIResponseBox({ text, loading, onCopy, onRegenerate }: any) {
  if (!text && !loading) return null;
  return (
    <View style={{ backgroundColor: C.ink3, borderWidth: 1, borderColor: C.goldBorder, borderRadius: 12, padding: 16, marginTop: 14 }}>
      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={C.gold} size="small" />
          <Text style={{ color: C.grey2, fontSize: 13 }}>AI is writing your script...</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: C.text, lineHeight: 21, marginBottom: 14 }}>{text}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldBorder, borderRadius: 8, padding: 10, alignItems: 'center' }} onPress={onCopy}>
              <Text style={{ fontSize: 12, color: C.gold, fontWeight: '600' }}>📋 Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border2, borderRadius: 8, padding: 10, alignItems: 'center' }} onPress={onRegenerate}>
              <Text style={{ fontSize: 12, color: C.grey3, fontWeight: '600' }}>🔄 Regenerate</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ─── SWIPE BACK VIEW ──────────────────────────────────────────────────────────
export function SwipeBackView({ children, onBack, style }: any) {
  const translateX = useRef(new Animated.Value(0)).current;
  const firingRef = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !!onBack && g.dx > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderMove: (_, g) => {
        if (g.dx <= 0) return;
        translateX.setValue(clamp(g.dx, 0, width * 0.35));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 90 && !firingRef.current) {
          firingRef.current = true;
          Animated.timing(translateX, { toValue: width, duration: 180, useNativeDriver: true }).start(() => {
            translateX.setValue(0);
            firingRef.current = false;
            onBack?.();
          });
          return;
        }
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    })
  ).current;
  return (
    <Animated.View style={[{ flex: 1, transform: [{ translateX }] }, style]} {...(onBack ? panResponder.panHandlers : {})}>
      {children}
    </Animated.View>
  );
}

// ─── SWIPEABLE ROW ────────────────────────────────────────────────────────────
export function SwipeableRow({ children, leftActions = [], rightActions = [], style, rowBorderRadius = 14, swipeActionMenu = null, swipeActionDirection = 'both' }: any) {
  const leftWidth = leftActions.length * 92;
  const rightWidth = rightActions.length * 92;
  const translateX = useRef(new Animated.Value(0)).current;
  const currentOpen = useRef(0);
  const menuOpenRef = useRef(false);
  const swipeMenuEnabled = !!(swipeActionMenu?.actions?.length);

  const snapTo = (value = 0) => {
    currentOpen.current = value;
    Animated.spring(translateX, { toValue: value, useNativeDriver: true, bounciness: 0 }).start();
  };
  const close = () => snapTo(0);

  const openSwipeActionMenu = () => {
    if (!swipeMenuEnabled || menuOpenRef.current) return;
    menuOpenRef.current = true;
    Alert.alert(
      swipeActionMenu?.title || 'Contact actions',
      swipeActionMenu?.message || 'Choose what you want to do.',
      [
        ...(swipeActionMenu?.actions || []).map((action: any) => ({
          text: action.label,
          style: action.style || 'default',
          onPress: () => { menuOpenRef.current = false; action.onPress?.(); },
        })),
        { text: 'Cancel', style: 'cancel', onPress: () => { menuOpenRef.current = false; } },
      ]
    );
  };

  const handleRelease = (_: any, g: any) => {
    if (swipeMenuEnabled) {
      const swipedLeft = g.dx < -48 && (swipeActionDirection === 'left' || swipeActionDirection === 'both');
      const swipedRight = g.dx > 48 && (swipeActionDirection === 'right' || swipeActionDirection === 'both');
      close();
      if (swipedLeft || swipedRight) requestAnimationFrame(openSwipeActionMenu);
      return;
    }
    if (g.dx > 48 && leftActions.length) { snapTo(leftWidth); return; }
    if (g.dx < -48 && rightActions.length) { snapTo(-rightWidth); return; }
    close();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.15,
      onPanResponderMove: (_, g) => {
        if (swipeMenuEnabled) { translateX.setValue(clamp(g.dx * 0.24, -28, 28)); return; }
        translateX.setValue(clamp(g.dx + currentOpen.current, -rightWidth, leftWidth));
      },
      onPanResponderRelease: handleRelease,
      onPanResponderTerminate: handleRelease,
    })
  ).current;

  const renderActions = (actions: any[], side = 'left') => {
    if (!actions.length || swipeMenuEnabled) return null;
    return (
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: side === 'left' ? 'flex-start' : 'flex-end' }}>
        {(side === 'left' ? actions : [...actions].reverse()).map((action: any, idx: number) => (
          <TouchableOpacity key={`${side}-${idx}`} onPress={() => { close(); action.onPress?.(); }}
            style={{
              width: 92, alignItems: 'center', justifyContent: 'center',
              backgroundColor: action.backgroundColor || (side === 'left' ? C.blue : C.red),
              borderTopLeftRadius: side === 'left' && idx === 0 ? rowBorderRadius : 0,
              borderBottomLeftRadius: side === 'left' && idx === 0 ? rowBorderRadius : 0,
              borderTopRightRadius: side === 'right' && idx === 0 ? rowBorderRadius : 0,
              borderBottomRightRadius: side === 'right' && idx === 0 ? rowBorderRadius : 0,
            }}>
            {!!action.icon && <Text style={{ fontSize: 18, marginBottom: 6 }}>{action.icon}</Text>}
            <Text style={{ fontSize: 12, fontWeight: '700', color: action.color || C.text, textAlign: 'center', paddingHorizontal: 8 }}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={[{ overflow: 'hidden', borderRadius: rowBorderRadius }, style]}>
      {renderActions(leftActions, 'left')}
      {renderActions(rightActions, 'right')}
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

// ─── ASSIGN SEQUENCE MODAL ────────────────────────────────────────────────────
export function AssignSequenceModal({ visible, contact, sequences = [], assignedId, onClose, onAssigned }: any) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.ink, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, maxHeight: height * 0.78 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Assign Sequence</Text>
              <Text style={{ fontSize: 12, color: C.grey2, marginTop: 4 }}>{contact ? `${contact.first_name} ${contact.last_name || ''}` : 'Select a contact first'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}><Text style={{ fontSize: 18, color: C.grey2 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {(sequences || []).length === 0 ? (
              <Card><Text style={{ fontSize: 13, color: C.grey2 }}>No sequences available yet.</Text></Card>
            ) : (
              sequences.map((seq: any) => (
                <TouchableOpacity key={seq.id} onPress={() => onAssigned?.(seq)}
                  style={{ backgroundColor: assignedId === seq.id ? C.goldBg : C.surface, borderWidth: 1, borderColor: assignedId === seq.id ? C.goldBorder : C.border, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: assignedId === seq.id ? C.gold : C.text }}>{seq.name}</Text>
                  {!!seq.description && <Text style={{ fontSize: 11, color: C.grey2, marginTop: 4, lineHeight: 17 }}>{seq.description}</Text>}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── ASSIGN CONTACT MODAL ─────────────────────────────────────────────────────
export function AssignContactModal({ visible, sequence, contacts = [], onClose, onAssigned }: any) {
  const [search, setSearch] = useState('');
  useEffect(() => { if (visible) setSearch(''); }, [visible]);
  if (!visible) return null;
  const filtered = (contacts || []).filter((c: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.first_name, c.last_name, c.phone, c.email, c.product, c.notes, ...(c.tags || [])].some((v: any) => String(v || '').toLowerCase().includes(q));
  });
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.ink, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, maxHeight: height * 0.82 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Assign Contact</Text>
              <Text style={{ fontSize: 12, color: C.grey2, marginTop: 4 }}>{sequence?.name || 'Choose a sequence first'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}><Text style={{ fontSize: 18, color: C.grey2 }}>✕</Text></TouchableOpacity>
          </View>
          <InputField label="Search contacts" placeholder="Search by name, phone, product..." value={search} onChangeText={setSearch} />
          <ScrollView showsVerticalScrollIndicator={false}>
            {filtered.slice(0, 40).map((contact: any) => (
              <TouchableOpacity key={contact.id} onPress={() => onAssigned?.(contact)}
                style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={`${contact.first_name} ${contact.last_name || ''}`} photoUri={contact.photo_uri} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{contact.first_name} {contact.last_name || ''}</Text>
                  <Text style={{ fontSize: 12, color: C.grey2, marginTop: 3 }}>{contact.product || contact.phone || 'No details yet'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── TAG SELECTOR ─────────────────────────────────────────────────────────────
import { ALL_SUGGESTED_TAGS } from '@/lib/constants';

export function TagSelector({ selected = [], onChange, existingTags = [] }: any) {
  const [custom, setCustom] = useState('');
  const allTags = [...new Set([...ALL_SUGGESTED_TAGS, ...existingTags])];

  const toggle = (tag: string) => {
    if (selected.includes(tag)) onChange(selected.filter((t: string) => t !== tag));
    else onChange([...selected, tag]);
  };

  const addCustom = () => {
    const t = custom.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t) return;
    if (!selected.includes(t)) onChange([...selected, t]);
    setCustom('');
  };

  return (
    <View>
      <Text style={T.label}>Tags</Text>
      {selected.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          {selected.map((t: string) => <TagPill key={t} tag={t} active onRemove={() => toggle(t)} />)}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={[T.inputRow, { flex: 1, height: 38 }]}>
          <TextInput style={T.input} placeholder="Add custom tag (e.g. rogue, lease)"
            placeholderTextColor={C.grey} value={custom} onChangeText={setCustom}
            autoCapitalize="none" autoCorrect={false} returnKeyType="done"
            onSubmitEditing={addCustom} onBlur={addCustom} />
        </View>
        <TouchableOpacity onPress={addCustom} style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldBorder, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: C.gold }}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 10, color: C.grey, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Quick add</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {allTags.filter((t: string) => !selected.includes(t)).slice(0, 20).map((t: string) => (
          <TagPill key={t} tag={t} small onPress={() => toggle(t)} />
        ))}
      </View>
    </View>
  );
}

// ─── SHARED STYLESHEET ────────────────────────────────────────────────────────
export const T = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, color: C.grey2, marginBottom: 7 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14 },
  input: { flex: 1, color: C.text, fontSize: 14 },
  border: { borderColor: C.border2 },
});

// Re-export C for convenience
export { C };
