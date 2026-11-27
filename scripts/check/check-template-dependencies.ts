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

/**
 * The Zeus requirements of one template manifest.
 *
 * `@zeus-web/*` is included deliberately. `create-zeus`'s `webc-consumer-ts`
 * template consumes `@zeus-web/button`, whose pin follows the *paired UI*
 * version — a separate release train from Core. Filtering to `@zeus-js/` made
 * the one dependency most likely to be absent from the registry the one this
 * check never looked at, so the template failed at `npm install` with ETARGET,
 * far from the decision that caused it.
 */
export function readPackageDependencyRequirements(
  template: string,
  packageFile: string,
): TemplateDependencyRequirement[] {
  const packageJSON = JSON.parse(
    readFileSync(packageFile, 'utf8'),
  ) as TemplatePackageJSON
  const dependencies = {
    ...packageJSON.dependencies,
    ...packageJSON.devDependencies,
  }
  return Object.entries(dependencies)
    .filter(
      (entry): entry is [string, string] =>
        (entry[0].startsWith('@zeus-js/') ||
          entry[0].startsWith('@zeus-web/')) &&
        typeof entry[1] === 'string',
    )
    .map(([packageName, range]) => ({ template, packageName, range }))
}

export function readTemplateRequirements(
  packageFiles: readonly string[],
): TemplateDependencyRequirement[] {
  return packageFiles.flatMap(packageFile =>
    readPackageDependencyRequirements(
      path.basename(path.dirname(packageFile)),
      packageFile,
    ),
  )
}

/**
 * The versions the registry actually has for one package.
 *
 * A 404 is not an error: it is the registry's answer for a package that has
 * never been published, and it means "no published version" — the honest
 * input to the unpublished check. Every other non-2xx status, and every
 * network failure, is thrown: a 500, a 403, a rate limit or a timeout says
 * nothing about whether the version exists, and treating any of them as
 * "unpublished" would let a flaky registry excuse a real absence.
 */
export async function readPublishedVersions(
  packageName: string,
  registry: string,
): Promise<string[]> {
  const registryRoot = registry.endsWith('/') ? registry : `${registry}/`
  let response: Response
  try {
    response = await fetch(
      new URL(encodeURIComponent(packageName), registryRoot),
      { signal: AbortSignal.timeout(30_000) },
    )
  } catch (error) {
    throw new Error(
      `Registry request failed for ${packageName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  if (response.status === 404) return []

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
    const detail = unpublished
      .map(
        requirement =>
          `  - ${requirement.template}: ${requirement.packageName}@${requirement.range}`,
      )
      .join('\n')
    /*
     * Deferring has to be claimed, exactly as in `check:create-zeus`.
     *
     * The claim means "the Release Candidate gate covers this template with
     * real tarballs, and the post-publish registry gate will confirm the
     * published scaffold". Without it, an unpublished pin is a failure: a
     * development branch that cannot be installed is a broken scaffold, not a
     * pending release.
     *
     * It cannot run in the release precheck at all — a paired Core publishes
     * before its UI — which is why this lives in ordinary CI and why the
     * post-publish `check:create-zeus-registry` is the gate that finally
     * accepts it.
     */
    if (process.env.ZEUS_CREATE_DEFER_TO_CANDIDATE !== '1') {
      throw new Error(
        `Template dependencies have no published match:\n${detail}\n` +
          'Run with ZEUS_CREATE_DEFER_TO_CANDIDATE=1 when the Release Candidate gate covers them.',
      )
    }
    console.log(
      `Template dependencies deferred to the candidate and registry gates:\n${detail}`,
    )
    return
  }

  console.log(
    `Published template dependencies verified (${packageNames.join(', ')})`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await checkTemplateDependencies(process.argv.slice(2))
}
