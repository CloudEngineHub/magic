/**
 * TEMPORARY_SUPER_MAGIC_MODE_DIAGNOSTICS
 *
 * Safari 18.6 production crash probe. Remove this file and every import/use of
 * TEMPORARY_SUPER_MAGIC_MODE_DIAG after the online validation finishes.
 */
export const TEMPORARY_SUPER_MAGIC_MODE_DIAG_QUERY_KEY = "__smModeDiag"

export const TEMPORARY_SUPER_MAGIC_MODE_DIAG = {
	SkipBootstrap: "skip-bootstrap",
	SkipStorage: "skip-storage",
	SkipDefaultModel: "skip-default-model",
	SkipPersist: "skip-persist",
} as const

export type TemporarySuperMagicModeDiagnostic =
	(typeof TEMPORARY_SUPER_MAGIC_MODE_DIAG)[keyof typeof TEMPORARY_SUPER_MAGIC_MODE_DIAG]

const SUPPORTED_DIAGNOSTICS = new Set<string>(Object.values(TEMPORARY_SUPER_MAGIC_MODE_DIAG))

function getCurrentSearch() {
	if (typeof window === "undefined") return ""
	return window.location.search
}

function normalizeDiagnosticValues(values: string[]): TemporarySuperMagicModeDiagnostic[] {
	const diagnostics: TemporarySuperMagicModeDiagnostic[] = []
	const seen = new Set<string>()

	values
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.forEach((value) => {
			if (!SUPPORTED_DIAGNOSTICS.has(value) || seen.has(value)) return
			seen.add(value)
			diagnostics.push(value as TemporarySuperMagicModeDiagnostic)
		})

	return diagnostics
}

export function getTemporarySuperMagicModeDiagnostics(
	search = getCurrentSearch(),
): TemporarySuperMagicModeDiagnostic[] {
	try {
		const params = new URLSearchParams(search)
		return normalizeDiagnosticValues(params.getAll(TEMPORARY_SUPER_MAGIC_MODE_DIAG_QUERY_KEY))
	} catch {
		return []
	}
}

export function hasTemporarySuperMagicModeDiagnostic(
	diagnostic: TemporarySuperMagicModeDiagnostic,
	search = getCurrentSearch(),
) {
	return getTemporarySuperMagicModeDiagnostics(search).includes(diagnostic)
}

export function hasAnyTemporarySuperMagicModeDiagnostic(search = getCurrentSearch()) {
	return getTemporarySuperMagicModeDiagnostics(search).length > 0
}
