'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/output-wc.cjs.prod.js')
} else {
  module.exports = require('./dist/output-wc.cjs.js')
}
