export function F() {
  const html = '<b>x</b>'
  return <div dangerouslySetInnerHTML={{ __html: html }}>child</div>
}

