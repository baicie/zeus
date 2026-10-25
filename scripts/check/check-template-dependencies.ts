import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import semver from 'semver'

interface TemplatePackageJSON {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

interface RegistryMetadata {
  versions?: Record<string, unknown>
}

export interface TemplateDependencyRequirement {
  template: string
  packageName: string
  range: string
}

export function findUnpublishedTemplateDependencies(
  requirements: readonly TemplateDependencyRequirement[],
  publishedVersions: ReadonlyMap<string, readonly string[]>,
): TemplateDependencyRequirement[] {
  return requirements.filter(requirement => {
    const versions = publishedVersions.get(requirement.packageName) ?? []
    return !versions.some(version =>
      semver.satisfies(version, requirement.range),
    )
  })
}

export function readTemplateRequirements(
  packageFiles: readonly string[],
): TemplateDependencyRequirement[] {
  return packageFiles.flatMap(packageFile => {
    const packageJSON = JSON.parse(
      readFileSync(packageFile, 'utf8'),
    ) as TemplatePackageJSON
    const dependencies = {
      ...packageJSON.dependencies,
      ...packageJSON.devDependencies,
    }
    const template = path.basename(path.dirname(packageFile))

    return Object.entries(dependencies)
      .filter(
        (entry): entry is [string, string] =>
          entry[0].startsWith('@zeus-js/') && typeof entry[1] === 'string',
      )
      .map(([packageName, range]) => ({ template, packageName, range }))
  })
}

async function readPublishedVersions(
  packageName: string,
  registry: string,
): Promise<string[]> {
  const registryRoot = registry.endsWith('/') ? registry : `${registry}/`
  const response = await fetch(
    new URL(encodeURIComponent(packageName), registryRoot),
    { signal: AbortSignal.timeout(30_000) },
  )

  if (!response.ok) {
    throw new Error(
      `Registry request failed for ${packageName}: ${response.status} ${response.statusText}`,
    )
  }

  const metadata = (await response.json()) as RegistryMetadata
  return Object.keys(metadata.versions ?? {})
}

export function getTemplateVersionPolicyErrors(
  requirements: readonly TemplateDependencyRequirement[],
): string[] {
  const errors = requirements
    .filter(
      requirement => semver.valid(requirement.range) !== requirement.range,
    )
    .map(
      requirement =>
        `${requirement.template}: ${requirement.packageName} must pin an exact published version, got ${requirement.range}`,
    )
  const frameworkVersions = new Set(
    requirements
      .filter(requirement => requirement.packageName !== '@zeus-js/vite-plugin')
      .map(requirement => requirement.range),
  )
  if (frameworkVersions.size > 1) {
    errors.push(
      `Templates must use one Zeus framework version, got ${[...frameworkVersions].join(', ')}`,
    )
  }
  return errors
}

export async function checkTemplateDependencies(
  packageFileArgs: readonly string[],
  registry = process.env.npm_config_registry ??
    process.env.NPM_CONFIG_REGISTRY ??
    'https://registry.npmjs.org',
): Promise<void> {
  if (packageFileArgs.length === 0) {
    throw new Error(
      'Usage: check-template-dependencies <template-package.json> [...]',
    )
  }

  const packageFiles = packageFileArgs.map(file => path.resolve(file))
  const requirements = readTemplateRequirements(packageFiles)
  const packageNames = [...new Set(requirements.map(item => item.packageName))]
  const publishedVersions = new Map(
    await Promise.all(
      packageNames.map(
        async packageName =>
          [
            packageName,
            await readPublishedVersions(packageName, registry),
          ] as const,
      ),
    ),
  )
  const unpublished = findUnpublishedTemplateDependencies(
    requirements,
    publishedVersions,
  )

  if (unpublished.length > 0) {
    throw new Error(
      `Template dependencies have no published match:\n${unpublished
        .map(
          requirement =>
            `  - ${requirement.template}: ${requirement.packageName}@${requirement.range}`,
        )
        .join('\n')}`,
    )
  }

  console.log(
    `Published template dependencies verified (${packageNames.join(', ')})`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await checkTemplateDependencies(process.argv.slice(2))
}
