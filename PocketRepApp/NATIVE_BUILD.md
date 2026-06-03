# Native build (EAS) — checklist

The repo side of native is essentially ready. What's left is **gated on the Expo
account / store credentials** and must be run from a machine with the Expo CLI
(it can't be done from the build sandbox). Run everything below from
`PocketRepApp/`.

## Already done in-repo (no action)
- **`app.json`** — bundle IDs (`pro.pocketrep.app`), iOS `infoPlist` usage strings
  (mic, speech, contacts, location), Android permissions, and per-plugin permission
  copy (`expo-av`, `expo-image-picker`, `expo-location`, `expo-notifications`).
- **`eas.json`** — `development` / `preview` / `production` build profiles and a
  `submit.production` scaffold. `production` has `autoIncrement`.

## Owner steps to ship

1. **Link the project (writes `extra.eas.projectId`, currently missing):**
   ```
   eas login
   eas init
   ```

2. **Set the build-time env — IMPORTANT.** Every profile's `env` block in
   `eas.json` is currently `""`. An empty string is a *real value* at build time
   and will **override** any EAS secret, so the app would ship with an empty
   Supabase URL. Either fill the values in `eas.json`, **or** delete the empty
   keys and use project secrets:
   ```
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL       --value https://fwvrauqdoevwmwwqlfav.supabase.co
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY  --value <supabase anon key>
   # only if Hey Rex native voice is wired (see risks): EXPO_PUBLIC_VOICE_PROVIDER_KEY
   ```
   The Supabase URL + anon key are client-safe (public) values.

3. *(optional)* **Dev client** — the `development` profile sets
   `developmentClient: true`, which needs the package:
   ```
   npx expo install expo-dev-client
   ```

4. **Build:**
   ```
   eas build --profile preview    --platform ios      # internal / TestFlight-able
   eas build --profile preview    --platform android  # internal APK
   eas build --profile production  --platform all      # store builds
   ```

5. **Submit** — fill the placeholder creds in `eas.json` (`appleId`, `ascAppId`,
   `appleTeamId`; drop `google-service-account.json` at the configured path), then:
   ```
   eas submit --profile production --platform ios
   eas submit --profile production --platform android
   ```

6. **Store listing** — icon/splash exist; add App Store / Play metadata + screenshots.

## Known native-only risks to test (NOT fixed here)
- **SecureStore 2 KB limit.** `lib/supabase.ts` persists the auth session in
  `expo-secure-store` on native. A Supabase session (access + refresh JWT) can
  exceed SecureStore's ~2 KB per-key limit, which logs a warning and can drop the
  session. Verify login *persists across an app restart* on a real device; if not,
  chunk the stored value or swap the storage adapter.
- **Native voice.** "Hey Rex" voice uses the Web Speech API (web only). On a native
  build the voice flow is a no-op until a native STT/TTS path is added — the rest of
  Rex (text) works.
- **Web `Alert.alert` note (web only, FYI).** Several v1 screens confirm via
  `Alert.alert`, which is a no-op on web; native shows the dialog normally. (The
  contact-delete instance was fixed in PR #56.)

## Verify after the first build
- App boots, **auth persists across a cold restart** (SecureStore check above).
- Rex (Game Plan / Coach text) returns drafts; push notifications register.
- Contacts / deals / sequences load against the production Supabase project.
