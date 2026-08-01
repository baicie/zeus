'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/compiler-shared.cjs.prod.js')
} else {
  module.exports = require('./dist/compiler-shared.cjs.js')
}
