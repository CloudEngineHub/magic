import { HTML_PERMISSION_SCOPES, type HtmlPermissionScope } from "../types"

const MINUTE_MS = 60 * 1000

export type HtmlPermissionMode = "manifest" | "legacy"

export interface HtmlPermissionTtlOption {
	labelKey: string
	ttlMs: number
}

export const SUPPORTED_HTML_PERMISSION_SCOPES = Object.values(HTML_PERMISSION_SCOPES)
const SUPPORTED_SCOPE_SET = new Set<string>(SUPPORTED_HTML_PERMISSION_SCOPES)

const MANIFEST_TTL_OPTIONS: Record<HtmlPermissionScope, HtmlPermissionTtlOption[]> = {
	"llm.use": longTtlOptions(),
	"project.message.write": ttlOptions([5, 10, 15, 30, 60]),
	"project.files.upload": longTtlOptions(),
	"project.files.download": longTtlOptions(),
	"fs.project.read": longTtlOptions(),
	"fs.project.write": [
		{ labelKey: "htmlEditor.permissionAuthorizationConfirm.ttl.once", ttlMs: 0 },
		...ttlOptions([5, 10, 30, 60]),
		...hourOptions([2, 4, 8, 12]),
	],
	"user.profile.name": longTtlOptions(),
	"user.profile.identity": longTtlOptions(),
	"user.profile.organization": longTtlOptions(),
}

const LEGACY_TTL_OPTIONS: Record<HtmlPermissionScope, HtmlPermissionTtlOption[]> = {
	"llm.use": ttlOptions([5, 15, 30]),
	"project.message.write": ttlOptions([5, 15, 30]),
	"project.files.upload": ttlOptions([5, 15, 30]),
	"project.files.download": ttlOptions([5, 15, 30]),
	"fs.project.read": ttlOptions([5, 15, 30]),
	"fs.project.write": [
		{ labelKey: "htmlEditor.permissionAuthorizationConfirm.ttl.once", ttlMs: 0 },
		...ttlOptions([5, 10, 30]),
	],
	"user.profile.name": ttlOptions([5, 15, 30]),
	"user.profile.identity": ttlOptions([5, 15, 30]),
	"user.profile.organization": ttlOptions([5, 15, 30]),
}

const DEFAULT_TTL_BY_SCOPE: Record<HtmlPermissionScope, number> = {
	"llm.use": 15 * MINUTE_MS,
	"project.message.write": 10 * MINUTE_MS,
	"project.files.upload": 15 * MINUTE_MS,
	"project.files.download": 15 * MINUTE_MS,
	"fs.project.read": 15 * MINUTE_MS,
	"fs.project.write": 0,
	"user.profile.name": 15 * MINUTE_MS,
	"user.profile.identity": 15 * MINUTE_MS,
	"user.profile.organization": 15 * MINUTE_MS,
}

export function isSupportedHtmlPermissionScope(scope: string): scope is HtmlPermissionScope {
	return SUPPORTED_SCOPE_SET.has(scope)
}

export function getSharedHtmlPermissionTtlOptions(
	scopes: HtmlPermissionScope[],
	mode: HtmlPermissionMode,
): HtmlPermissionTtlOption[] {
	const source = mode === "legacy" ? LEGACY_TTL_OPTIONS : MANIFEST_TTL_OPTIONS
	const [firstScope, ...remainingScopes] = scopes
	if (!firstScope) return []
	return source[firstScope].filter((option) =>
		remainingScopes.every((scope) =>
			source[scope].some((candidate) => candidate.ttlMs === option.ttlMs),
		),
	)
}

export function getDefaultHtmlPermissionTtl(
	scope: HtmlPermissionScope,
	ttlOptions: HtmlPermissionTtlOption[],
) {
	const configured = DEFAULT_TTL_BY_SCOPE[scope]
	return ttlOptions.some((option) => option.ttlMs === configured)
		? configured
		: (ttlOptions[0]?.ttlMs ?? 0)
}

function ttlOptions(minutes: number[]): HtmlPermissionTtlOption[] {
	return minutes.map((minute) => ({
		labelKey: `htmlEditor.permissionAuthorizationConfirm.ttl.${minute}m`,
		ttlMs: minute * MINUTE_MS,
	}))
}

function hourOptions(hours: number[]): HtmlPermissionTtlOption[] {
	return hours.map((hour) => ({
		labelKey: `htmlEditor.permissionAuthorizationConfirm.ttl.${hour}h`,
		ttlMs: hour * 60 * MINUTE_MS,
	}))
}

function longTtlOptions(): HtmlPermissionTtlOption[] {
	return [...ttlOptions([5, 15, 30, 60]), ...hourOptions([2, 4, 8, 12])]
}
