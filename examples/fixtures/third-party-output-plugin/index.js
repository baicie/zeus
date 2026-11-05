/**
 * A package outside the Zeus workspace that uses only the public Output Plugin
 * contract. It emits one JSON file per custom element.
 *
 * @returns {import('@zeus-js/bundler-plugin').ZeusComponentPlugin}
 */
export default function acmeJsonOutput() {
  return {
    apiVersion: 1,
    name: 'acme-json-output',

    setup(context) {
      context.outputs.register('acme:json', {
        outDir: 'acme',
        fileName: tag => `${tag}.json`,
      })
    },

    generateBundle(context) {
      return context.manifest.components.map(component => ({
        type: 'asset',
        fileName: context.outputs.join(
          'acme:json',
          context.outputs.getFileName('acme:json', component.tag),
        ),
        source: JSON.stringify(
          {
            tag: component.tag,
            props: Object.keys(component.props),
            events: Object.values(component.events).map(event => event.name),
          },
          null,
          2,
        ),
      }))
    },
  }
}
