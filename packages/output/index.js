'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/output.cjs.prod.js')
} else {
  module.exports = require('./dist/output.cjs.js')
}
