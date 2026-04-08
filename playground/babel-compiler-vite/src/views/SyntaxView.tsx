import { signal } from '@zeus-js/core'

export default function SyntaxView() {
  const visible = signal(true)
  let titleRef: HTMLHeadingElement | undefined

  return (
    <section class="card">
      <h2 ref={titleRef}>JSX Syntax</h2>
      <div class="row">
        <button onClick={() => visible(!visible())}>toggle</button>
      </div>

      <>
        {visible() ? (
          <p style={{ color: '#4f46e5', fontWeight: '600' }}>
            visible fragment branch
          </p>
        ) : (
          <p style={{ color: '#b91c1c', fontWeight: '600' }}>
            hidden fragment branch
          </p>
        )}
      </>
    </section>
  )
}
