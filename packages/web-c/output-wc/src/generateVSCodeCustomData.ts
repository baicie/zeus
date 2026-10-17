interface CustomElementsManifest {
  schemaVersion: string
  modules: Array<{
    declarations?: Array<{
      kind?: string
      tagName?: string
      customElement?: boolean
      description?: string
      attributes?: Array<{
        name?: string
        description?: string
        type?: { text?: string }
      }>
    }>
  }>
}

interface VSCodeCustomData {
  version: 1.1
  tags: Array<{
    name: string
    description?: string
    attributes?: Array<{
      name: string
      description?: string
      values?: Array<{ name: string }>
    }>
  }>
}

export function generateVSCodeCustomData(customElementsJson: string): string {
  let manifest: CustomElementsManifest

  try {
    manifest = JSON.parse(customElementsJson) as CustomElementsManifest
  } catch {
    throw new Error(
      '[ZEUS_VSCODE_CUSTOM_DATA_INVALID] CEM input is not valid JSON.',
    )
  }

  if (manifest?.schemaVersion !== '1.0.0' || !Array.isArray(manifest.modules)) {
    throw new Error(
      '[ZEUS_VSCODE_CUSTOM_DATA_INVALID] CEM input must use schemaVersion 1.0.0 and contain modules.',
    )
  }

  const tags = manifest.modules.flatMap(module =>
    (module.declarations ?? [])
      .filter(
        declaration =>
          declaration.kind === 'class' &&
          declaration.customElement === true &&
          typeof declaration.tagName === 'string',
      )
      .map(declaration => {
        const tagName = declaration.tagName!
        const attributes = (declaration.attributes ?? []).map(attribute => {
          if (typeof attribute.name !== 'string') {
            throw new Error(
              `[ZEUS_VSCODE_CUSTOM_DATA_INVALID] <${tagName}> contains an attribute without a name.`,
            )
          }

          const values = parseStringLiteralUnion(attribute.type?.text)
          return {
            name: attribute.name,
            ...(attribute.description
              ? { description: attribute.description }
              : {}),
            ...(values ? { values: values.map(name => ({ name })) } : {}),
          }
        })

        return {
          name: tagName,
          ...(declaration.description
            ? { description: declaration.description }
            : {}),
          ...(attributes.length > 0 ? { attributes } : {}),
        }
      }),
  )

  const names = new Set<string>()
  for (const tag of tags) {
    if (names.has(tag.name)) {
      throw new Error(
        `[ZEUS_VSCODE_CUSTOM_DATA_INVALID] CEM declares <${tag.name}> more than once.`,
      )
    }
    names.add(tag.name)
  }

  const result: VSCodeCustomData = { version: 1.1, tags }
  return `${JSON.stringify(result, null, 2)}\n`
}

function parseStringLiteralUnion(typeText?: string): string[] | undefined {
  if (!typeText) return undefined

  const parts = typeText.split(/\s+\|\s+/)
  const values: string[] = []

  for (const part of parts) {
    if (!part.startsWith('"') || !part.endsWith('"')) return undefined

    try {
      const value: unknown = JSON.parse(part)
      if (typeof value !== 'string') return undefined
      values.push(value)
    } catch {
      return undefined
    }
  }

  return values.length > 0 ? values : undefined
}
