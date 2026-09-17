/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        agent: {
          bg: '#121316',
          panel: '#1a1b1f',
          border: '#2a2b30',
          hover: '#32343b',
          accent: '#3b82f6',
          text: '#f3f4f6',
          muted: '#9ca3af'
        }
      }
    }
  },
  plugins: []
}
