import { transformSync } from '@babel/core'
import type { TransformHook } from 'rollup'
import { createJSXPlugin } from './babel'
import type { PropertyMeta } from '@zeus/output'

export const commonTransform: TransformHook = (code: string, id: string) => {
  // 只处理 tsx/jsx 文件
  if (!/\.[tj]sx$/.test(id)) {
    return null
  }

  // 检查文件是否包含 @Component 装饰器
  if (!code.includes('@Component')) {
    return null
  }

  try {
    const result = transformSync(code, {
      filename: id,
      presets: [['@babel/preset-typescript', { isTSX: true }]],
      plugins: [
        ['@babel/plugin-syntax-decorators', { version: '2023-05' }],
        createJSXPlugin({
          dev: process.env.NODE_ENV !== 'production',
        }),
      ],
      sourceMaps: true,
      sourceFileName: id,
    })
    if (!result) {
      return null
    }

    return {
      code: result.code || code,
      map: result.map,
    }
  } catch (error) {
    console.error(`Error transforming ${id}:`, error)
    return null
  }
}

export function extractPropsFromType(typeAnnotation: any): PropertyMeta[] {
  const properties: PropertyMeta[] = []

  if (typeAnnotation.typeAnnotation.type === 'TSTypeLiteral') {
    typeAnnotation.typeAnnotation.members.forEach((member: any) => {
      properties.push({
        name: member.key.name,
        type: member.typeAnnotation.typeAnnotation.type.replace('TS', ''),
      })
    })
  }

  return properties
}
