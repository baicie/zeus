'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/output-react-wrapper.prod.cjs')
} else {
  module.exports = require('./dist/output-react-wrapper.cjs')
}
