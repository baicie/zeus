'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/resource.prod.cjs')
} else {
  module.exports = require('./dist/resource.cjs')
}
