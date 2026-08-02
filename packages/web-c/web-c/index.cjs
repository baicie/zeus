'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/web-c.prod.cjs')
} else {
  module.exports = require('./dist/web-c.cjs')
}
