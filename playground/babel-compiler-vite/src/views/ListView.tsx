import { signal } from '@zeus-js/core'

export default function ListView() {
  const items = signal(['compiler', 'hydration', 'universal'])
  const text = signal('')

  function add() {
    const value = text().trim()
    if (!value) return
    items(items().concat([value]))
    text('')
  }

  return (
    <section class="card">
      <h2>List</h2>
      <div class="row">
        <input
          value={text()}
          placeholder="new item"
          onInput={e => text((e.target as HTMLInputElement).value)}
        />
        <button onClick={add}>add</button>
      </div>
      <ul>
        {items().map(function (item, idx) {
          return (
            <li>
              {idx + 1}. {item}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
