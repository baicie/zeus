'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/output-icons.prod.cjs')
} else {
  module.exports = require('./dist/output-icons.cjs')
}
