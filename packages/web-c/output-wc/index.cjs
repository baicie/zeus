'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/output-wc.prod.cjs')
} else {
  module.exports = require('./dist/output-wc.cjs')
}
