/**
 * One CycloneDX schema check, shared by every place that validates an SBOM.
 *
 * There were two answers to "is this document valid". `check:sbom` regenerated
 * the document and compared it to what was committed; the schema itself was
 * only ever compiled inside a test file. `check:rc-readiness` accepted anything
 * whose `bomFormat` said CycloneDX and whose `specVersion` said 1.5 — fields it
 * read, not the schema it never ran.
 *
 * The result was a gate that could disagree with itself: a document `check:sbom`
 * rejected as malformed was, to the readiness gate, a pass. Two validators for
 * one artifact is one too many, and the one that matters is the official schema
 * rather than a hand-written impression of it.
 *
 * The schema files are vendored under `schemas/cyclonedx/` so validation works
 * without the network. They are the official 1.5 schema and its two `$ref`
 * targets, byte-for-byte.
 */
import fs from 'node:fs'
import path from 'node:path'

import Ajv from 'ajv'
import addFormats from 'ajv-formats'

export interface SchemaValidation {
  readonly valid: boolean
  readonly errors: readonly string[]
}

const SCHEMA_DIR = path.join(import.meta.dirname, 'schemas/cyclonedx')

let compiled: ((value: unknown) => boolean) | undefined
let lastErrors: (() => string[]) | undefined

/**
 * Compiles the CycloneDX 1.5 schema once per process.
 *
 * `strict: false` still makes ajv warn about formats it does not know
 * (`iri-reference`, `idn-email`), and vitest surfaces those warnings as test
 * failures. They are properties of the CycloneDX schema, not of our document —
 * the fields they guard are optional and we emit none of them. `logger: false`
 * silences the report without disabling validation.
 */
function validator(): {
  validate: (value: unknown) => boolean
  errors: () => string[]
} {
  if (!compiled) {
    const ajv = new Ajv({ allErrors: true, strict: false, logger: false })
    addFormats(ajv)
    for (const name of ['spdx.schema.json', 'jsf-0.82.schema.json']) {
      ajv.addSchema(
        JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8')),
      )
    }
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMA_DIR, 'bom-1.5.schema.json'), 'utf8'),
    ) as object
    const validate = ajv.compile(schema)
    compiled = validate
    lastErrors = () =>
      (validate.errors ?? []).map(
        error =>
          `${error.instancePath || '(root)'} ${error.message ?? 'invalid'}`,
      )
  }
  return {
    validate: compiled,
    errors: () => (lastErrors ? lastErrors() : []),
  }
}

/**
 * Validates a document against the official CycloneDX 1.5 schema.
 *
 * Returns every error rather than the first: a document that gets three things
 * wrong should say so, not make the author rerun three times.
 */
export function validateCycloneDxSchema(document: unknown): SchemaValidation {
  const { validate, errors } = validator()
  if (validate(document)) return { valid: true, errors: [] }
  return { valid: false, errors: errors() }
}
