import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const clientId = env.VITE_WCL_CLIENT_ID;
  const clientSecret = env.VITE_WCL_CLIENT_SECRET;

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'local-token-endpoint',
        configureServer(server) {
          server.middlewares.use('/api/token', async (_req, res) => {
            if (!clientId || !clientSecret) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing API credentials in .env' }));
              return;
            }

            try {
              const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
              const tokenResponse = await fetch('https://www.warcraftlogs.com/oauth/token', {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${credentials}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'grant_type=client_credentials',
              });

              const bodyText = await tokenResponse.text();
              res.statusCode = tokenResponse.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(bodyText);
            } catch {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Failed to fetch access token' }));
            }
          });
        },
      },
    ],
    server: {
      proxy: {
        '/api/oauth': {
          target: 'https://www.warcraftlogs.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/oauth/, '/oauth'),
          configure: (proxy) => {
            // 브라우저 로그인 팝업 방지: WWW-Authenticate 헤더 제거
            proxy.on('proxyRes', (proxyRes) => {
              delete proxyRes.headers['www-authenticate'];
            });
          },
        },
        '/api/graphql': {
          target: 'https://www.warcraftlogs.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/graphql/, '/api/v2/client'),
        },
      },
    },
  };
});
