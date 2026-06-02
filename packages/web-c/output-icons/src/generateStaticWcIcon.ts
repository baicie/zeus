import { escapeTemplateLiteral } from './svg'

import type { NormalizedIconSource } from './types'

export function generateStaticWcIcon(icon: NormalizedIconSource): string {
  const inner = escapeTemplateLiteral(icon.innerSvg)
  const className = `${icon.componentName}Element`

  return `
const INNER_SVG = \`${inner}\`;
const VIEW_BOX = ${JSON.stringify(icon.viewBox)};

export class ${className} extends HTMLElement {
  static get observedAttributes() {
    return ['size', 'label'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  get size() {
    return this.getAttribute('size') || '1em';
  }

  set size(value) {
    if (value == null) {
      this.removeAttribute('size');
    } else {
      this.setAttribute('size', String(value));
    }
  }

  get label() {
    return this.getAttribute('label') || '';
  }

  set label(value) {
    if (value == null || value === '') {
      this.removeAttribute('label');
    } else {
      this.setAttribute('label', String(value));
    }
  }

  render() {
    const size = this.size;
    const label = this.label;

    this.innerHTML =
      '<svg' +
      ' part="root"' +
      ' width="' + escapeHtml(size) + '"' +
      ' height="' + escapeHtml(size) + '"' +
      ' viewBox="' + escapeHtml(VIEW_BOX) + '"' +
      ' xmlns="http://www.w3.org/2000/svg"' +
      (label ? ' role="img" aria-label="' + escapeHtml(label) + '"' : ' aria-hidden="true"') +
      '>' +
      INNER_SVG +
      '</svg>';
  }
}

if (!customElements.get(${JSON.stringify(icon.wcTag)})) {
  customElements.define(${JSON.stringify(icon.wcTag)}, ${className});
}

export const ${icon.componentName} = ${className};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
`.trimStart()
}

export function generateStaticWcIndex(icons: NormalizedIconSource[]): string {
  return `${icons
    .map(icon => {
      return `export { ${icon.componentName} } from './${icon.name}.js';`
    })
    .join('\n')}\n`
}
