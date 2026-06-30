import { describe, expect, it } from "vitest"
import {
	TEMPORARY_SUPER_MAGIC_MODE_DIAG,
	getTemporarySuperMagicModeDiagnostics,
	hasTemporarySuperMagicModeDiagnostic,
} from "../superMagicModeTemporaryDiagnostics"

describe("superMagicModeTemporaryDiagnostics", () => {
	it("parses supported diagnostics from query search", () => {
		const diagnostics = getTemporarySuperMagicModeDiagnostics(
			"?__smModeDiag=skip-storage,skip-persist&__smModeDiag=skip-default-model",
		)

		expect(diagnostics).toEqual([
			TEMPORARY_SUPER_MAGIC_MODE_DIAG.SkipStorage,
			TEMPORARY_SUPER_MAGIC_MODE_DIAG.SkipPersist,
			TEMPORARY_SUPER_MAGIC_MODE_DIAG.SkipDefaultModel,
		])
	})

	it("ignores unknown diagnostics and reports active supported values", () => {
		const search = "?__smModeDiag=skip-bootstrap,unknown"

		expect(
			hasTemporarySuperMagicModeDiagnostic(
				TEMPORARY_SUPER_MAGIC_MODE_DIAG.SkipBootstrap,
				search,
			),
		).toBe(true)
		expect(
			hasTemporarySuperMagicModeDiagnostic(
				TEMPORARY_SUPER_MAGIC_MODE_DIAG.SkipPersist,
				search,
			),
		).toBe(false)
	})
})
