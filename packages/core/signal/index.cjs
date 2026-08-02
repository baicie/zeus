'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/signal.prod.cjs')
} else {
  module.exports = require('./dist/signal.cjs')
}
