import { describe, expect, it } from "vitest"
import enUS from "@/assets/locales/en_US/super.json"
import zhCN from "@/assets/locales/zh_CN/super.json"

const requiredKeys = [
	"title",
	"content",
	"cancel",
	"operations.write",
	"operations.move",
	"operations.rename",
	"operations.delete",
	"targetTypes.file",
	"targetTypes.directory",
	"projectRoot",
]

const requiredUserInfoAuthorizationKeys = [
	"title",
	"content",
	"contentWithoutReason",
	"fieldSeparator",
	"fields.name",
	"fields.identity",
	"fields.organization",
	"legacyContent",
	"allow",
	"deny",
]

const requiredPermissionAuthorizationKeys = [
	"title",
	"content",
	"contentWithoutReason",
	"durationLabel",
	"legacyContent",
	"missingScope",
	"scopeSeparator",
	"allow",
	"deny",
	"scopes.llmUse",
	"scopes.projectMessageWrite",
	"scopes.projectFilesUpload",
	"scopes.projectFilesDownload",
	"scopes.fsProjectRead",
	"scopes.fsProjectWrite",
	"scopes.userProfileName",
	"scopes.userProfileIdentity",
	"scopes.userProfileOrganization",
	"ttl.once",
	"ttl.1d",
	"ttl.7d",
	"ttl.30d",
	"ttl.always",
	"ttl.5m",
	"ttl.10m",
	"ttl.15m",
	"ttl.30m",
	"ttl.60m",
	"ttl.2h",
	"ttl.4h",
	"ttl.8h",
	"ttl.12h",
]

const requiredPermissionManagerKeys = [
	"title",
	"description",
	"open",
	"defaultAppName",
	"noDeclaredPermissions",
	"declared",
	"notDeclared",
	"unsupported",
	"granted",
	"notGranted",
	"askWhenUsed",
	"authorize",
	"authorizeFailed",
	"authorizeSuccess",
	"grantedAt",
	"expiresAt",
	"alwaysValid",
	"durationLabel",
	"durationSelect",
	"revoke",
	"revokeAll",
	"revokeNote",
	"revokeNoteTitle",
	"updateDuration",
	"updateDurationFailed",
	"updateDurationSuccess",
	"remainingDays",
	"diagnostics.manifestAbsent",
	"diagnostics.manifestLoadError",
	"diagnostics.scopesInvalid",
	"diagnostics.scopeInvalid",
	"diagnostics.scopeDuplicate",
	"diagnostics.scopeUnsupported",
]

function getPathValue(source: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>((current, segment) => {
		if (!current || typeof current !== "object") return undefined
		return (current as Record<string, unknown>)[segment]
	}, source)
}

describe("project file operation confirmation i18n", () => {
	it.each([
		["zh_CN", zhCN],
		["en_US", enUS],
	])("defines all modal copy keys for %s", (_locale, messages) => {
		for (const key of requiredKeys) {
			expect(getPathValue(messages, `htmlEditor.projectFileOperationConfirm.${key}`)).toEqual(
				expect.any(String),
			)
		}
	})
})

describe("user info authorization confirmation i18n", () => {
	it.each([
		["zh_CN", zhCN],
		["en_US", enUS],
	])("defines all modal copy keys for %s", (_locale, messages) => {
		for (const key of requiredUserInfoAuthorizationKeys) {
			expect(
				getPathValue(messages, `htmlEditor.userInfoAuthorizationConfirm.${key}`),
			).toEqual(expect.any(String))
		}
	})
})

describe("HTML micro-app permission authorization confirmation i18n", () => {
	it.each([
		["zh_CN", zhCN],
		["en_US", enUS],
	])("defines all modal copy keys for %s", (_locale, messages) => {
		for (const key of requiredPermissionAuthorizationKeys) {
			expect(
				getPathValue(messages, `htmlEditor.permissionAuthorizationConfirm.${key}`),
			).toEqual(expect.any(String))
		}
	})
})

describe("HTML micro-app permission manager i18n", () => {
	it.each([
		["zh_CN", zhCN],
		["en_US", enUS],
	])("defines all manager copy keys for %s", (_locale, messages) => {
		for (const key of requiredPermissionManagerKeys) {
			expect(getPathValue(messages, `htmlEditor.permissionManager.${key}`)).toEqual(
				expect.any(String),
			)
		}
	})
})
