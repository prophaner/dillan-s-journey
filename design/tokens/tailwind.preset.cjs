/**
 * Dillan — Tailwind preset v2.0 (web-first)
 * Same values as tokens.json / tokens.css. Optional: use only if the app uses Tailwind.
 *
 *   // tailwind.config.js
 *   module.exports = { presets: [require('./tokens/tailwind.preset.cjs')], content: [...] }
 *
 * Colors point at CSS variables so light / Night Gym switch via tokens.css ([data-theme="dark"]
 * or prefers-color-scheme) without duplicating palettes here.
 */
module.exports = {
  theme: {
    screens: { sm: '360px', md: '768px', lg: '1024px', xl: '1280px' },
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
        line: 'var(--line)',
        text: { DEFAULT: 'var(--text)', 2: 'var(--text-2)', 3: 'var(--text-3)' },
        spot: { DEFAULT: 'var(--spot)', press: 'var(--spot-press)', ink: 'var(--spot-ink)', tint: 'var(--spot-tint)' },
        steady: { DEFAULT: 'var(--steady)', tint: 'var(--steady-tint)' },
        hold: { DEFAULT: 'var(--hold)', tint: 'var(--hold-tint)' },
        unknown: 'var(--unknown)',
        iron: '#1A1A18',
        chalk: '#F6F3EC',
      },
      fontFamily: {
        ui: ['Satoshi', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        voice: ['Newsreader', 'Iowan Old Style', 'Georgia', 'serif'],
        num: ['"M PLUS Rounded 1c"', 'Satoshi', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'voice-xl': ['1.9375rem', { lineHeight: '2.25rem' }],          // 31/36 Dillan's daily sentence
        'voice-desktop': ['2.75rem', { lineHeight: '3rem' }],          // 44/48 at lg+
        voice: ['1.1875rem', { lineHeight: '1.625rem' }],              // 19/26
        'voice-s': ['1.0625rem', { lineHeight: '1.5rem' }],            // 17/24
        'title-1': ['1.75rem', { lineHeight: '2rem', fontWeight: '700' }],
        'title-2': ['1.375rem', { lineHeight: '1.75rem', fontWeight: '700' }],
        'title-3': ['1.25rem', { lineHeight: '1.625rem', fontWeight: '700' }],
        headline: ['1.0625rem', { lineHeight: '1.5rem', fontWeight: '700' }],
        body: ['1.0625rem', { lineHeight: '1.5rem' }],
        callout: ['1rem', { lineHeight: '1.5rem' }],                   // minimum for inputs
        subhead: ['0.9375rem', { lineHeight: '1.375rem' }],
        footnote: ['0.8125rem', { lineHeight: '1.125rem' }],
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        'num-xl': ['5.5rem', { lineHeight: '1', fontWeight: '700' }],  // 88 rest timer
        'num-l': ['4rem', { lineHeight: '1', fontWeight: '700' }],     // 64 set card
        'num-m': ['2.75rem', { lineHeight: '1', fontWeight: '700' }],  // 44 progress
        'num-input': ['1.625rem', { lineHeight: '1', fontWeight: '700' }],
      },
      borderRadius: { chip: '999px', button: '18px', card: '24px', sheet: '34px', field: '14px', banner: '14px' },
      spacing: {
        'screen-x': '20px',
        'nav-h': '64px',
        'sticky-h': '61px',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-t': 'env(safe-area-inset-top)',
        sidebar: '240px',
      },
      height: { tap: '44px', primary: '58px', logset: '64px', stepper: '56px', chip: '36px' },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
      maxWidth: { content: '1120px', session: '640px', dialog: '480px' },
      transitionTimingFunction: {
        settle: 'cubic-bezier(.2,.9,.25,1)',
        'spot-drop': 'cubic-bezier(.34,1.3,.5,1)',
      },
      transitionDuration: { quick: '160ms', settle: '280ms', drop: '380ms', calm: '520ms', route: '180ms' },
      boxShadow: { sheet: '0 -12px 40px rgba(26,26,24,.18)', toast: '0 8px 24px rgba(26,26,24,.22)' },
    },
  },
  plugins: [
    function ({ addBase, addUtilities }) {
      addBase({
        html: { fontFamily: 'Satoshi, system-ui, sans-serif', WebkitTextSizeAdjust: '100%' },
        button: { touchAction: 'manipulation' },
        ':focus-visible': { outline: '2px solid var(--text)', outlineOffset: '2px' },
      });
      addUtilities({
        '.tabular': { fontVariantNumeric: 'tabular-nums' },
        '.dvh-screen': { minHeight: '100dvh' },
      });
    },
  ],
};
