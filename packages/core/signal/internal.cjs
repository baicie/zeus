'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/internal.prod.cjs')
} else {
  module.exports = require('./dist/internal.cjs')
}
