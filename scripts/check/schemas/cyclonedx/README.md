# CycloneDX schemas

Vendored so `sbom-cyclonedx.spec.ts` validates against the real specification
without a network call. Copied verbatim from

- https://raw.githubusercontent.com/CycloneDX/specification/master/schema/bom-1.5.schema.json
- https://raw.githubusercontent.com/CycloneDX/specification/master/schema/spdx.schema.json
- https://raw.githubusercontent.com/CycloneDX/specification/master/schema/jsf-0.82.schema.json

The two smaller files are referenced by the 1.5 schema through `$ref`; ajv
cannot compile `bom-1.5.schema.json` without them.

**Do not edit these.** They are upstream artifacts; any change here would make
the test assert against something other than the standard.
