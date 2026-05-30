import { Host, Slot, defineElement, state } from '@zeus-js/zeus'

defineElement<{ title: string; initialCount: number }>(
  'z-counter',
  {
    shadow: false,
    props: {
      title: String,
      initialCount: Number,
    },
  },
  props => {
    const count = state(props.initialCount ?? 0)

    return (
      <Host>
        <style>{`
          .counter {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem;
          }
          h2 {
            margin: 0;
            font-size: 1rem;
            color: #666;
          }
          .count {
            font-size: 2.5rem;
            font-weight: bold;
            color: #6366f1;
          }
          .buttons { display: flex; gap: 0.5rem; }
          button {
            padding: 0.5rem 1rem;
            background: #6366f1;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          }
          button:hover { background: #4f46e5; }
        `}</style>
        <div class="counter">
          <h2>{props.title}</h2>
          <div class="count">{count.value}</div>
          <div class="buttons">
            <button onClick={() => count.value--}>-</button>
            <button onClick={() => count.value++}>+</button>
          </div>
          <Slot />
        </div>
      </Host>
    )
  },
)
