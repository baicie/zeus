'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/output-vue-wrapper.prod.cjs')
} else {
  module.exports = require('./dist/output-vue-wrapper.cjs')
}
