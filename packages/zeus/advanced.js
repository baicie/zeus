'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/advanced.cjs.prod.js')
} else {
  module.exports = require('./dist/advanced.cjs.js')
}
