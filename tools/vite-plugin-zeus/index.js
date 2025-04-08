'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/vite-plugin-zeus.cjs.prod.js')
} else {
  module.exports = require('./dist/vite-plugin-zeus.cjs.js')
}
