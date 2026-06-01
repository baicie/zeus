'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/signal.cjs.prod.js')
} else {
  module.exports = require('./dist/signal.cjs.js')
}
