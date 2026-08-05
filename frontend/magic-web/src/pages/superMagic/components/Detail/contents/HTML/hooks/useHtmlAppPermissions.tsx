import { useEffect, useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import MagicModal from "@/components/base/MagicModal"
import magicToast from "@/components/base/MagicToaster/utils"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import { userStore } from "@/models/user"
import { getIframeDownloadUrl } from "../iframe-api/iframeApi"
import { htmlMicroAppPreviewLogger } from "../utils/htmlMicroAppPreviewLogger"
import { SessionStorageHtmlPermissionGrantStore } from "../iframe-api/services/HtmlPermissionGrantStore"
import {
	IframePermissionService,
	type HtmlAppConfigState,
	type HtmlPermissionConfirmRequest,
	type HtmlPermissionMissingDeclarationRequest,
} from "../iframe-api/services/IframePermissionService"
import type { HTMLAppConfig, HtmlPermissionScope } from "../iframe-api/types"
import { hasManageableHtmlPermissionDeclarations } from "../iframe-api/services/htmlPermissionDeclarations"
import { useHtmlPermissionI18n } from "./useHtmlPermissionI18n"

interface HtmlAppFileItem {
	file_id: string
	relative_file_path: string
	updated_at?: string
}

interface UseHtmlAppPermissionsOptions {
	content: string
	rawSourceCode?: string
	relativeFilePath?: string
	projectId?: string
	fileList: HtmlAppFileItem[]
	enabled?: boolean
}

export function useHtmlAppPermissions({
	content,
	rawSourceCode,
	relativeFilePath,
	projectId,
	fileList,
	enabled = true,
}: UseHtmlAppPermissionsOptions) {
	const { t } = useTranslation("super")
	const { getScopeLabel, getTtlLabel, getUserInfoFieldLabel } = useHtmlPermissionI18n()
	const [grantRevision, setGrantRevision] = useState(0)
	const cleanedEntryPath = (relativeFilePath || "").replace(/^\/+/, "")
	const lastSlash = cleanedEntryPath.lastIndexOf("/")
	const appRootDir = lastSlash >= 0 ? cleanedEntryPath.slice(0, lastSlash + 1) : ""

	const htmlAppInstanceKey = useMemo(() => {
		return JSON.stringify({
			projectId: projectId || "",
			appRootDir,
			entryPath: cleanedEntryPath,
		})
	}, [appRootDir, cleanedEntryPath, projectId])

	const [htmlAppConfigStateWithKey, setHtmlAppConfigStateWithKey] = useState<{
		instanceKey: string
		configState: HtmlAppConfigState
	}>({
		instanceKey: "",
		configState: { status: "loading" },
	})

	const htmlAppConfigState = useMemo<HtmlAppConfigState>(
		() =>
			htmlAppConfigStateWithKey.instanceKey === htmlAppInstanceKey
				? htmlAppConfigStateWithKey.configState
				: { status: "loading" },
		[htmlAppConfigStateWithKey, htmlAppInstanceKey],
	)

	const htmlAppConfig = htmlAppConfigState.status === "loaded" ? htmlAppConfigState.config : null
	const hasHtmlPermissionDeclarations =
		htmlAppConfigState.status === "loaded" &&
		hasManageableHtmlPermissionDeclarations(htmlAppConfigState.config)
	const appConfigPath = `${appRootDir}app.json`
	// 普通附件更新不应重新加载 app.json；仅跟踪配置文件自身的身份和版本。
	const appConfigFile = useMemo(
		() =>
			fileList.find((file) => file.relative_file_path?.replace(/^\/+/, "") === appConfigPath),
		[fileList, appConfigPath],
	)
	const appConfigFileId = appConfigFile?.file_id || ""
	const appConfigFileUpdatedAt = appConfigFile?.updated_at || ""

	const htmlAppInstance = useMemo(() => {
		const info = userStore.user.userInfo
		const magicId = info?.magic_id?.trim()
		const userId = info?.user_id?.trim()
		const userKey = magicId ? `magic_id:${magicId}` : userId ? `user_id:${userId}` : ""
		return {
			userKey,
			projectId: projectId || "",
			appRootDir,
			entryPath: cleanedEntryPath,
			content: rawSourceCode || content || "",
		}
	}, [appRootDir, cleanedEntryPath, content, projectId, rawSourceCode])

	const htmlPermissionGrantStore = useMemo(() => new SessionStorageHtmlPermissionGrantStore(), [])

	const confirmHtmlPermission = useMemoizedFn(
		({
			appName,
			isLegacy,
			appConfigLoadError,
			scopes,
			reason,
			presentation,
			ttlOptions,
			defaultTtlMs,
		}: HtmlPermissionConfirmRequest) =>
			new Promise<{ allowed: boolean; ttlMs: number }>((resolve) => {
				let selectedTtlMs = defaultTtlMs
				const displayAppName = appName || t("htmlEditor.permissionManager.defaultAppName")
				const scopeLabel = scopes
					.map(getScopeLabel)
					.join(t("htmlEditor.permissionAuthorizationConfirm.scopeSeparator"))
				const isUserInfo = presentation === "userInfo"
				const fieldsText = scopes
					.map(getUserInfoFieldLabel)
					.join(t("htmlEditor.userInfoAuthorizationConfirm.fieldSeparator"))
				const contentParams = {
					appName: displayAppName,
					scope: scopeLabel,
					fields: fieldsText,
					reason,
					error: appConfigLoadError,
				}
				let contentText: string
				if (isUserInfo) {
					if (isLegacy && appConfigLoadError) {
						contentText = t(
							"htmlEditor.userInfoAuthorizationConfirm.appConfigUnavailableContent",
							contentParams,
						)
					} else if (isLegacy) {
						contentText = t(
							"htmlEditor.userInfoAuthorizationConfirm.legacyContent",
							contentParams,
						)
					} else if (reason) {
						contentText = t(
							"htmlEditor.userInfoAuthorizationConfirm.content",
							contentParams,
						)
					} else {
						contentText = t(
							"htmlEditor.userInfoAuthorizationConfirm.contentWithoutReason",
							contentParams,
						)
					}
				} else if (isLegacy && appConfigLoadError) {
					contentText = t(
						"htmlEditor.permissionAuthorizationConfirm.appConfigUnavailableContent",
						contentParams,
					)
				} else if (isLegacy) {
					contentText = t(
						"htmlEditor.permissionAuthorizationConfirm.legacyContent",
						contentParams,
					)
				} else if (reason) {
					contentText = t(
						"htmlEditor.permissionAuthorizationConfirm.content",
						contentParams,
					)
				} else {
					contentText = t(
						"htmlEditor.permissionAuthorizationConfirm.contentWithoutReason",
						contentParams,
					)
				}
				const modal = MagicModal.confirm({
					title: isUserInfo
						? t("htmlEditor.userInfoAuthorizationConfirm.title")
						: t("htmlEditor.permissionAuthorizationConfirm.title"),
					content: (
						<div>
							<p>{contentText}</p>
							<p className="mt-3 text-xs text-muted-foreground">
								{t("htmlEditor.permissionAuthorizationConfirm.durationLabel")}
							</p>
							<Select
								defaultValue={String(defaultTtlMs)}
								onValueChange={(value) => {
									selectedTtlMs = Number(value)
								}}
							>
								<SelectTrigger className="mt-3 w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ttlOptions.map(
										(option: { labelKey: string; ttlMs: number }) => (
											<SelectItem
												key={option.ttlMs}
												value={String(option.ttlMs)}
											>
												{getTtlLabel(option.ttlMs)}
											</SelectItem>
										),
									)}
								</SelectContent>
							</Select>
						</div>
					),
					okText: isUserInfo
						? t("htmlEditor.userInfoAuthorizationConfirm.allow")
						: t("htmlEditor.permissionAuthorizationConfirm.allow"),
					cancelText: isUserInfo
						? t("htmlEditor.userInfoAuthorizationConfirm.deny")
						: t("htmlEditor.permissionAuthorizationConfirm.deny"),
					closable: false,
					maskClosable: false,
					centered: true,
					onOk: () => {
						modal.destroy()
						resolve({ allowed: true, ttlMs: selectedTtlMs })
					},
					onCancel: () => {
						modal.destroy()
						resolve({ allowed: false, ttlMs: 0 })
					},
				})
			}),
	)

	const notifyMissingPermissionDeclaration = useMemoizedFn(
		({ appName, scope }: HtmlPermissionMissingDeclarationRequest) => {
			magicToast.warning({
				key: `html-permission-missing-${scope}`,
				content: t("htmlEditor.permissionAuthorizationConfirm.missingScope", {
					appName: appName || t("htmlEditor.permissionManager.defaultAppName"),
					scope: getScopeLabel(scope),
					rawScope: scope,
				}),
				duration: 4000,
			})
		},
	)
	const notifyGrantsChanged = useMemoizedFn(() => {
		setGrantRevision((revision) => revision + 1)
	})

	const htmlPermissionService = useMemo(
		() =>
			new IframePermissionService({
				grantStore: htmlPermissionGrantStore,
				confirmPermission: confirmHtmlPermission,
				onMissingDeclaration: notifyMissingPermissionDeclaration,
				onGrantsChanged: notifyGrantsChanged,
				appConfigState: htmlAppConfigState,
				appInstance: htmlAppInstance,
			}),
		[
			confirmHtmlPermission,
			htmlAppConfigState,
			htmlAppInstance,
			htmlPermissionGrantStore,
			notifyGrantsChanged,
			notifyMissingPermissionDeclaration,
		],
	)

	const authorizeHtmlPermission = useMemoizedFn(async (scope: HtmlPermissionScope) => {
		return htmlPermissionService.authorize(scope)
	})

	const authorizeHtmlPermissions = useMemoizedFn(
		async (
			scopes: HtmlPermissionScope[],
			options?: Parameters<IframePermissionService["authorizeMany"]>[1],
		) => {
			return htmlPermissionService.authorizeMany(scopes, options)
		},
	)

	const getPermissionSnapshot = useMemoizedFn(() => htmlPermissionService.getPermissionSnapshot())

	const revokeHtmlPermission = useMemoizedFn(async (scope: HtmlPermissionScope) => {
		return htmlPermissionService.revoke(scope)
	})

	const updateHtmlPermissionTtl = useMemoizedFn(
		async (scope: HtmlPermissionScope, ttlMs: number) => {
			return htmlPermissionService.updateGrantTtl(scope, ttlMs)
		},
	)

	const revokeAllHtmlPermissions = useMemoizedFn(async () => {
		return htmlPermissionService.revokeAll()
	})

	useEffect(() => {
		let cancelled = false
		setHtmlAppConfigStateWithKey({
			instanceKey: htmlAppInstanceKey,
			configState: { status: "loading" },
		})
		if (!enabled) {
			setHtmlAppConfigStateWithKey({
				instanceKey: htmlAppInstanceKey,
				configState: { status: "absent" },
			})
			return
		}
		if (!appConfigFileId) {
			setHtmlAppConfigStateWithKey({
				instanceKey: htmlAppInstanceKey,
				configState: { status: "absent" },
			})
			return
		}

		getIframeDownloadUrl([appConfigFileId])
			.then(async (urls) => {
				const url = urls?.[0]?.url
				if (!url) throw new Error("Failed to get app.json download URL")
				const response = await fetch(url)
				if (!response.ok) throw new Error(`HTTP ${response.status}`)
				const config = (await response.json()) as HTMLAppConfig
				if (cancelled) return
				if (config && typeof config === "object" && !Array.isArray(config)) {
					setHtmlAppConfigStateWithKey({
						instanceKey: htmlAppInstanceKey,
						configState: { status: "loaded", config },
					})
					return
				}
				setHtmlAppConfigStateWithKey({
					instanceKey: htmlAppInstanceKey,
					configState: { status: "error", error: "Invalid app.json" },
				})
				htmlMicroAppPreviewLogger.error("Invalid app.json", { appConfigPath })
			})
			.catch((error) => {
				if (cancelled) return
				const errorMessage = error instanceof Error ? error.message : String(error)
				setHtmlAppConfigStateWithKey({
					instanceKey: htmlAppInstanceKey,
					configState: { status: "error", error: errorMessage },
				})
				htmlMicroAppPreviewLogger.error("Failed to load app.json", {
					appConfigPath,
					errorMessage,
				})
			})

		return () => {
			cancelled = true
		}
	}, [appConfigFileId, appConfigFileUpdatedAt, appConfigPath, enabled, htmlAppInstanceKey])

	return {
		htmlAppConfig,
		htmlAppConfigState,
		hasHtmlPermissionDeclarations,
		htmlAppInstanceKey,
		authorizeHtmlPermission,
		authorizeHtmlPermissions,
		getPermissionSnapshot,
		revokeHtmlPermission,
		updateHtmlPermissionTtl,
		revokeAllHtmlPermissions,
		permissionRevision: `${htmlAppInstanceKey}:${htmlAppConfigState.status}:${grantRevision}`,
	}
}

export type HtmlAppPermissionController = ReturnType<typeof useHtmlAppPermissions>
