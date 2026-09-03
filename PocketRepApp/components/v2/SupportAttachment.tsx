import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { getSupportAttachmentUrl } from '@/lib/v2/supportChat';

export default function SupportAttachment({
  path,
  name,
}: {
  path: string;
  name?: string | null;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    getSupportAttachmentUrl(path)
      .then(setUrl)
      .catch(() => setError(true));
  };

  useEffect(() => { load(); }, [path]);

  if (error) {
    return (
      <Pressable onPress={load} style={s.fallback}>
        <Text style={s.fallbackTitle}>Could not load image</Text>
        <Text style={s.fallbackText}>Tap to retry</Text>
      </Pressable>
    );
  }

  if (!url) {
    return <View style={s.loading}><ActivityIndicator color={colors.gold} /></View>;
  }

  return (
    <View style={s.wrap} accessibilityLabel={name || 'Support image attachment'}>
      <Image source={{ uri: url }} style={s.image} resizeMode="cover" />
      {name ? <Text style={s.name} numberOfLines={1}>{name}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 7, maxWidth: 280 },
  image: {
    width: 240,
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.ink3,
    borderWidth: 1,
    borderColor: colors.ink4,
  },
  name: { color: colors.grey2, fontSize: 9, marginTop: 4 },
  loading: {
    width: 240,
    height: 120,
    marginTop: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.ink3,
  },
  fallback: {
    width: 240,
    marginTop: 7,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.ink3,
    borderWidth: 1,
    borderColor: colors.ink4,
  },
  fallbackTitle: { color: colors.white, fontSize: 11, fontWeight: '700' },
  fallbackText: { color: colors.grey2, fontSize: 10, marginTop: 2 },
});
