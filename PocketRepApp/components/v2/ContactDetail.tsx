import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Linking, Platform,
} from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { Avatar, Label, Pill, SectionHead, rgbaTint } from './atoms';
import { TIERS } from './tokens';
import type { V2Contact } from '@/lib/v2/useContacts';
import { useDeals, type V2Deal } from '@/lib/v2/useDeals';
import { useTags } from '@/lib/v2/useTags';
import {
  updateContactNotes,
  updateContactTags,
  deleteContact,
  updateContactPreferredLanguage,
} from '@/lib/v2/updateContact';
import { generateGamePlan, type GamePlanChannel } from '@/lib/v2/gamePlan';
import { useContactNurtures } from '@/lib/v2/contactNurtures';
import { pickAndUploadContactPhoto } from '@/lib/v2/contactPhoto';
import LanguageToggle from './LanguageToggle';
import MarkReplyButton from './MarkReplyButton';

const MILESTONE_ICONS: Record<string, { icon: string; color: string }> = {
  'visit':       { icon: '👋', color: colors.gold },
  'test-drive':  { icon: '🚗', color: colors.green },
  'numbers':     { icon: '🧮', color: colors.gold2 },
  'docs':        { icon: '📄', color: colors.grey3 },
  'objection':   { icon: '⚠',  color: colors.orange },
  'no-response': { icon: '∅',  color: colors.red },
};

function digitsOnly(s: string | null): string {
  return (s ?? '').replace(/[^\d]/g, '');
}

export default function ContactDetail({
  contact,
  onClose,
  onLocalUpdate,
  onDeleted,
  dealsRefetchKey = 0,
  onLogDeal,
}: {
  contact: V2Contact;
  onClose: () => void;
  onLocalUpdate: (next: V2Contact) => void;
  onDeleted?: (id: string) => void;
  dealsRefetchKey?: number;
  onLogDeal?: () => void;
}) {
  const tier = TIERS[contact.tier];
  const allTags = useTags();
  const deals = useDeals(contact.id, dealsRefetchKey);
  const [nurtureRefetchKey, setNurtureRefetchKey] = useState(0);
  const nurtures = useContactNurtures(contact.id, nurtureRefetchKey);
  const unmarkedNurtures = nurtures.filter(n => n.sent_at && !n.reply_received);

  const [notes, setNotes] = useState(contact.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [stepView, setStepView] = useState<'latest' | 'next'>('latest');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiChannel, setAiChannel] = useState<GamePlanChannel>('text');
  const [aiWhy, setAiWhy] = useState('');
  const [aiScript, setAiScript] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setNotes(contact.notes ?? '');
    setEditingNotes(false);
    setAiOpen(false);
    setAiScript('');
    setAiError(null);
  }, [contact.id]);

  const totalCommission = useMemo(
    () => deals.reduce((s, d) => s + d.amount, 0),
    [deals]
  );

  const tagColor = (name: string) =>
    allTags.find(t => t.name === name)?.color ?? colors.gold;

  const cancelNotes = () => {
    setNotes(contact.notes ?? '');
    setEditingNotes(false);
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await updateContactNotes(contact.id, notes);
      onLocalUpdate({ ...contact, notes });
      setEditingNotes(false);
    } catch (e) {
      console.warn('saveNotes failed', e);
    } finally {
      setSavingNotes(false);
    }
  };

  const toggleTag = async (name: string) => {
    const has = contact.tags.includes(name);
    const next = has ? contact.tags.filter(t => t !== name) : [...contact.tags, name];
    onLocalUpdate({ ...contact, tags: next });
    try {
      await updateContactTags(contact.id, next);
    } catch (e) {
      onLocalUpdate({ ...contact, tags: contact.tags });
      console.warn('toggleTag failed', e);
    }
  };

  const openCall = () => contact.phone && Linking.openURL(`tel:${digitsOnly(contact.phone)}`);
  const openText = (body?: string) => {
    if (!contact.phone) return;
    const url = body
      ? `sms:${digitsOnly(contact.phone)}?&body=${encodeURIComponent(body)}`
      : `sms:${digitsOnly(contact.phone)}`;
    Linking.openURL(url);
  };
  const openEmail = (body?: string) => {
    const subject = encodeURIComponent(`Following up on the ${contact.vehicle ?? ''}`);
    const url = body
      ? `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`
      : `mailto:?subject=${subject}`;
    Linking.openURL(url);
  };

  const runGamePlan = async () => {
    setAiOpen(true);
    setAiLoading(true);
    setAiError(null);
    setAiScript('');
    setAiWhy('');
    setCopied(false);
    try {
      const result = await generateGamePlan(contact, notes);
      setAiChannel(result.channel);
      setAiWhy(result.why);
      setAiScript(result.script);
    } catch (e: any) {
      setAiError(e?.message ?? 'Rex is unreachable');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteContact(contact.id);
      onDeleted?.(contact.id);
      onClose();
    } catch (e) {
      console.warn('deleteContact failed', e);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const copyScript = async () => {
    if (!aiScript) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(aiScript);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      // fall through silently
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setMenuOpen(true)} style={[styles.iconBtn, { borderColor: colors.ink4 }]}>
          <Text style={[styles.iconBtnText, { color: colors.grey2, fontSize: 14 }]}>⋯</Text>
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={StyleSheet.absoluteFillObject as any}>
          <Pressable
            style={[StyleSheet.absoluteFillObject as any, { backgroundColor: 'rgba(5,5,8,0.6)' }]}
            onPress={() => setMenuOpen(false)}
          />
          <View style={styles.menuCard}>
            <Pressable
              onPress={() => { setMenuOpen(false); setConfirmDelete(true); }}
              style={styles.menuRow}
            >
              <Text style={[styles.menuRowText, { color: colors.red }]}>Delete contact</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {confirmDelete ? (
        <View style={StyleSheet.absoluteFillObject as any}>
          <Pressable
            style={[StyleSheet.absoluteFillObject as any, { backgroundColor: 'rgba(5,5,8,0.75)' }]}
            onPress={() => !deleting && setConfirmDelete(false)}
          />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete {contact.name}?</Text>
            <Text style={styles.confirmBody}>
              You can undo this from your audit log within 30 days.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setConfirmDelete(false)}
                disabled={deleting}
                style={styles.confirmCancel}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                disabled={deleting}
                style={styles.confirmDelete}
              >
                <Text style={styles.confirmDeleteText}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.hero}>
          <Pressable
            onPress={async () => {
              const result = await pickAndUploadContactPhoto(contact.id);
              if (result.ok) {
                onLocalUpdate({ ...contact, photoUrl: result.publicUrl });
              }
            }}
            style={{ position: 'relative' }}
          >
            <Avatar name={contact.name} size={68} photoUrl={contact.photoUrl} />
            <View style={styles.photoBadge}>
              <Text style={styles.photoBadgeText}>{contact.photoUrl ? '↻' : '＋'}</Text>
            </View>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroName}>{contact.name}</Text>
            <View style={styles.heroPills}>
              <Pill color={tier.color}>{tier.icon} {tier.label}</Pill>
              {contact.planLabel ? <Pill color={colors.gold}>{contact.planLabel}</Pill> : null}
              <LanguageToggle
                value={contact.preferredLanguage}
                onChange={async (next) => {
                  onLocalUpdate({ ...contact, preferredLanguage: next });
                  try {
                    await updateContactPreferredLanguage(contact.id, next);
                  } catch (e) {
                    onLocalUpdate({ ...contact, preferredLanguage: contact.preferredLanguage });
                    console.warn('language toggle failed', e);
                  }
                }}
              />
            </View>
          </View>
        </View>

        <View style={styles.quickRow}>
          {[
            { label: 'Call',  icon: '📞', onPress: openCall },
            { label: 'Text',  icon: '💬', onPress: () => openText() },
            { label: 'Email', icon: '✉️', onPress: () => openEmail() },
            { label: 'Note',  icon: '📝', onPress: () => setEditingNotes(true) },
          ].map(a => (
            <Pressable key={a.label} onPress={a.onPress} style={styles.quickBtn}>
              <Text style={styles.quickIcon}>{a.icon}</Text>
              <Text style={styles.quickLabel}>{a.label.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.tagsRow}>
          {contact.tags.map(t => {
            const col = tagColor(t);
            return (
              <Pressable
                key={t}
                onPress={() => toggleTag(t)}
                style={[
                  styles.tagChip,
                  { backgroundColor: rgbaTint(col, 0.12), borderColor: rgbaTint(col, 0.35) },
                ]}
              >
                <View style={[styles.tagDot, { backgroundColor: col }]} />
                <Text style={[styles.tagText, { color: col }]}>{t}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setTagPickerOpen(true)} style={styles.tagAdd}>
            <Text style={styles.tagAddText}>＋ Add tag</Text>
          </Pressable>
        </View>

        <SectionHead label="VEHICLE INTEREST" />
        <View style={styles.card}>
          <Text style={styles.vehicleName}>{contact.vehicle ?? '—'}</Text>
          {contact.trim ? <Text style={styles.vehicleTrim}>{contact.trim}</Text> : null}
          <View style={styles.vehicleStats}>
            <View style={{ flex: 1 }}>
              <Label color={colors.grey2}>BUDGET</Label>
              <Text style={styles.statValue}>{contact.budget ? `$${contact.budget}` : '—'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Label color={colors.grey2}>TRADE-IN</Label>
              <Text style={styles.statValueSmall}>{contact.tradeIn ?? 'None'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.toggleWrap}>
          <View style={styles.toggle}>
            {(['latest', 'next'] as const).map(k => (
              <Pressable key={k} onPress={() => setStepView(k)} style={styles.toggleBtn}>
                <View
                  style={[
                    styles.togglePill,
                    stepView === k && {
                      backgroundColor: colors.surface2,
                      borderColor: colors.goldBorder,
                      borderWidth: 1,
                    },
                  ]}
                />
                <Text style={[
                  styles.toggleText,
                  { color: stepView === k ? colors.gold : colors.grey2 },
                ]}>
                  {k === 'latest' ? 'Latest Activity' : 'Next Step'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {stepView === 'latest' ? (
          <View style={styles.card}>
            {contact.milestones.length === 0 ? (
              <Text style={styles.empty}>No milestones logged yet.</Text>
            ) : (
              contact.milestones.map((m, i) => {
                const meta = MILESTONE_ICONS[m.kind] ?? { icon: '●', color: colors.gold };
                return (
                  <View
                    key={i}
                    style={[
                      styles.milestoneRow,
                      i < contact.milestones.length - 1 && styles.divider,
                    ]}
                  >
                    <View
                      style={[
                        styles.milestoneIcon,
                        {
                          backgroundColor: rgbaTint(meta.color, 0.14),
                          borderColor: rgbaTint(meta.color, 0.3),
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 13, color: meta.color }}>{meta.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.milestoneKind, { color: meta.color }]}>
                        {m.kind.replace('-', ' ').toUpperCase()}
                      </Text>
                      <Text style={styles.milestoneText}>{m.t}</Text>
                    </View>
                    <Text style={styles.milestoneDate}>{m.d}</Text>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={[styles.card, styles.nextCard]}>
            <View style={styles.nextHead}>
              <View style={styles.rexDot} />
              <Label color={colors.gold}>REX RECOMMENDS</Label>
            </View>
            <Text style={styles.nextBody}>
              {contact.nextStep ?? 'Add notes and tap Game Plan — Rex will write your next move.'}
            </Text>
          </View>
        )}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>NOTES</Text>
          <View style={{ flex: 1 }} />
          {editingNotes ? (
            <>
              <Pressable onPress={cancelNotes} hitSlop={6}>
                <Text style={styles.linkSecondary}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveNotes} hitSlop={6} disabled={savingNotes}>
                <Text style={styles.linkPrimary}>{savingNotes ? 'SAVING…' : 'SAVE'}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setEditingNotes(true)} hitSlop={6}>
              <Text style={styles.linkPrimary}>EDIT ›</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => !editingNotes && setEditingNotes(true)}
          style={[
            styles.card,
            editingNotes && { borderColor: colors.gold },
            { paddingVertical: 14 },
          ]}
        >
          {editingNotes ? (
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              autoFocus
              placeholder="What did you learn from the customer today?"
              placeholderTextColor={colors.grey}
              style={styles.notesInput}
            />
          ) : (
            <Text style={[styles.notesText, !notes && styles.notesPlaceholder]}>
              {notes || 'Tap to add notes about this customer…'}
            </Text>
          )}
        </Pressable>

        <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
          <Pressable
            onPress={runGamePlan}
            disabled={aiLoading}
            style={[styles.gamePlan, aiLoading && { opacity: 0.6 }]}
          >
            <Text style={styles.gamePlanText}>GAME PLAN</Text>
            <Text style={styles.gamePlanHint}>
              {aiLoading ? '· thinking…' : '· Rex picks the move'}
            </Text>
          </Pressable>
        </View>

        {aiOpen ? (
          <View style={styles.aiBox}>
            <View style={styles.aiHead}>
              <View style={styles.rexOrb} />
              <Text style={styles.aiHeadLabel}>
                REX SAYS · {aiLoading ? 'THINKING' : aiChannel.toUpperCase()}
              </Text>
              <View style={{ flex: 1 }} />
              {!aiLoading ? (
                <Pressable onPress={runGamePlan} hitSlop={6}>
                  <Text style={styles.linkPrimary}>↻ REGENERATE</Text>
                </Pressable>
              ) : null}
            </View>

            {aiError ? (
              <View style={styles.aiBody}>
                <Text style={styles.aiError}>Couldn't reach Rex: {aiError}</Text>
              </View>
            ) : aiLoading ? (
              <View style={[styles.aiBody, { paddingVertical: 24 }]}>
                <Text style={styles.aiLoadingText}>Reading your notes…</Text>
              </View>
            ) : (
              <>
                {aiWhy ? (
                  <View style={styles.aiWhy}>
                    <Text style={styles.aiWhyText}>“{aiWhy}”</Text>
                  </View>
                ) : null}
                <View style={styles.aiBody}>
                  <TextInput
                    value={aiScript}
                    onChangeText={setAiScript}
                    multiline
                    style={styles.aiScript}
                  />
                </View>
                <View style={styles.aiActions}>
                  <Pressable onPress={copyScript} style={[styles.aiAction, copied && styles.aiActionDone]}>
                    <Text style={[styles.aiActionText, copied && { color: colors.white }]}>
                      {copied ? '✓ COPIED' : '⧉ COPY'}
                    </Text>
                  </Pressable>
                  {aiChannel === 'call' ? (
                    <Pressable onPress={openCall} style={[styles.aiAction, styles.aiActionPrimary]}>
                      <Text style={styles.aiActionPrimaryText}>📞 CALL</Text>
                    </Pressable>
                  ) : aiChannel === 'text' ? (
                    <Pressable onPress={() => openText(aiScript)} style={[styles.aiAction, styles.aiActionPrimary]}>
                      <Text style={styles.aiActionPrimaryText}>💬 TEXT</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => openEmail(aiScript)} style={[styles.aiAction, styles.aiActionPrimary]}>
                      <Text style={styles.aiActionPrimaryText}>✉ EMAIL</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </View>
        ) : null}

        {unmarkedNurtures.length > 0 ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>NURTURE · AWAITING REPLY</Text>
              <View style={styles.dealCount}>
                <Text style={styles.dealCountText}>{unmarkedNurtures.length}</Text>
              </View>
              <View style={{ flex: 1 }} />
            </View>
            {unmarkedNurtures.map(n => (
              <View key={n.id} style={[styles.card, { gap: 8 }]}>
                <Text style={styles.milestoneKind}>
                  {n.trigger_type.replace('_', ' ').toUpperCase()} · sent {n.sent_at?.slice(0, 10)}
                </Text>
                <Text style={styles.notesText} numberOfLines={3}>{n.message_text}</Text>
                <MarkReplyButton
                  nurtureMessageId={n.id}
                  contactId={contact.id}
                  onMarked={() => {
                    setNurtureRefetchKey(k => k + 1);
                    // Heat/decision changes — let the list know via a stale refetch.
                    onLocalUpdate({ ...contact });
                  }}
                />
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>DEAL LOG</Text>
          {deals.length > 0 ? (
            <View style={styles.dealCount}>
              <Text style={styles.dealCountText}>{deals.length}</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable onPress={onLogDeal} hitSlop={6}>
            <Text style={styles.linkPrimary}>＋ LOG DEAL</Text>
          </Pressable>
        </View>

        {deals.length === 0 ? (
          <Pressable onPress={onLogDeal} style={styles.dealEmpty}>
            <Text style={styles.dealEmptyTitle}>No deals yet — close them and log it here</Text>
            <Text style={styles.dealEmptyHint}>Flows straight into your Metrics</Text>
          </Pressable>
        ) : (
          <>
            <View style={[styles.card, styles.lifetimeCard]}>
              <View style={{ flex: 1 }}>
                <Label color={colors.gold}>LIFETIME COMMISSION</Label>
                <Text style={styles.lifetimeSubtitle}>
                  {deals.length} delivery{deals.length === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={styles.lifetimeValue}>
                ${totalCommission.toLocaleString()}
              </Text>
            </View>
            <View style={styles.card}>
              {deals.map((d, i) => <DealRow key={d.id} d={d} last={i === deals.length - 1} />)}
            </View>
          </>
        )}
      </ScrollView>

      {tagPickerOpen ? (
        <TagPicker
          contactTags={contact.tags}
          allTags={allTags}
          contactName={contact.name}
          onClose={() => setTagPickerOpen(false)}
          onToggle={toggleTag}
        />
      ) : null}
    </View>
  );
}

function DealRow({ d, last }: { d: V2Deal; last: boolean }) {
  const dt = d.closedAt ? new Date(d.closedAt + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fundingColor =
    d.funding === 'lease' ? colors.green :
    d.funding === 'cash' ? colors.grey2 :
    colors.gold;
  return (
    <View style={[styles.dealRow, !last && styles.divider]}>
      <View style={styles.dealStripe} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.dealHead}>
          {d.stock ? (
            <View style={styles.stockTag}>
              <Text style={styles.stockText}>{d.stock}</Text>
            </View>
          ) : null}
          <Text style={styles.dealDate}>{dt}</Text>
        </View>
        <Text style={styles.dealVehicle} numberOfLines={1}>{d.vehicle ?? '—'}</Text>
        <View style={styles.dealPills}>
          {d.dealType ? <Pill color={d.dealType === 'CPO' ? colors.grey2 : colors.gold}>{d.dealType}</Pill> : null}
          {d.funding ? <Pill color={fundingColor}>{d.funding.toUpperCase()}</Pill> : null}
          {d.split ? <Pill color={colors.orange}>½ SPLIT{d.splitWith ? ` · ${d.splitWith.split(' ')[0]}` : ''}</Pill> : null}
        </View>
      </View>
      <Text style={styles.dealAmount}>${d.amount.toLocaleString()}</Text>
    </View>
  );
}

function TagPicker({
  contactTags, allTags, contactName, onClose, onToggle,
}: {
  contactTags: string[];
  allTags: Array<{ name: string; color: string }>;
  contactName: string;
  onClose: () => void;
  onToggle: (name: string) => void;
}) {
  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHead}>
          <Label color={colors.gold}>TAGS FOR {contactName.toUpperCase()}</Label>
          <Text style={styles.sheetSub}>Tap to toggle a tag on or off.</Text>
        </View>
        <ScrollView contentContainerStyle={styles.sheetTags}>
          {allTags.map(t => {
            const active = contactTags.includes(t.name);
            return (
              <Pressable
                key={t.name}
                onPress={() => onToggle(t.name)}
                style={[
                  styles.sheetTag,
                  active
                    ? { backgroundColor: rgbaTint(t.color, 0.18), borderColor: t.color }
                    : { backgroundColor: colors.surface2, borderColor: colors.ink4 },
                ]}
              >
                <Text style={[
                  styles.sheetTagText,
                  { color: active ? t.color : colors.grey3 },
                ]}>
                  {active ? '✓ ' : ''}{t.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.ink,
    zIndex: 80,
  } as any,

  topBar: {
    paddingTop: Platform.OS === 'web' ? 16 : 52,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
    backgroundColor: colors.ink2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { color: colors.gold, fontSize: 18, fontWeight: '700' },

  photoBadge: {
    position: 'absolute',
    bottom: -2, right: -2,
    width: 24, height: 24,
    borderRadius: 12,
    backgroundColor: colors.gold,
    borderWidth: 2, borderColor: colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  photoBadgeText: { color: colors.ink, fontWeight: '800', fontSize: 12, lineHeight: 14 },

  menuCard: {
    position: 'absolute',
    top: 60,
    right: 14,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    minWidth: 180,
    overflow: 'hidden',
  } as any,
  menuRow: { paddingHorizontal: 14, paddingVertical: 12 },
  menuRowText: { fontSize: 14, fontWeight: '600' },

  confirmCard: {
    position: 'absolute',
    left: 24, right: 24, top: '30%',
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: radius.lg,
    padding: 20,
  } as any,
  confirmTitle: { fontSize: 16, fontWeight: '700', color: colors.white, letterSpacing: -0.2 },
  confirmBody: { fontSize: 13, color: colors.grey2, marginTop: 8, lineHeight: 18 },
  confirmActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  confirmCancel: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center',
  },
  confirmCancelText: { fontSize: 13, fontWeight: '700', color: colors.grey2 },
  confirmDelete: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: colors.red,
    alignItems: 'center',
  },
  confirmDeleteText: { fontSize: 13, fontWeight: '700', color: colors.white },

  hero: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroName: { fontSize: 22, fontWeight: '700', color: colors.white, letterSpacing: -0.5 },
  heroPills: { flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' },

  quickRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  quickBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.md,
  },
  quickIcon: { fontSize: 18, marginBottom: 4 },
  quickLabel: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.0 },

  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  tagDot: { width: 5, height: 5, borderRadius: 3 },
  tagText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  tagAdd: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderStyle: 'dashed',
  },
  tagAddText: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.3 },

  card: {
    marginHorizontal: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
  },
  vehicleName: { fontSize: 17, fontWeight: '700', color: colors.white, letterSpacing: -0.3 },
  vehicleTrim: { fontSize: 12, color: colors.grey2, marginTop: 4 },
  vehicleStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.ink4,
  },
  statValue: { fontSize: 16, fontWeight: '700', color: colors.white, marginTop: 4 },
  statValueSmall: { fontSize: 14, fontWeight: '600', color: colors.white, marginTop: 4 },

  toggleWrap: { paddingHorizontal: 14, paddingTop: 20, paddingBottom: 8 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    padding: 3,
  },
  toggleBtn: { flex: 1, position: 'relative' },
  togglePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  } as any,
  toggleText: {
    paddingVertical: 9,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  empty: { color: colors.grey2, fontSize: 13, textAlign: 'center' },

  milestoneRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  milestoneIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  milestoneKind: { fontSize: 9, fontWeight: '700', letterSpacing: 1.0, marginBottom: 3 },
  milestoneText: { fontSize: 13, color: colors.grey3, lineHeight: 18 },
  milestoneDate: { fontSize: 11, fontWeight: '600', color: colors.grey },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.ink4 },

  nextCard: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rexDot: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gold,
  },
  nextBody: { fontSize: 14, color: colors.white, lineHeight: 21, marginTop: 10 },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.gold,
    letterSpacing: 1.2,
  },
  linkPrimary: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.5 },
  linkSecondary: { fontSize: 11, fontWeight: '600', color: colors.grey2, paddingHorizontal: 8 },

  notesInput: {
    minHeight: 120,
    color: colors.white,
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: 'top',
  } as any,
  notesText: { fontSize: 13, color: colors.grey3, lineHeight: 20 },
  notesPlaceholder: { color: colors.grey, fontStyle: 'italic' },

  gamePlan: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  gamePlanText: { fontSize: 14, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 },
  gamePlanHint: { fontSize: 10, fontWeight: '700', color: colors.ink, opacity: 0.6, letterSpacing: 0.3 },

  aiBox: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  aiHead: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.goldBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rexOrb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gold },
  aiHeadLabel: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.2 },

  aiWhy: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  aiWhyText: { fontSize: 12, color: colors.gold, fontStyle: 'italic', lineHeight: 17 },

  aiBody: { paddingHorizontal: 14, paddingVertical: 12 },
  aiScript: {
    minHeight: 110,
    color: colors.white,
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: 'top',
  } as any,
  aiError: { color: colors.red, fontSize: 13 },
  aiLoadingText: { color: colors.gold, fontSize: 12, letterSpacing: 0.3 },

  aiActions: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.ink4,
    backgroundColor: colors.ink2,
  },
  aiAction: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
  },
  aiActionText: { fontSize: 12, fontWeight: '700', color: colors.gold, letterSpacing: 0.3 },
  aiActionDone: { backgroundColor: colors.green, borderColor: colors.green },
  aiActionPrimary: { backgroundColor: colors.gold, borderColor: colors.gold },
  aiActionPrimaryText: { fontSize: 12, fontWeight: '700', color: colors.ink, letterSpacing: 0.3 },

  dealCount: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldBg,
  },
  dealCountText: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 0.5 },

  dealEmpty: {
    marginHorizontal: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  dealEmptyTitle: { fontSize: 13, fontWeight: '600', color: colors.gold },
  dealEmptyHint: { fontSize: 11, color: colors.grey2, marginTop: 4 },

  lifetimeCard: {
    backgroundColor: colors.goldBg,
    borderColor: colors.goldBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  lifetimeSubtitle: { fontSize: 11, color: colors.grey2, marginTop: 3 },
  lifetimeValue: { fontSize: 22, fontWeight: '800', color: colors.gold2, letterSpacing: -0.6 },

  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  dealStripe: { width: 4, alignSelf: 'stretch', backgroundColor: colors.gold, borderRadius: 2 },
  dealHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  stockTag: {
    backgroundColor: colors.goldBg,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stockText: { fontFamily: 'Menlo', fontSize: 10, color: colors.gold, fontWeight: '700', letterSpacing: 0.3 },
  dealDate: { fontSize: 10, color: colors.grey, fontWeight: '600', letterSpacing: 0.3 },
  dealVehicle: { fontSize: 13, fontWeight: '600', color: colors.white, marginTop: 3 },
  dealPills: { flexDirection: 'row', gap: 4, marginTop: 5 },
  dealAmount: { fontSize: 18, fontWeight: '800', color: colors.green, letterSpacing: -0.4 },

  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.75)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
  } as any,
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink4,
    marginTop: 10,
    marginBottom: 8,
  },
  sheetHead: { paddingHorizontal: 18, paddingBottom: 14 },
  sheetSub: { fontSize: 11, color: colors.grey2, marginTop: 4 },
  sheetTags: { paddingHorizontal: 14, gap: 6, flexDirection: 'row', flexWrap: 'wrap' },
  sheetTag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  sheetTagText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
});
