import { defineConfig } from "@solidjs/start/config";

// Load environment variables
const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  DEV: process.env.NODE_ENV !== 'production',
  PROD: process.env.NODE_ENV === 'production'
};

export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
  vite: {
    define: {
      'import.meta.env.NODE_ENV': JSON.stringify(env.NODE_ENV),
      'import.meta.env.DEV': env.DEV,
      'import.meta.env.PROD': env.PROD
    },
    resolve: {
      alias: {
        '~': '/src',
        './db': './src/lib/server/db',
        'sqlite3': 'unenv/runtime/node/empty',
        'fs': 'unenv/runtime/node/empty',
        'path': 'unenv/runtime/node/empty',
        'util': 'unenv/runtime/node/empty',
        'stream': 'unenv/runtime/node/empty',
        'crypto': 'unenv/runtime/node/empty'
      }
    },
    optimizeDeps: {
      include: ['solid-js', '@solidjs/start/server'],
      exclude: ['fs', 'path', 'sqlite3', 'stream', 'crypto']
    },
    build: {
      rollupOptions: {
        external: ['fs', 'path', 'sqlite3', 'stream', 'crypto'],
        onwarn(warning: any, warn: any) {
          if (warning.code === 'SOURCEMAP_ERROR' && warning.id?.includes('node_modules/sqlite')) {
            return;
          }
          if (warning.code === 'UNRESOLVED_IMPORT' && 
              ['fs', 'path', 'sqlite3', 'stream', 'crypto'].some(mod => warning.message.includes(`'${mod}'`))) {
            return;
          }
          warn(warning);
        }
      }
    }
  }
});
