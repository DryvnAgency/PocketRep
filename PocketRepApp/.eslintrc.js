// Minimum lint floor for CI. `tsc --noEmit` is the type gate; ESLint here catches
// correctness smells (unused vars, bad hooks usage, undefined refs). The existing
// codebase predates linting, so noisy stylistic/legacy rules are downgraded to
// warnings to keep the gate green — tighten over time.
module.exports = {
  root: true,
  extends: 'expo',
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '.expo/',
    'web-build/',
    'babel.config.js',
    'metro.config.js',
    '*.config.js',
    // Not part of the app bundle / not type-checked: Deno edge functions, the
    // Expo Snack playground export, and Node tooling scripts.
    'supabase/functions/',
    'snack-*.js',
    'scripts/',
  ],
  rules: {
    // TypeScript (tsc --noEmit, the type gate) already resolves identifiers, so
    // ESLint's no-undef is redundant and produces false positives on TS globals.
    'no-undef': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'react/no-unescaped-entities': 'off',
    'react/display-name': 'off',
    'import/no-unresolved': 'off',
    'import/namespace': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
  },
};
