// vite.config.js
export default {
  server: {
    proxy: {
      '/evaluate': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
};