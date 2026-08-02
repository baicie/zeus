'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/component-dts.prod.cjs')
} else {
  module.exports = require('./dist/component-dts.cjs')
}
