import { execFileSync } from "node:child_process";
import fs, { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
//#region scripts/release/image-reference.ts
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
function looksLikeHost(segment) {
	return segment === "localhost" || segment.includes(".") || segment.includes(":");
}
/**
* Splits a reference into registry, repository, tag and digest.
*
* Throws on anything that cannot be resolved unambiguously, because a gate that
* measures the wrong image and reports PASS is worse than one that stops.
*/
function parseImageReference(value) {
	const trimmed = value.trim();
	if (trimmed === "") throw new Error("Image reference is empty.");
	let rest = trimmed;
	let digest;
	const atIndex = rest.indexOf("@");
	if (atIndex >= 0) {
		digest = rest.slice(atIndex + 1);
		rest = rest.slice(0, atIndex);
		if (!DIGEST_PATTERN.test(digest)) throw new Error(`Image reference "${value}" has a digest that is not sha256:<64 hex>: "${digest}".`);
	}
	let tag;
	const lastSlash = rest.lastIndexOf("/");
	const lastColon = rest.lastIndexOf(":");
	if (lastColon > lastSlash) {
		tag = rest.slice(lastColon + 1);
		rest = rest.slice(0, lastColon);
		if (tag === "") throw new Error(`Image reference "${value}" ends with an empty tag.`);
	}
	const segments = rest.split("/");
	let registry = "";
	if (segments.length > 1 && looksLikeHost(segments[0])) registry = segments.shift();
	const repository = segments.join("/");
	if (repository === "" || repository.endsWith("/")) throw new Error(`Image reference "${value}" has no repository path.`);
	return {
		registry,
		repository,
		...tag !== void 0 ? { tag } : {},
		...digest !== void 0 ? { digest } : {},
		name: registry === "" ? repository : `${registry}/${repository}`
	};
}
/**
* The reference with any tag removed and the digest pinned.
*
* This is the form used to measure: `repo@sha256:…` cannot be repointed, so the
* bytes measured are the bytes that were built.
*/
function pinToDigest(reference, digest) {
	if (!DIGEST_PATTERN.test(digest)) throw new Error(`Cannot pin to a digest that is not sha256:<64 hex>: "${digest}".`);
	return `${reference.name}@${digest}`;
}
//#endregion
//#region scripts/release/image-size-gate.ts
/**
* The image size gate.
*
* `admin-image.yml` used to read the image size from
* `docker buildx imagetools inspect --format '{{json .Manifest}}'`. That
* template does not return an OCI manifest — it returns only
* `{ mediaType, digest, size }`, the descriptor of the manifest *itself*.
* `(m.layers || [])` was therefore always the empty array, the computed size
* was always 0.0 MB, and the gate passed on every build no matter how large
* the image grew. The observed CI line
* `image size: 0.0 MB (budget 120 MB)` was this defect, not a genuinely small
* image.
*
* This module replaces that expression with an explicit resolver:
*
*   1. Accept either an OCI image manifest or an OCI image index. An index is
*      resolved by selecting exactly one platform; picking a single platform
*      is what makes a multi-platform index report one architecture's size.
*   2. Validate every media type before reading anything out of it, so a
*      registry that returns a manifest list where a manifest was expected —
*      or the reverse — fails instead of silently producing a number.
*   3. Refuse an empty layer list. An image with no layers is not a valid
*      image, and treating it as 0 bytes is precisely the fail-open behaviour
*      being removed.
*   4. Verify each layer's size is a non-negative integer and that the total
*      is non-zero.
*
* Anything this module cannot measure is reported as a failure with a reason,
* never as zero.
*/
/** OCI image manifest media type. */
const OCI_IMAGE_MANIFEST = "application/vnd.oci.image.manifest.v1+json";
/** OCI image index media type. */
const OCI_IMAGE_INDEX = "application/vnd.oci.image.index.v1+json";
/** Docker schema 2 manifest media type, still emitted by some registries. */
const DOCKER_IMAGE_MANIFEST = "application/vnd.docker.distribution.manifest.v2+json";
/** Docker schema 2 manifest list media type. */
const DOCKER_MANIFEST_LIST = "application/vnd.docker.distribution.manifest.list.v2+json";
const MANIFEST_TYPES = /* @__PURE__ */ new Set([OCI_IMAGE_MANIFEST, DOCKER_IMAGE_MANIFEST]);
const INDEX_TYPES = /* @__PURE__ */ new Set([OCI_IMAGE_INDEX, DOCKER_MANIFEST_LIST]);
const DEFAULT_PLATFORM = {
	os: "linux",
	architecture: "amd64"
};
/**
* Parses a descriptor's `size` field. A missing, negative, non-integer, or
* non-finite size is a failure, not a zero: an unreadable layer is exactly the
* case the old gate turned into a pass.
*/
function readSize(value, label, problems) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		problems.push(`${label}: size is not a finite number (got ${typeof value})`);
		return;
	}
	if (!Number.isInteger(value)) {
		problems.push(`${label}: size is not an integer (${value})`);
		return;
	}
	if (value < 0) {
		problems.push(`${label}: size is negative (${value})`);
		return;
	}
	return value;
}
function platformMatches(candidate, target) {
	if (!candidate) return false;
	if (candidate.os !== target.os) return false;
	if (candidate.architecture !== target.architecture) return false;
	if (target.variant !== void 0 && candidate.variant !== target.variant) return false;
	return true;
}
function formatPlatform(platform) {
	return `${platform.os}/${platform.architecture}${platform.variant ? `/${platform.variant}` : ""}`;
}
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/**
* Measures an image's compressed size from a parsed registry document.
*
* `document` is whatever the registry returned after Accept negotiation: an
* image manifest, an image index (multi-platform), or a malformed value.
* `resolveIndex` is called when an index must be followed to its per-platform
* manifest descriptor; the caller performs the fetch because this module does
* no I/O.
*/
async function measureImageSize(document, options = {}) {
	const platform = options.platform ?? DEFAULT_PLATFORM;
	if (!isRecord(document)) return {
		ok: false,
		reason: "manifest-not-an-object",
		problems: [`manifest is not an object (got ${typeof document})`]
	};
	const mediaType = typeof document.mediaType === "string" ? document.mediaType : void 0;
	if (mediaType === void 0) return {
		ok: false,
		reason: "missing-media-type",
		problems: ["manifest has no mediaType, so its shape cannot be trusted"]
	};
	if (INDEX_TYPES.has(mediaType)) return resolveIndexDocument(document, mediaType, platform, options);
	if (!MANIFEST_TYPES.has(mediaType)) return {
		ok: false,
		reason: "unsupported-media-type",
		problems: [`unsupported media type: ${mediaType}`]
	};
	return measureManifest(document, mediaType, platform, options.digest);
}
async function resolveIndexDocument(document, mediaType, platform, options) {
	const manifests = document.manifests;
	if (!Array.isArray(manifests) || manifests.length === 0) return {
		ok: false,
		reason: "index-without-manifests",
		problems: [`index ${mediaType} has no manifests array`]
	};
	const entries = manifests.filter(isRecord);
	const matched = entries.filter((descriptor) => platformMatches(descriptor.platform, platform));
	if (matched.length === 0) {
		const available = entries.map((descriptor) => `${descriptor.platform?.os ?? "?"}/${descriptor.platform?.architecture ?? "?"}`).join(", ");
		return {
			ok: false,
			reason: "platform-not-found",
			problems: [`index does not contain ${formatPlatform(platform)}; it offers: ${available || "nothing"}`]
		};
	}
	if (matched.length > 1) return {
		ok: false,
		reason: "ambiguous-platform",
		problems: [`index contains ${matched.length} entries for ${formatPlatform(platform)}; refusing to guess`]
	};
	const target = matched[0];
	if (!options.resolveIndex) return {
		ok: false,
		reason: "index-needs-resolution",
		problems: [`manifest for ${formatPlatform(platform)} is an index entry; a resolver is required to read its layers`]
	};
	const nested = await measureImageSize(await options.resolveIndex(target), {
		platform,
		digest: target.digest
	});
	if (!nested.ok) return nested;
	return {
		...nested,
		resolvedFromIndex: true,
		digest: target.digest ?? nested.digest
	};
}
function measureManifest(document, mediaType, platform, digest) {
	const layers = document.layers;
	if (!Array.isArray(layers)) return {
		ok: false,
		reason: "manifest-without-layers",
		problems: [`manifest ${mediaType} has no layers array; the descriptor returned by \`imagetools inspect --format {{json .Manifest}}\` has this shape and is not the image itself`]
	};
	if (layers.length === 0) return {
		ok: false,
		reason: "empty-layers",
		problems: ["manifest has an empty layers array; an image with no layers is not measurable"]
	};
	const problems = [];
	const measured = [];
	let total = 0;
	layers.forEach((layer, index) => {
		const label = `layers[${index}]`;
		if (!isRecord(layer)) {
			problems.push(`${label}: not an object`);
			return;
		}
		const layerMediaType = typeof layer.mediaType === "string" ? layer.mediaType : "";
		const layerDigest = typeof layer.digest === "string" ? layer.digest : "";
		if (layerMediaType === "") problems.push(`${label}: mediaType is missing`);
		if (!/^sha256:[0-9a-f]{64}$/.test(layerDigest)) problems.push(`${label}: digest is not a sha256:<64 hex> value`);
		const size = readSize(layer.size, label, problems);
		if (size === void 0) return;
		total += size;
		measured.push({
			mediaType: layerMediaType,
			digest: layerDigest,
			size
		});
	});
	if (problems.length > 0) return {
		ok: false,
		reason: "invalid-layers",
		problems
	};
	if (total <= 0) return {
		ok: false,
		reason: "zero-size",
		problems: ["every layer reports 0 bytes; a zero total is not a valid measurement"]
	};
	const manifestDigest = digest ?? (typeof document.digest === "string" ? document.digest : "");
	return {
		ok: true,
		bytes: total,
		digest: manifestDigest,
		layerCount: measured.length,
		platform,
		resolvedFromIndex: false,
		layers: measured
	};
}
/**
* Applies a megabyte budget to a measurement.
*
* A failure to measure is a failure to pass: the caller must never treat an
* unreadable image as small.
*/
function evaluateBudget(result, budgetMb) {
	if (!result.ok) return {
		ok: false,
		bytes: 0,
		mb: 0,
		budgetMb,
		problems: [`size is UNMEASURED (${result.reason}): ${result.problems.join("; ")}`]
	};
	if (!Number.isFinite(budgetMb) || budgetMb <= 0) return {
		ok: false,
		bytes: result.bytes,
		mb: result.bytes / 1024 / 1024,
		budgetMb,
		problems: [`budget is not a positive number (got ${budgetMb})`]
	};
	const mb = result.bytes / 1024 / 1024;
	const withinBudget = mb <= budgetMb;
	return {
		ok: withinBudget,
		bytes: result.bytes,
		mb,
		budgetMb,
		problems: withinBudget ? [] : [`image is ${mb.toFixed(1)} MB, over the ${budgetMb} MB budget`]
	};
}
/** Parses `linux/amd64` or `linux/arm64/v8` into the shape the resolver compares. */
function parsePlatform(value) {
	const [os, architecture, variant] = value.split("/");
	if (!os || !architecture) throw new Error(`Invalid platform "${value}"; expected os/architecture[/variant]`);
	return variant ? {
		os,
		architecture,
		variant
	} : {
		os,
		architecture
	};
}
/** Renders the measurement and the budget outcome as a job-summary table. */
function renderSummary(result, evaluation, options = {}) {
	const lines = [];
	lines.push("### Image size");
	lines.push("");
	lines.push("| field | value |");
	lines.push("| --- | --- |");
	if (options.reference) lines.push(`| image | \`${options.reference}\` |`);
	if (result.ok) {
		lines.push(`| platform | ${formatPlatform(result.platform)} |`);
		lines.push(`| platform manifest digest | \`${options.digest || result.digest || "unknown"}\` |`);
		if (options.indexResolved && options.indexDigest) lines.push(`| index digest | \`${options.indexDigest}\` |`);
		lines.push(`| layers | ${result.layerCount} |`);
		lines.push(`| size | ${evaluation.mb.toFixed(1)} MB (${evaluation.bytes} B) |`);
		lines.push(`| resolved from index | ${result.resolvedFromIndex ? "yes" : "no"} |`);
	} else {
		lines.push(`| size | UNMEASURED — ${result.reason} |`);
		lines.push(`| problems | ${result.problems.map((problem) => `\`${problem}\``).join("<br>")} |`);
	}
	lines.push(`| budget | ${evaluation.budgetMb} MB |`);
	lines.push(`| result | ${evaluation.ok ? "PASS" : "FAIL"} |`);
	if (evaluation.problems.length > 0) {
		lines.push("");
		for (const problem of evaluation.problems) lines.push(`- ${problem}`);
	}
	return `${lines.join("\n")}\n`;
}
/**
* Measures an image, pinning every fetch to a digest.
*
* Separated from `main` so the pinning rules are testable without a registry:
* the function takes the two registry operations as arguments.
*/
async function measurePinned(options) {
	const parsed = parseImageReference(options.reference);
	if (parsed.digest && options.knownDigest && parsed.digest !== options.knownDigest) throw new Error(`The reference names digest ${parsed.digest} but the caller supplied ${options.knownDigest}; refusing to measure either.`);
	let referenceDigest;
	if (parsed.digest) referenceDigest = parsed.digest;
	else {
		const resolved = options.resolveDigest(options.reference);
		if (resolved === "") throw new Error(`Could not resolve "${options.reference}" to a digest; refusing to measure a moving tag.`);
		if (options.knownDigest && resolved !== options.knownDigest) throw new Error(`"${options.reference}" resolves to ${resolved}, but the build produced ${options.knownDigest}. The tag moved between the build and the measurement.`);
		referenceDigest = resolved;
	}
	const pinned = pinToDigest(parsed, referenceDigest);
	const document = options.fetchRaw(pinned);
	let indexDigest;
	const result = await measureImageSize(document, {
		platform: options.platform,
		digest: referenceDigest,
		resolveIndex: (descriptor) => {
			if (!descriptor.digest) throw new Error("Index entry has no digest, so it cannot be resolved.");
			indexDigest = referenceDigest;
			return options.fetchRaw(pinToDigest(parsed, descriptor.digest));
		}
	});
	return {
		result,
		measuredDigest: result.ok ? result.digest : referenceDigest,
		referenceDigest,
		indexResolved: indexDigest !== void 0
	};
}
//#endregion
//#region scripts/release/image-size-gate-cli.ts
/**
* CLI for the image size gate.
*
* ## Why this file is bundled before CI runs it
*
* The first version was invoked as `node --import tsx scripts/…-cli.ts` from
* `admin-image.yml`. That job never runs `pnpm install` — it builds an image,
* not the repository — so `tsx` was not resolvable and the gate died with
* `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'` before measuring anything.
* A gate that cannot start is a gate that does not run, which is the same
* outcome as the `0.0 MB` bug it replaced.
*
* The fix keeps the TypeScript source (typed, unit-tested) and adds a build
* step that bundles it into `scripts/release/image-size-gate.mjs`: a single
* file whose only imports are `node:` builtins. `admin-image.yml` runs that
* file with the Node already on the runner. No package install, no version
* drift, no download at run time.
*
*   pnpm build:image-gate     # regenerate the bundle after editing this file
*
* `scripts/release/__tests__/image-size-gate-bundle.spec.ts` asserts the
* bundle exists, imports nothing but `node:`, and matches the current source,
* so a stale bundle fails the test suite rather than production.
*
* ## Input modes
*
*   --manifest <path>   a local JSON file already fetched from the registry
*   --reference <ref>   a registry reference; the manifest is fetched with
*                       `docker buildx imagetools inspect --raw`, which returns
*                       the real manifest body rather than a descriptor.
*   --digest <sha256:…> the digest the caller already knows (the build job has
*                       it in `steps.build.outputs.digest`). Strongly preferred:
*                       it pins the measurement to the bytes that were built.
*
* ## Pinning
*
* A tag can be repointed between the build and the measurement, so a report
* that only names a tag can describe a different image than the one measured.
* With `--reference`, the flow is:
*
*   1. resolve the tag to a digest once;
*   2. when `--digest` is also given, require the two to agree — a mismatch is
*      a failure, never a silent fallback to either one;
*   3. fetch and measure `name@digest` from then on.
*
* An index is resolved by selecting exactly one platform, and both the index
* digest and the platform manifest digest are reported.
*/
function parseArgs(argv) {
	const options = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith("--")) continue;
		const name = arg.slice(2);
		if (name === "json") {
			options.json = true;
			continue;
		}
		const value = argv[index + 1];
		if (value === void 0 || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
		options[name] = value;
		index += 1;
	}
	const budgetRaw = String(options["budget-mb"] ?? "120");
	const budgetMb = Number(budgetRaw);
	if (!Number.isFinite(budgetMb) || budgetMb <= 0) throw new Error(`--budget-mb must be a positive number (got "${budgetRaw}")`);
	return {
		manifest: options.manifest ? String(options.manifest) : void 0,
		reference: options.reference ? String(options.reference) : void 0,
		digest: options.digest ? String(options.digest) : void 0,
		platform: String(options.platform ?? "linux/amd64"),
		budgetMb,
		summaryFile: options["summary-file"] ? String(options["summary-file"]) : void 0,
		json: Boolean(options.json)
	};
}
function inspectRaw(reference) {
	const output = execFileSync("docker", [
		"buildx",
		"imagetools",
		"inspect",
		"--raw",
		reference
	], {
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024
	});
	return JSON.parse(output);
}
/**
* Reads the digest a reference currently resolves to.
*
* `--raw` returns the manifest body, which cannot contain its own digest: a
* registry addresses a manifest *by* that digest. The digest therefore comes
* from the non-raw inspection, whose `Digest:` line is the resolved manifest.
*/
function resolveDigest(reference) {
	const output = execFileSync("docker", [
		"buildx",
		"imagetools",
		"inspect",
		reference
	], { encoding: "utf8" });
	return /^Digest:\s+(sha256:[0-9a-f]{64})\s*$/m.exec(output)?.[1] ?? "";
}
async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (!options.manifest && !options.reference) throw new Error("Pass --manifest <path> or --reference <registry-ref>.");
	const platform = parsePlatform(options.platform);
	let result;
	let measuredDigest = "";
	let referenceDigest = "";
	let indexResolved = false;
	let referenceLabel = "";
	try {
		if (options.manifest) {
			result = await measureImageSize(JSON.parse(fs.readFileSync(options.manifest, "utf8")), {
				platform,
				...options.digest ? { digest: options.digest } : {}
			});
			measuredDigest = options.digest ?? (result.ok ? result.digest : "");
			referenceDigest = measuredDigest;
		} else {
			const reference = options.reference;
			const pinned = await measurePinned({
				reference,
				...options.digest ? { knownDigest: options.digest } : {},
				platform,
				fetchRaw: inspectRaw,
				resolveDigest
			});
			result = pinned.result;
			measuredDigest = pinned.measuredDigest;
			referenceDigest = pinned.referenceDigest;
			indexResolved = pinned.indexResolved;
			referenceLabel = reference;
		}
	} catch (error) {
		result = {
			ok: false,
			reason: "resolution-failed",
			problems: [error instanceof Error ? error.message : String(error)]
		};
	}
	const evaluation = evaluateBudget(result, options.budgetMb);
	const summary = renderSummary(result, evaluation, {
		...referenceLabel ? { reference: referenceLabel } : {},
		...measuredDigest ? { digest: measuredDigest } : {},
		...referenceDigest && referenceDigest !== measuredDigest ? { indexDigest: referenceDigest } : {},
		indexResolved
	});
	if (options.json) console.log(JSON.stringify({
		measurement: result,
		evaluation,
		digest: {
			measured: measuredDigest,
			reference: referenceDigest
		},
		indexResolved
	}, null, 2));
	else {
		console.log(result.ok ? `image size: ${evaluation.mb.toFixed(1)} MB (budget ${evaluation.budgetMb} MB)` : `image size: UNMEASURED — ${result.reason}`);
		if (measuredDigest) console.log(indexResolved ? `index digest: ${referenceDigest}\nplatform digest: ${measuredDigest}` : `digest: ${measuredDigest}`);
		for (const problem of evaluation.problems) console.error(problem);
	}
	if (options.summaryFile) fs.appendFileSync(options.summaryFile, `\n${summary}`);
	if (!evaluation.ok) {
		if (result.ok) console.error(`::error::image is ${evaluation.mb.toFixed(1)} MB, over the ${evaluation.budgetMb} MB budget`);
		else console.error(`::error::image size could not be measured (${result.reason}); refusing to pass`);
		process.exitCode = 1;
	}
}
/**
* Runs only when this file is the process entry point.
*
* The bundle is a CLI, but it is still a module: importing it must not start a
* measurement. The test suite imports the source and the bundle checks import
* the built file, so a bare `void main()` would make an import exit the process
* with a usage error.
*/
function isMain() {
	const entry = process.argv[1];
	if (!entry) return false;
	try {
		return import.meta.url === pathToFileURL(realpathSync(entry)).href;
	} catch {
		return false;
	}
}
if (isMain()) main().catch((error) => {
	console.error(`image-size-gate: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
});
//#endregion
export {};
