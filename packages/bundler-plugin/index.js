'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/bundler-plugin.cjs.prod.js')
} else {
  module.exports = require('./dist/bundler-plugin.cjs.js')
}
