import { Host, Slot, defineElement } from '@zeus-js/zeus'

const noteStyles = `
  .note {
    min-height: 180px;
    padding: 20px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: white;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  }

  .note h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }

  .note__body {
    display: grid;
    gap: 8px;
    color: #374151;
  }

  .note__body > * {
    margin: 0;
  }
`

const cardStyles = `
  .card {
    display: grid;
    gap: 18px;
    min-height: 280px;
    padding: 22px;
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    background: white;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  }

  .card__top {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 16px;
  }

  .card__eyebrow {
    display: block;
    margin-bottom: 4px;
    color: #64748b;
    font-size: 0.8rem;
    text-transform: uppercase;
  }

  .card__title {
    font-size: 1.25rem;
  }

  .card__actions,
  .card__footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .card__body {
    display: grid;
    gap: 8px;
  }

  .card__body > * {
    margin: 0;
  }

  .card__footer {
    align-items: center;
    justify-content: space-between;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    color: #64748b;
  }
`

defineElement<{ title: string }>(
  'z-note',
  {
    shadow: false,
    props: {
      title: String,
    },
    styles: noteStyles,
  },
  props => (
    <Host>
      <section class="note">
        <h2>{props.title}</h2>
        <div class="note__body">
          <Slot>
            <p>没有传入内容时，这段 fallback 会显示出来。</p>
          </Slot>
        </div>
      </section>
    </Host>
  ),
)

defineElement(
  'z-dashboard-card',
  {
    shadow: false,
    styles: cardStyles,
  },
  () => (
    <Host>
      <article class="card">
        <div class="card__top">
          <div>
            <span class="card__eyebrow">
              <Slot name="eyebrow" />
            </span>
            <div class="card__title">
              <Slot name="title">
                <strong>Untitled</strong>
              </Slot>
            </div>
          </div>
          <div class="card__actions">
            <Slot name="actions" />
          </div>
        </div>

        <div class="card__body">
          <Slot />
        </div>

        <footer class="card__footer">
          <Slot name="footer">
            <span>No footer content</span>
          </Slot>
        </footer>
      </article>
    </Host>
  ),
)
