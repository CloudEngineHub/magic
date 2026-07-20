import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import type { HtmlPermissionScope } from "../iframe-api/types"

export function useHtmlPermissionI18n() {
	const { t } = useTranslation("super")

	const getScopeLabel = useMemoizedFn((scope: HtmlPermissionScope) => {
		switch (scope) {
			case "llm.use":
				return t("htmlEditor.permissionAuthorizationConfirm.scopes.llmUse")
			case "project.message.write":
				return t("htmlEditor.permissionAuthorizationConfirm.scopes.projectMessageWrite")
			case "project.files.upload":
				return t("htmlEditor.permissionAuthorizationConfirm.scopes.projectFilesUpload")
			case "project.files.download":
				return t("htmlEditor.permissionAuthorizationConfirm.scopes.projectFilesDownload")
			case "fs.project.read":
				return t("htmlEditor.permissionAuthorizationConfirm.scopes.fsProjectRead")
			case "fs.project.write":
				return t("htmlEditor.permissionAuthorizationConfirm.scopes.fsProjectWrite")
			case "user.profile.name":
				return t("htmlEditor.permissionAuthorizationConfirm.scopes.userProfileName")
			case "user.profile.identity":
				return t("htmlEditor.permissionAuthorizationConfirm.scopes.userProfileIdentity")
			case "user.profile.organization":
				return t("htmlEditor.permissionAuthorizationConfirm.scopes.userProfileOrganization")
		}
	})

	const getTtlLabel = useMemoizedFn((ttlMs: number) => {
		switch (ttlMs) {
			case 0:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.once")
			case 5 * 60 * 1000:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.5m")
			case 10 * 60 * 1000:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.10m")
			case 15 * 60 * 1000:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.15m")
			case 30 * 60 * 1000:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.30m")
			case 60 * 60 * 1000:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.60m")
			case 2 * 60 * 60 * 1000:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.2h")
			case 4 * 60 * 60 * 1000:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.4h")
			case 8 * 60 * 60 * 1000:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.8h")
			case 12 * 60 * 60 * 1000:
				return t("htmlEditor.permissionAuthorizationConfirm.ttl.12h")
			default:
				return String(ttlMs)
		}
	})

	const getUserInfoFieldLabel = useMemoizedFn((scope: HtmlPermissionScope) => {
		switch (scope) {
			case "user.profile.name":
				return t("htmlEditor.userInfoAuthorizationConfirm.fields.name")
			case "user.profile.identity":
				return t("htmlEditor.userInfoAuthorizationConfirm.fields.identity")
			case "user.profile.organization":
				return t("htmlEditor.userInfoAuthorizationConfirm.fields.organization")
			default:
				return getScopeLabel(scope)
		}
	})

	return { getScopeLabel, getTtlLabel, getUserInfoFieldLabel }
}
