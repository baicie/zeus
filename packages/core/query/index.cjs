'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/query.prod.cjs')
} else {
  module.exports = require('./dist/query.cjs')
}
