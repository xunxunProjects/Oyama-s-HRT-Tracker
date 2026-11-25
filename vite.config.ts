import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolveApiOrigin } from './e2e/apiOrigin';

export default defineConfig(() => {
    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
            proxy: {
                '/api': {
                    target: resolveApiOrigin(),
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
        build: {
            rollupOptions: {
                output: {
                    // The PWA precache matches the entry as assets/index-*.js.
                    // A lazy chunk whose module is named `index` would land in
                    // the same namespace and be installed eagerly. Prefix only
                    // those ambiguous chunks.
                    chunkFileNames: chunkInfo =>
                        /^index(?:-|$)/.test(chunkInfo.name)
                            ? 'assets/chunk-[name]-[hash].js'
                            : 'assets/[name]-[hash].js',
                },
            },
        },
        plugins: [
            react(),
            VitePWA({
                // A new build waits until the user taps refresh in the update
                // prompt (src/utils/swUpdate.ts registers the worker itself).
                registerType: 'prompt',
                injectRegister: false,
                includeAssets: ['favicon.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
                manifest: {
                    name: 'HRT Tracker',
                    short_name: 'HRT Tracker',
                    description: 'Log HRT doses and estimate hormone levels',
                    theme_color: '#FFFFFF',
                    background_color: '#FFFFFF',
                    display: 'standalone',
                    orientation: 'portrait',
                    icons: [
                        {
                            src: 'pwa-192x192.png',
                            sizes: '192x192',
                            type: 'image/png',
                            purpose: 'any maskable',
                        },
                        {
                            src: 'pwa-512x512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any maskable',
                        },
                    ],
                },
                workbox: {
                    // Tor and other low-bandwidth clients should not download
                    // every route chunk during installation. Precache only the
                    // shell; lazy chunks and their CSS are cached after the
                    // user opens that page for the first time.
                    globPatterns: ['*.{html,svg,ico}', 'assets/index-*.js', 'assets/index-*.css'],
                    // The PNG icons and the web manifest come from
                    // includeAssets/VitePWA; matching them here too would list
                    // each one twice in sw.js.
                    // The entry is currently about 1.3 MiB raw. Keep the limit
                    // close to that so a new eager import cannot quietly turn
                    // the install precache back into a full bundle download.
                    maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
                    cleanupOutdatedCaches: true,
                    // Shared pages require the network API and should always load the
                    // current application shell instead of an older precached shell.
                    navigateFallbackDenylist: [/^\/share(?:\/|$)/, /^\/api(?:\/|$)/],
                    runtimeCaching: [
                        {
                            // Never cache API responses: they can contain
                            // account, backup, or share data. Keep this first so
                            // no asset route can cache a response under /api.
                            urlPattern: ({ sameOrigin, url }) => sameOrigin && /^\/api(?:\/|$)/.test(url.pathname),
                            handler: 'NetworkOnly',
                        },
                        {
                            // Lazy route chunks are content-addressed; cache
                            // them after the first successful visit so that
                            // page keeps working offline.
                            urlPattern: ({ request, sameOrigin, url }) =>
                                sameOrigin &&
                                request.destination === 'script' &&
                                /^\/assets\/.+\.js$/.test(url.pathname),
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'route-chunks-v1',
                                cacheableResponse: { statuses: [200] },
                                expiration: {
                                    maxEntries: 120,
                                    maxAgeSeconds: 30 * 24 * 60 * 60,
                                },
                            },
                        },
                        {
                            // CSS for a lazy page follows the same rule.
                            urlPattern: ({ request, sameOrigin, url }) =>
                                sameOrigin &&
                                request.destination === 'style' &&
                                /^\/assets\/.+\.css$/.test(url.pathname),
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'route-styles-v1',
                                cacheableResponse: { statuses: [200] },
                                expiration: {
                                    maxEntries: 40,
                                    maxAgeSeconds: 30 * 24 * 60 * 60,
                                },
                            },
                        },
                        {
                            // Images and fonts used by a visited page. These
                            // are app assets, not user data.
                            urlPattern: ({ request, sameOrigin }) =>
                                sameOrigin && (request.destination === 'image' || request.destination === 'font'),
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'static-assets-v1',
                                cacheableResponse: { statuses: [200] },
                                expiration: {
                                    maxEntries: 80,
                                    maxAgeSeconds: 30 * 24 * 60 * 60,
                                },
                            },
                        },
                    ],
                },
            }),
        ],
    };
});
