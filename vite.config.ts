import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';

function logoUploadPlugin(): Plugin {
  return {
    name: 'logo-upload-server',
    configureServer(server) {
      server.middlewares.use('/api/shorten-url', async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '', 'http://localhost:3000');
          const targetUrl = reqUrl.searchParams.get('url') || '';
          if (!targetUrl) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ shorturl: null }));
            return;
          }

          // 1. Primary: TinyURL API (fast, reliable for .run.app domains)
          try {
            const tinyController = new AbortController();
            const tinyTimeout = setTimeout(() => tinyController.abort(), 4000);
            const tinyRes = await fetch(
              `https://tinyurl.com/api-create.php?url=${encodeURIComponent(targetUrl)}`,
              { signal: tinyController.signal }
            );
            clearTimeout(tinyTimeout);
            if (tinyRes.ok) {
              const tinyText = (await tinyRes.text()).trim();
              if (tinyText.startsWith('https://tinyurl.com/') || tinyText.startsWith('http://tinyurl.com/')) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ shorturl: tinyText.replace('http://', 'https://') }));
                return;
              }
            }
          } catch {
            // Continue to fallback shortener
          }

          // 2. Secondary: is.gd JSON API
          try {
            const isgdController = new AbortController();
            const isgdTimeout = setTimeout(() => isgdController.abort(), 3500);
            const isgdRes = await fetch(
              `https://is.gd/create.php?format=json&url=${encodeURIComponent(targetUrl)}`,
              { signal: isgdController.signal }
            );
            clearTimeout(isgdTimeout);
            if (isgdRes.ok) {
              const data = (await isgdRes.json()) as { shorturl?: string };
              if (data && typeof data.shorturl === 'string' && data.shorturl.startsWith('http')) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ shorturl: data.shorturl }));
                return;
              }
            }
          } catch {
            // Ignore
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ shorturl: null }));
        } catch {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ shorturl: null }));
        }
      });

      server.middlewares.use('/api/upload-logo', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Método no permitido. Solo se acepta POST.' }));
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;
        const MAX_SIZE = 2 * 1024 * 1024; // 2MB

        req.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_SIZE) {
            req.destroy();
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'El archivo excede el tamaño máximo permitido de 2MB.' }));
            return;
          }
          chunks.push(chunk);
        });

        req.on('end', () => {
          if (res.writableEnded) return;

          try {
            const buffer = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || '';
            let fileBuffer: Buffer | null = null;

            if (contentType.includes('multipart/form-data')) {
              const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
              if (boundaryMatch) {
                const boundary = boundaryMatch[1] || boundaryMatch[2];
                const boundaryBuffer = Buffer.from(`--${boundary}`);
                const parts: Buffer[] = [];
                let start = 0;
                while (true) {
                  const idx = buffer.indexOf(boundaryBuffer, start);
                  if (idx === -1) break;
                  if (start > 0) {
                    parts.push(buffer.subarray(start, idx));
                  }
                  start = idx + boundaryBuffer.length;
                }

                for (const part of parts) {
                  const headerEndIdx = part.indexOf('\r\n\r\n');
                  if (headerEndIdx !== -1) {
                    const headerStr = part.subarray(0, headerEndIdx).toString('utf-8');
                    if (
                      headerStr.includes('filename=') ||
                      headerStr.includes('name="logo"') ||
                      headerStr.includes('name="file"')
                    ) {
                      const lowerHeader = headerStr.toLowerCase();
                      if (
                        !lowerHeader.includes('image/png') &&
                        !lowerHeader.includes('image/jpeg') &&
                        !lowerHeader.includes('image/jpg') &&
                        !lowerHeader.includes('image/svg+xml') &&
                        !lowerHeader.includes('image/webp')
                      ) {
                        res.statusCode = 400;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: 'Formato inválido. Solo se admiten archivos PNG, JPEG y SVG.' }));
                        return;
                      }

                      let content = part.subarray(headerEndIdx + 4);
                      // Remove trailing \r\n if present
                      if (content.length >= 2 && content[content.length - 2] === 13 && content[content.length - 1] === 10) {
                        content = content.subarray(0, content.length - 2);
                      }
                      fileBuffer = content;
                      break;
                    }
                  }
                }
              }
            } else {
              fileBuffer = buffer;
            }

            if (!fileBuffer || fileBuffer.length === 0) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'No se detectó ningún archivo en la petición.' }));
              return;
            }

            // Sobrescribir archivo fijo directamente en process.cwd() + '/public/logo-institucional.png'
            const targetPath = path.resolve(process.cwd(), 'public/logo-institucional.png');
            fs.writeFileSync(targetPath, fileBuffer);

            // Mantener consistencia con public/logo.png
            try {
              fs.writeFileSync(path.resolve(process.cwd(), 'public/logo.png'), fileBuffer);
            } catch {}

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: true,
                message: 'Logo institucional actualizado correctamente en el servidor.',
                url: '/logo-institucional.png',
              })
            );
          } catch (err: any) {
            console.error('[Upload-Logo] Error al guardar logo:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Error interno del servidor al guardar el archivo.' }));
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    logoUploadPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2,json}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'script' ||
              request.destination === 'style' ||
              request.destination === 'worker' ||
              /\.(?:js|css|mjs)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ievf-static-resources-cache-v1',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'image' ||
              request.destination === 'font' ||
              /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ievf-media-assets-cache-v1',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 60,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true
      },
      manifest: {
        id: '/',
        start_url: '/',
        name: 'Parrilla Horaria I.E. Villa Flora',
        short_name: 'Horarios VF',
        theme_color: '#f8fafc',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ],
        screenshots: [
          {
            src: '/screenshot-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide'
          },
          {
            src: '/screenshot-mobile.png',
            sizes: '750x1334',
            type: 'image/png'
          }
        ]
      }
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: false,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {
      ignored: ['**/*.xlsx', '**/*.docx', '**/scripts/**'],
    },
  },
});
