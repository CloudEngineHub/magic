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

interface HtmlAppFileItem {
	file_id: string
	relative_file_path: string
}

interface UseHtmlAppPermissionsOptions {
	content: string
	rawSourceCode?: string
	relativeFilePath?: string
	projectId?: string
	fileList: HtmlAppFileItem[]
}

export function useHtmlAppPermissions({
	content,
	rawSourceCode,
	relativeFilePath,
	projectId,
	fileList,
}: UseHtmlAppPermissionsOptions) {
	const { t } = useTranslation("super")

	const htmlAppInstanceKey = useMemo(() => {
		const cleanedEntryPath = (relativeFilePath || "").replace(/^\/+/, "")
		const lastSlash = cleanedEntryPath.lastIndexOf("/")
		const appRootDir = lastSlash >= 0 ? cleanedEntryPath.slice(0, lastSlash + 1) : ""
		return JSON.stringify({
			projectId: projectId || "",
			appRootDir,
			entryPath: cleanedEntryPath,
		})
	}, [relativeFilePath, projectId])

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

	const htmlAppInstance = useMemo(() => {
		const cleanedEntryPath = (relativeFilePath || "").replace(/^\/+/, "")
		const lastSlash = cleanedEntryPath.lastIndexOf("/")
		const appRootDir = lastSlash >= 0 ? cleanedEntryPath.slice(0, lastSlash + 1) : ""
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
	}, [content, rawSourceCode, relativeFilePath, projectId])

	const htmlPermissionGrantStore = useMemo(() => new SessionStorageHtmlPermissionGrantStore(), [])

	const confirmHtmlPermission = useMemoizedFn(
		({
			appName,
			isLegacy,
			appConfigLoadError,
			scopeLabelKey,
			reason,
			ttlOptions,
			defaultTtlMs,
		}: HtmlPermissionConfirmRequest) =>
			new Promise<{ allowed: boolean; ttlMs: number }>((resolve) => {
				let selectedTtlMs = defaultTtlMs
				const scopeLabel = t(scopeLabelKey)
				const contentKey = isLegacy
					? appConfigLoadError
						? "htmlEditor.permissionAuthorizationConfirm.appConfigUnavailableContent"
						: "htmlEditor.permissionAuthorizationConfirm.legacyContent"
					: reason
						? "htmlEditor.permissionAuthorizationConfirm.content"
						: "htmlEditor.permissionAuthorizationConfirm.contentWithoutReason"
				const modal = MagicModal.confirm({
					title: t("htmlEditor.permissionAuthorizationConfirm.title"),
					content: (
						<div>
							<p>
								{t(contentKey, {
									appName,
									scope: scopeLabel,
									reason,
									error: appConfigLoadError,
								})}
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
												{t(option.labelKey)}
											</SelectItem>
										),
									)}
								</SelectContent>
							</Select>
						</div>
					),
					okText: t("htmlEditor.permissionAuthorizationConfirm.allow"),
					cancelText: t("htmlEditor.permissionAuthorizationConfirm.deny"),
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
		({ appName, scope, scopeLabelKey }: HtmlPermissionMissingDeclarationRequest) => {
			magicToast.warning({
				key: `html-permission-missing-${scope}`,
				content: t("htmlEditor.permissionAuthorizationConfirm.missingScope", {
					appName,
					scope: t(scopeLabelKey),
					rawScope: scope,
				}),
				duration: 4000,
			})
		},
	)

	const htmlPermissionService = useMemo(
		() =>
			new IframePermissionService({
				grantStore: htmlPermissionGrantStore,
				confirmPermission: confirmHtmlPermission,
				onMissingDeclaration: notifyMissingPermissionDeclaration,
				appConfigState: htmlAppConfigState,
				appInstance: htmlAppInstance,
			}),
		[
			confirmHtmlPermission,
			htmlAppConfigState,
			htmlAppInstance,
			htmlPermissionGrantStore,
			notifyMissingPermissionDeclaration,
		],
	)

	const authorizeHtmlPermission = useMemoizedFn((scope: HtmlPermissionScope) =>
		htmlPermissionService.authorize(scope),
	)

	useEffect(() => {
		let cancelled = false
		const cleanedEntryPath = (relativeFilePath || "").replace(/^\/+/, "")
		const lastSlash = cleanedEntryPath.lastIndexOf("/")
		const appRootDir = lastSlash >= 0 ? cleanedEntryPath.slice(0, lastSlash + 1) : ""
		const appConfigPath = `${appRootDir}app.json`
		setHtmlAppConfigStateWithKey({
			instanceKey: htmlAppInstanceKey,
			configState: { status: "loading" },
		})
		const appConfigFile = fileList.find(
			(file) => file.relative_file_path.replace(/^\/+/, "") === appConfigPath,
		)

		if (!appConfigFile) {
			setHtmlAppConfigStateWithKey({
				instanceKey: htmlAppInstanceKey,
				configState: { status: "absent" },
			})
			return
		}

		getIframeDownloadUrl([appConfigFile.file_id])
			.then(async (urls) => {
				const url = urls?.[0]?.url
				if (!url) throw new Error("Failed to get app.json download URL")
				const response = await fetch(url)
				if (!response.ok) throw new Error(`HTTP ${response.status}`)
				const config = (await response.json()) as HTMLAppConfig
				if (cancelled) return
				if (config && typeof config === "object") {
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
				htmlMicroAppPreviewLogger.error({
					eventKey: "invalid_app_json_failed",
					errorKind: "permission",
					message: "Invalid app.json",
					context: { appConfigPath },
				})
			})
			.catch((error) => {
				if (cancelled) return
				const errorMessage = error instanceof Error ? error.message : String(error)
				setHtmlAppConfigStateWithKey({
					instanceKey: htmlAppInstanceKey,
					configState: { status: "error", error: errorMessage },
				})
				htmlMicroAppPreviewLogger.error({
					eventKey: "load_app_json_failed",
					errorKind: "permission",
					message: "Failed to load app.json",
					context: { appConfigPath, errorMessage },
				})
			})

		return () => {
			cancelled = true
		}
	}, [fileList, htmlAppInstanceKey, relativeFilePath])

	return {
		htmlAppConfig,
		htmlAppConfigState,
		htmlAppInstanceKey,
		authorizeHtmlPermission,
	}
}
