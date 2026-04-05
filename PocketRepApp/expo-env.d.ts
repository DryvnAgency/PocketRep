/// <reference types="node" />

// Augment process.env with PocketRep's EXPO_PUBLIC_* variables
// so TypeScript resolves them in strict mode.
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly EXPO_PUBLIC_SUPABASE_URL: string;
      readonly EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
      readonly EXPO_PUBLIC_ANTHROPIC_KEY: string;
      readonly EXPO_PUBLIC_OPENAI_KEY: string;
      readonly EXPO_PUBLIC_AI_PROXY_URL: string;
      readonly EXPO_PUBLIC_PICOVOICE_KEY: string;
    }
  }
}

export {};
