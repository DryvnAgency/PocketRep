import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';

export default function RexDisclosure({
  open, onEnable, onDecline,
}: {
  open: boolean;
  onEnable: () => void;
  onDecline: () => void;
}) {
  if (!open) return null;
  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <View style={styles.scrim} />
      <View style={styles.card}>
        <View style={styles.orb} />
        <Label color={colors.gold}>HEY REX · ALWAYS LISTENING</Label>
        <Text style={styles.title}>Want Rex to listen while the app is open?</Text>
        <Text style={styles.body}>
          When enabled, Rex listens for the wake phrase “Hey Rex” and can add contacts,
          log deals, set follow-ups, and update notes from your voice.
        </Text>
        <Text style={styles.bullet}>· Audio is processed only after you say “Hey Rex”.</Text>
        <Text style={styles.bullet}>· Nothing is saved until you confirm.</Text>
        <Text style={styles.bullet}>· Toggle this off any time in the You tab.</Text>
        <View style={styles.actions}>
          <Pressable onPress={onDecline} style={styles.declineBtn}>
            <Text style={styles.declineText}>Not now</Text>
          </Pressable>
          <Pressable onPress={onEnable} style={styles.enableBtn}>
            <Text style={styles.enableText}>Enable Hey Rex</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.85)' } as any,
  card: {
    position: 'absolute',
    left: 24, right: 24, top: '20%',
    backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.xl,
    padding: 22,
  } as any,
  orb: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.gold,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.white, marginTop: 8, letterSpacing: -0.3 },
  body: { fontSize: 13, color: colors.grey3, marginTop: 8, lineHeight: 19 },
  bullet: { fontSize: 12, color: colors.grey2, marginTop: 6, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  declineBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  declineText: { fontSize: 13, fontWeight: '700', color: colors.grey2 },
  enableBtn: {
    flex: 1.2,
    paddingVertical: 12,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  enableText: { fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 },
});
