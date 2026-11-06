import { defineConfig } from 'vite';

export default defineConfig({
  base: '',
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    rolldownOptions: {
      output: {
        // Phaser and React change far less often than the game, so they get files of their own
        // that browsers can keep cached across updates.
        codeSplitting: {
          groups: [
            { name: 'phaser', test: /node_modules[\\/]phaser[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
    // Phaser alone is over a megabyte minified; that's expected.
    chunkSizeWarningLimit: 1500,
  },
});
