'use strict'

exports.jsx = function jsx(type, props, key) {
  return {
    $$typeof: Symbol.for('react.element'),
    type,
    key: key === undefined ? null : key,
    props: props || {},
  }
}

exports.jsxs = exports.jsx
exports.Fragment = Symbol.for('react.fragment')
