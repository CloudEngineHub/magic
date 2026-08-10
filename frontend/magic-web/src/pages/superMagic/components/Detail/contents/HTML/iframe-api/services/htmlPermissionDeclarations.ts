import { USER_INFO_SCOPES, type HTMLAppConfig, type HtmlPermissionScope } from "../types"
import { isSupportedHtmlPermissionScope } from "./htmlPermissionPolicy"

export type HtmlPermissionDiagnosticCode =
	| "manifestAbsent"
	| "manifestLoadError"
	| "scopesInvalid"
	| "scopeInvalid"
	| "scopeDuplicate"
	| "scopeUnsupported"

export interface HtmlPermissionDiagnostic {
	code: HtmlPermissionDiagnosticCode
	scope?: string
	error?: string
}

export interface HtmlPermissionDeclarationAnalysis {
	declaredScopes: HtmlPermissionScope[]
	unsupportedScopes: string[]
	diagnostics: HtmlPermissionDiagnostic[]
}

export function createEmptyHtmlPermissionDeclaration(): HtmlPermissionDeclarationAnalysis {
	return { declaredScopes: [], unsupportedScopes: [], diagnostics: [] }
}

export function hasManageableHtmlPermissionDeclarations(appConfig: HTMLAppConfig | null): boolean {
	const declaration = analyzeHtmlPermissionDeclarations(appConfig)
	return declaration.declaredScopes.length > 0 || declaration.unsupportedScopes.length > 0
}

export function analyzeHtmlPermissionDeclarations(
	appConfig: HTMLAppConfig | null,
): HtmlPermissionDeclarationAnalysis {
	if (!appConfig) return createEmptyHtmlPermissionDeclaration()

	const declaredScopes: HtmlPermissionScope[] = []
	const unsupportedScopes: string[] = []
	const diagnostics: HtmlPermissionDiagnostic[] = []
	const seen = new Set<string>()

	const collect = (rawScopes: unknown, allowDisplayScope = false) => {
		if (rawScopes === undefined) return
		if (!Array.isArray(rawScopes)) {
			diagnostics.push({ code: "scopesInvalid" })
			return
		}
		for (const rawScope of rawScopes) {
			if (typeof rawScope !== "string") {
				diagnostics.push({ code: "scopeInvalid" })
				continue
			}
			if (allowDisplayScope && rawScope === USER_INFO_SCOPES.DISPLAY) continue
			if (seen.has(rawScope)) {
				diagnostics.push({ code: "scopeDuplicate", scope: rawScope })
				continue
			}
			seen.add(rawScope)
			if (isSupportedHtmlPermissionScope(rawScope)) {
				declaredScopes.push(rawScope)
			} else {
				unsupportedScopes.push(rawScope)
				diagnostics.push({ code: "scopeUnsupported", scope: rawScope })
			}
		}
	}

	collect((appConfig.permissions as { scopes?: unknown } | undefined)?.scopes)
	collect((appConfig.permissions?.userInfo as { scopes?: unknown } | undefined)?.scopes, true)
	return { declaredScopes, unsupportedScopes, diagnostics }
}
