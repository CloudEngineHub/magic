export type ExportFidelityFailureKind = "script" | "render-timeout" | "capture"

/**
 * A fidelity failure means continuing would produce a PPTX with missing or incomplete content.
 * These errors must abort the whole export even when callers allow ordinary failed pages to be
 * skipped, otherwise a large batch can appear successful while silently dropping charts.
 */
export class ExportFidelityError extends Error {
	readonly code = "HTML2PPTX_FIDELITY_FAILURE"
	readonly fatal = true

	constructor(
		message: string,
		readonly kind: ExportFidelityFailureKind,
		readonly sourceError?: unknown,
		readonly targets: readonly string[] = [],
	) {
		super(message)
		this.name = "ExportFidelityError"
	}
}

export function isExportFidelityError(error: unknown): error is ExportFidelityError {
	if (error instanceof ExportFidelityError) return true
	if (!error || typeof error !== "object" || !("code" in error)) return false
	return (error as { code?: unknown }).code === "HTML2PPTX_FIDELITY_FAILURE"
}
