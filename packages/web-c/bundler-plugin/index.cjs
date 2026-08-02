'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/bundler-plugin.prod.cjs')
} else {
  module.exports = require('./dist/bundler-plugin.cjs')
}
