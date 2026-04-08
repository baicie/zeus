function Layout(props) {
  return <section>{props.children}</section>
}

export function App() {
  const current = signal('home')
  return (
    <Layout>
      <button onClick={() => current('counter')}>go</button>
      {current()}
    </Layout>
  )
}
