import { escapeTemplateLiteral } from './svg'

import type { NormalizedIconSource } from './types'

export function generateReactIcon(icon: NormalizedIconSource): string {
  const inner = escapeTemplateLiteral(icon.innerSvg)

  return `
import React from 'react';

export const ${icon.componentName} = React.forwardRef(function ${icon.componentName}(props, ref) {
  const {
    size = '1em',
    title,
    children,
    ...rest
  } = props;

  const content = children != null
    ? children
    : React.createElement('g', {
        dangerouslySetInnerHTML: { __html: \`${inner}\` },
      });

  return React.createElement(
    'svg',
    {
      ...rest,
      ref,
      width: size,
      height: size,
      viewBox: ${JSON.stringify(icon.viewBox)},
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': title ? undefined : true,
      role: title ? 'img' : undefined,
    },
    title ? React.createElement('title', null, title) : null,
    content,
  );
});
`.trimStart()
}

export function generateReactIndex(icons: NormalizedIconSource[]): string {
  return `${icons
    .map(icon => {
      return `export { ${icon.componentName} } from './${icon.name}.js';`
    })
    .join('\n')}\n`
}
