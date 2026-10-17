import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    // Rust builds produce many files; none should trigger frontend watching.
    watch: { ignored: ['**/target/**', '**/src-tauri/**', '**/crates/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
