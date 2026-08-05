const BOOLEAN_PROPERTY_ELEMENTS = {
  checked: new Set(['input']),
  disabled: new Set([
    'button',
    'fieldset',
    'input',
    'optgroup',
    'option',
    'select',
    'textarea',
  ]),
  multiple: new Set(['input', 'select']),
  readOnly: new Set(['input', 'textarea']),
  selected: new Set(['option']),
} satisfies Record<string, ReadonlySet<string>>

const VALUE_PROPERTY_ELEMENTS = new Set([
  'button',
  'input',
  'option',
  'textarea',
])

export function isSSRPropertySupported(tag: string, name: string): boolean {
  const normalizedTag = tag.toLowerCase()

  if (name === 'tabIndex') return true
  if (name === 'htmlFor') return normalizedTag === 'label'
  if (name === 'value') return VALUE_PROPERTY_ELEMENTS.has(normalizedTag)

  return Boolean(
    BOOLEAN_PROPERTY_ELEMENTS[
      name as keyof typeof BOOLEAN_PROPERTY_ELEMENTS
    ]?.has(normalizedTag),
  )
}
