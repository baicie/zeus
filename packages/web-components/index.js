'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/web-components.cjs.prod.js')
} else {
  module.exports = require('./dist/web-components.cjs.js')
}
