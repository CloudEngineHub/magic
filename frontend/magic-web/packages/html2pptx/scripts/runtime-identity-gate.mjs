import { execFileSync } from "node:child_process"

export const RUNTIME_IDENTITY_FIELDS = [
	"protocolVersion",
	"edition",
	"html2pptxVersion",
	"buildId",
	"pptxgenjsVersion",
	"sourceCommit",
	"artifactHash",
]

/**
 * Extract the literal identity injected by Vite from a built entry/Worker.
 * The pattern deliberately requires all fields in the protocol order emitted
 * by runtime-identity.ts, so validation cannot accidentally match a partial
 * object from the runtime's defensive parser.
 */
export function extractRuntimeIdentity(source, file = "built runtime") {
	const match = source.match(
		/protocolVersion\s*:\s*2\s*,\s*edition\s*:\s*["'](open|enterprise)["']\s*,\s*html2pptxVersion\s*:\s*["']([^"']+)["']\s*,\s*buildId\s*:\s*["']([^"']+)["']\s*,\s*pptxgenjsVersion\s*:\s*["']([^"']+)["']\s*,\s*sourceCommit\s*:\s*["']([^"']+)["']\s*,\s*artifactHash\s*:\s*["'](sha256:[0-9a-f]{64})["']/s,
	)
	if (!match) throw new Error(`${file}: injected Packaging runtime identity is missing or malformed`)

	return {
		protocolVersion: 2,
		edition: match[1],
		html2pptxVersion: match[2],
		buildId: match[3],
		pptxgenjsVersion: match[4],
		sourceCommit: match[5],
		artifactHash: match[6],
	}
}

export function validateRuntimeIdentity(
	identity,
	{
		file = "built runtime",
		expected = {},
	} = {},
) {
	if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
		throw new Error(`${file}: runtime identity must be an object`)
	}
	if (identity.protocolVersion !== 2) {
		throw new Error(`${file}: runtime identity protocolVersion must be 2; found ${String(identity.protocolVersion)}`)
	}
	if (identity.edition !== "open" && identity.edition !== "enterprise") {
		throw new Error(`${file}: runtime identity edition is invalid; found ${String(identity.edition)}`)
	}
	for (const field of [
		"html2pptxVersion",
		"buildId",
		"pptxgenjsVersion",
		"sourceCommit",
	]) {
		if (typeof identity[field] !== "string" || identity[field].length === 0) {
			throw new Error(`${file}: runtime identity ${field} must be a non-empty string`)
		}
	}
	if (!/^sha256:[0-9a-f]{64}$/.test(identity.artifactHash ?? "")) {
		throw new Error(`${file}: runtime identity artifactHash must match sha256:<64 lowercase hexadecimal characters>`)
	}

	for (const field of RUNTIME_IDENTITY_FIELDS) {
		if (expected[field] !== undefined && identity[field] !== expected[field]) {
			throw new Error(
				`${file}: runtime identity ${field} must be ${String(expected[field])}; found ${String(identity[field])}`,
			)
		}
	}
	return identity
}

export function assertRuntimeIdentityEqual(reference, actual, { referenceFile, actualFile } = {}) {
	for (const field of RUNTIME_IDENTITY_FIELDS) {
		if (reference[field] !== actual[field]) {
			throw new Error(
				`${actualFile ?? "built runtime"}: runtime identity ${field} differs from ${referenceFile ?? "reference runtime"}; expected ${String(reference[field])}, found ${String(actual[field])}`,
			)
		}
	}
}

export function deriveExpectedBuildId(appRoot, environment = process.env) {
	for (const value of [environment.HTML2PPTX_BUILD_ID, environment.MAGIC_BUILD_ID]) {
		if (typeof value === "string" && value.trim()) return value.trim()
	}
	try {
		const commit = execFileSync("git", ["-C", appRoot, "rev-parse", "HEAD"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		})
		return commit.trim() || undefined
	} catch {
		return undefined
	}
}

export function buildExpectedRuntimeIdentity({
	edition,
	html2pptxVersion,
	pptxgenjsVersion,
	sourceCommit,
	artifactHash,
	buildId,
}) {
	const normalizedArtifactHash =
		typeof artifactHash === "string" ? artifactHash.replace(/^sha256:/, "") : artifactHash
	return {
		protocolVersion: 2,
		edition,
		html2pptxVersion,
		...(buildId === undefined ? {} : { buildId }),
		pptxgenjsVersion,
		sourceCommit,
		artifactHash:
			normalizedArtifactHash === undefined
				? undefined
				: `sha256:${normalizedArtifactHash}`,
	}
}
