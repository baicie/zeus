@Component({
  tag: 'my-button',
  shadow: true,
})
export function MyButton(props: { label: string }) {
  const button = useRef<HTMLButtonElement>('btn')
  
  const onClick = useEvent('click', (e: MouseEvent) => {
    console.log('clicked')
  })

  return (
    <button onClick={onClick} ref="btn">
      {props.label}
    </button>
  )
}
