// 带属性的组件 / Component with props
interface ButtonProps {
  text: string
  disabled?: boolean
}

const ButtonComponent = ({ text, disabled = false }: ButtonProps) => {
  return <button disabled={disabled}>{text}</button>
}

const ComponentWithProps = () => {
  return (
    <div>
      <ButtonComponent text="Click me" />
      <ButtonComponent text="Disabled" disabled={true} />
    </div>
  )
}

export default ComponentWithProps
