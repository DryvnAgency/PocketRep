// PocketRep Owner Control Center
// Main shell: header, sidebar/tab navigation, content routing.
// Replaces the basic AdminDashboard with a full SaaS command center.

import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { ADMIN_TABS, type AdminTabId } from '@/lib/v2/admin/adminTypes';

// Tab components
import OverviewTab from './OverviewTab';
import CustomersTab from './CustomersTab';
import RevenueTab from './RevenueTab';
import ReferralsTab from './ReferralsTab';
import AiUsageTab from './AiUsageTab';
import ProductUsageTab from './ProductUsageTab';
import OutreachTab from './OutreachTab';
import SupportTab from './SupportTab';
import SystemHealthTab from './SystemHealthTab';
import AdminSettings from './AdminSettings';

const DESKTOP_BREAKPOINT = 768;

function TabContent({ tab, onSignOut }: { tab: AdminTabId; onSignOut: () => void }) {
  switch (tab) {
    case 'overview':  return <OverviewTab />;
    case 'customers': return <CustomersTab />;
    case 'revenue':   return <RevenueTab />;
    case 'referrals': return <ReferralsTab />;
    case 'ai':        return <AiUsageTab />;
    case 'product':   return <ProductUsageTab />;
    case 'outreach':  return <OutreachTab />;
    case 'support':   return <SupportTab onSignOut={onSignOut} />;
    case 'health':    return <SystemHealthTab />;
    case 'settings':  return <AdminSettings onSignOut={onSignOut} />;
    default:          return null;
  }
}

export default function OwnerControlCenter({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<AdminTabId>('overview');
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>POCKETREP</Text>
        <Text style={s.headerSub}>CONTROL CENTER</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onSignOut} style={s.signOutBtn}>
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {isDesktop ? (
        /* Desktop: sidebar + content */
        <View style={s.desktopBody}>
          <View style={s.sidebar}>
            {ADMIN_TABS.map(t => (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={[s.sidebarItem, tab === t.id && s.sidebarItemActive]}
              >
                <Text style={s.sidebarIcon}>{t.icon}</Text>
                <Text style={[s.sidebarLabel, tab === t.id && s.sidebarLabelActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView style={s.contentScroll} contentContainerStyle={s.contentContainer}>
            <TabContent tab={tab} onSignOut={onSignOut} />
          </ScrollView>
        </View>
      ) : (
        /* Mobile: horizontal tab bar + content */
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.tabBar}
            contentContainerStyle={s.tabBarContent}
          >
            {ADMIN_TABS.map(t => (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={[s.tab, tab === t.id && s.tabActive]}
              >
                <Text style={s.tabIcon}>{t.icon}</Text>
                <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView style={s.contentScroll} contentContainerStyle={s.contentContainer}>
            <TabContent tab={tab} onSignOut={onSignOut} />
          </ScrollView>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 52,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  logo: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  headerSub: {
    color: colors.grey,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.ink4,
  },
  signOutText: {
    color: colors.grey2,
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Desktop sidebar ─────────────────────────────────────────────────────
  desktopBody: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 200,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: colors.ink4,
    backgroundColor: colors.surface,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  sidebarItemActive: {
    backgroundColor: colors.goldBg,
  },
  sidebarIcon: { fontSize: 14 },
  sidebarLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.grey2,
  },
  sidebarLabelActive: {
    color: colors.gold,
    fontWeight: '700',
  },

  // ── Mobile tab bar ──────────────────────────────────────────────────────
  tabBar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
    flexGrow: 0,
  },
  tabBarContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.gold,
  },
  tabIcon: { fontSize: 13 },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.grey2,
  },
  tabLabelActive: {
    color: colors.gold,
  },

  // ── Content ─────────────────────────────────────────────────────────────
  contentScroll: { flex: 1 },
  contentContainer: { paddingBottom: 40 },
});
