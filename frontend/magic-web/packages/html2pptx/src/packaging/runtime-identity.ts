import type { PackagingRuntimeIdentity } from "./streaming-types"

export const PACKAGING_RUNTIME_IDENTITY_MISMATCH_CODE =
	"PACKAGING_RUNTIME_IDENTITY_MISMATCH"
export const PACKAGING_RUNTIME_IDENTITY_CAPABILITY = "worker-protocol"

const IDENTITY_FIELDS = [
	"protocolVersion",
	"edition",
	"html2pptxVersion",
	"buildId",
	"pptxgenjsVersion",
	"sourceCommit",
	"artifactHash",
] as const satisfies readonly (keyof PackagingRuntimeIdentity)[]

/** A structured error that can safely cross the Packaging Worker boundary. */
export class PackagingRuntimeIdentityMismatchError extends Error {
	readonly code = PACKAGING_RUNTIME_IDENTITY_MISMATCH_CODE
	readonly capability = PACKAGING_RUNTIME_IDENTITY_CAPABILITY

	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = "PackagingRuntimeIdentityMismatchError"
	}
}

/**
 * The identity is replaced by Vite's `define` in both the main bundle and the
 * Worker bundle. Keeping the source module free of commit/hash literals avoids
 * accidentally making the artifact hash self-referential.
 */
export const PACKAGING_RUNTIME_IDENTITY: PackagingRuntimeIdentity =
	readInjectedRuntimeIdentity()

export function validatePackagingRuntimeIdentity(
	value: unknown,
	label = "Packaging runtime identity",
): PackagingRuntimeIdentity {
	if (!isRecord(value)) throw identityMismatch(`${label} must be an object`)

	if (value.protocolVersion !== 2) {
		throw identityMismatch(`${label}.protocolVersion must equal 2`)
	}
	if (value.edition !== "open" && value.edition !== "enterprise") {
		throw identityMismatch(`${label}.edition must be \"open\" or \"enterprise\"`)
	}
	const html2pptxVersion = requireIdentityString(value.html2pptxVersion, label, "html2pptxVersion")
	const buildId = requireIdentityString(value.buildId, label, "buildId")
	const pptxgenjsVersion = requireIdentityString(
		value.pptxgenjsVersion,
		label,
		"pptxgenjsVersion",
	)
	const sourceCommit = requireIdentityString(value.sourceCommit, label, "sourceCommit")
	if (
		typeof value.artifactHash !== "string" ||
		!/^sha256:[0-9a-f]{64}$/.test(value.artifactHash)
	) {
		throw identityMismatch(
			`${label}.artifactHash must match sha256:<64 lowercase hexadecimal characters>`,
		)
	}

	return Object.freeze({
		protocolVersion: 2,
		edition: value.edition,
		html2pptxVersion,
		buildId,
		pptxgenjsVersion,
		sourceCommit,
		artifactHash: value.artifactHash,
	})
}

/** Validate and compare every identity field, rejecting stale Worker builds. */
export function assertPackagingRuntimeIdentityMatch(
	value: unknown,
	expected: PackagingRuntimeIdentity = PACKAGING_RUNTIME_IDENTITY,
	label = "Packaging runtime identity",
): PackagingRuntimeIdentity {
	const actual = validatePackagingRuntimeIdentity(value, label)
	for (const field of IDENTITY_FIELDS) {
		if (actual[field] !== expected[field]) {
			throw identityMismatch(
				`${label}.${field} does not match the local runtime (received ${String(actual[field])}, expected ${String(expected[field])})`,
			)
		}
	}
	return actual
}

export function isPackagingRuntimeIdentityMismatch(error: unknown): boolean {
	return (
		error instanceof PackagingRuntimeIdentityMismatchError ||
		(isRecord(error) && error.code === PACKAGING_RUNTIME_IDENTITY_MISMATCH_CODE)
	)
}

function identityMismatch(message: string): PackagingRuntimeIdentityMismatchError {
	return new PackagingRuntimeIdentityMismatchError(message)
}

function requireIdentityString(value: unknown, label: string, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw identityMismatch(`${label}.${field} must be a non-empty string`)
	}
	return value
}

function readInjectedRuntimeIdentity(): PackagingRuntimeIdentity {
	const injected =
		typeof __HTML2PPTX_RUNTIME_IDENTITY__ === "undefined"
			? undefined
			: __HTML2PPTX_RUNTIME_IDENTITY__
	if (injected === undefined) {
		throw new Error(
			"html2pptx runtime identity was not injected; use the Vite/Vitest package configuration",
		)
	}
	return validatePackagingRuntimeIdentity(injected, "Injected packaging runtime identity")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
