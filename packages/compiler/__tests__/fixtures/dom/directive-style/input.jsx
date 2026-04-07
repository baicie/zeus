const d = (el, v) => v
const s = () => ({ color: 'red' })
export function F() {
  return <div use:x={[d, 1]} style={s()} />
}

