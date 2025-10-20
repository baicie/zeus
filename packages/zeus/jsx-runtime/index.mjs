function Fragment(props) {
  return props.children
}

function jsx(type, props) {
  return h(type, props)
}

export { Fragment, jsx, jsx as jsxs, jsx as jsxDEV }
