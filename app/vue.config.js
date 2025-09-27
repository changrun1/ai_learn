const path = require('path')

module.exports = {
  devServer: {
    port: 8080,
    proxy: {
      '/api': {
        target: process.env.API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
        pathRewrite: { '^/api': '/api' }
      }
    }
  },
  configureWebpack: {
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
  }
}
