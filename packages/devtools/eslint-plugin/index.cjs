'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/eslint-plugin.prod.cjs')
} else {
  module.exports = require('./dist/eslint-plugin.cjs')
}
