const native = process.env.ZEUS_CONSUMER_MODE === 'native'
const plugins = native ? [(await import('@zeus-js/vite-plugin')).default()] : []

export default {
  plugins,
  define: { __CONSUMER_MODE__: JSON.stringify(process.env.ZEUS_CONSUMER_MODE) },
  server: { host: '127.0.0.1' },
}
