'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/component-analyzer.cjs.prod.js')
} else {
  module.exports = require('./dist/component-analyzer.cjs.js')
}
