'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/component-analyzer.prod.cjs')
} else {
  module.exports = require('./dist/component-analyzer.cjs')
}
