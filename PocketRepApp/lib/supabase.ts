import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createChunkedSecureStorage } from './v2/chunkedSecureStorage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Web uses localStorage (guarded for SSR); native keeps the encrypted
// SecureStore session in small chunks because platform keychains can reject a
// complete Supabase session as one large value.
const hasLocalStorage = typeof localStorage !== 'undefined';
const nativeStorage = createChunkedSecureStorage(SecureStore);
const storage = Platform.OS === 'web'
  ? {
      getItem: (key: string) => Promise.resolve(hasLocalStorage ? localStorage.getItem(key) : null),
      setItem: (key: string, value: string) => { if (hasLocalStorage) localStorage.setItem(key, value); return Promise.resolve(); },
      removeItem: (key: string) => { if (hasLocalStorage) localStorage.removeItem(key); return Promise.resolve(); },
    }
  : nativeStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: storage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
