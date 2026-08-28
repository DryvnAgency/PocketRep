// Canonical marketing/landing entry point. The app routes acquisition (new
// signup), re-subscription (expired/canceled), and invalid/deleted-account
// recovery here — pocketrep.pro owns those funnels. Single source of truth for
// the marketing URL (previously a duplicated '/upgrade' literal).
import { Linking } from 'react-native';

export const MARKETING_URL = 'https://pocketrep.pro';

export function openMarketing(): void {
  Linking.openURL(MARKETING_URL).catch(() => undefined);
}
