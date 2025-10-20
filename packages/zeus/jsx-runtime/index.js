function Fragment(props) {
  return props.children
}

function jsx(type, props) {
  return h(type, props)
}

// support React Transform in case someone really wants it for some reason
export { jsx, jsx as jsxs, jsx as jsxDEV, Fragment }
