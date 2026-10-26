// Pixel-based scale: the panel lives inside arbitrary web pages whose root
// font-size we don't control, so rem units are avoided entirely.
const spacing = {};
for (let i = 0; i <= 140; i++) spacing[i / 2] = `${i * 2}px`;
spacing.px = '1px';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    spacing,
    fontSize: {
      xs: ['11px', '14px'],
      sm: ['13px', '18px'],
      base: ['14px', '20px'],
      lg: ['16px', '22px'],
    },
    borderRadius: {
      none: '0',
      sm: '4px',
      DEFAULT: '6px',
      md: '8px',
      lg: '10px',
      xl: '12px',
      '2xl': '16px',
      full: '9999px',
    },
    extend: {
      colors: {
        bg: '#111113',
        fg: '#F5F5F7',
        muted: '#8E8E93',
        hover: '#242427',
        line: 'rgba(255,255,255,0.08)',
        elevated: '#1C1C1F',
      },
    },
  },
  plugins: [],
};
