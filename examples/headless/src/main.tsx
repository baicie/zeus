import '@zeus-ui/headless/wc'
import '@zeus-ui/headless/styles.css'

document
  .querySelector('z-switch')
  ?.addEventListener('checked-change', event => {
    console.log((event as CustomEvent<{ checked: boolean }>).detail.checked)
  })

document.querySelector('z-dialog')?.addEventListener('open-change', event => {
  console.log((event as CustomEvent<{ open: boolean }>).detail.open)
})
