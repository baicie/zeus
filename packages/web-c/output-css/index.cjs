'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/output-css.prod.cjs')
} else {
  module.exports = require('./dist/output-css.cjs')
}
