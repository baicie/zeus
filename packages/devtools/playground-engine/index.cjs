'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/playground-engine.prod.cjs')
} else {
  module.exports = require('./dist/playground-engine.cjs')
}
