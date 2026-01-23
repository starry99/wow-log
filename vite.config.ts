import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
})
