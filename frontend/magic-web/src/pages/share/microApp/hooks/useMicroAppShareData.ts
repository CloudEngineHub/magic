import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router"
import { SuperMagicApi } from "@/apis"
import { userStore } from "@/models/user"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { useSharePermission } from "@/pages/share/hooks/useSharePermission"
import { useTokenRefreshPolling } from "@/pages/share/hooks/useTokenRefreshPolling"
import {
	microAppSharePasswordStore,
	removeMicroAppSharePassword,
} from "../utils/microAppSharePasswordStore"
import { authEventBus } from "@/services/auth/AuthEventBus"
import { AuthEventName } from "@/services/auth/AuthEvents"

interface UseMicroAppShareDataParams {
	appId: string
}

interface MicroAppShareMeta {
	projectId: string
	projectName: string
	temporaryToken: string
}

interface ShareRequestContext {
	appId: string
	sequence: number
}

interface MicroAppDisplayMode {
	appId: string
	fullScreen: boolean
}

function unwrapResponse<T = any>(response: any): T {
	return response?.data ?? response
}

function readString(value: unknown): string {
	if (value === null || value === undefined) return ""
	return String(value)
}

function resolveShareMeta(shareData: any): MicroAppShareMeta {
	const data = shareData?.data?.data || shareData?.data || shareData || {}
	return {
		projectId: readString(data.project_id || data.id || shareData?.project_id),
		projectName: readString(
			data.project_name ||
				data.resource_name ||
				data.name ||
				shareData?.resource_name ||
				shareData?.project_name,
		),
		temporaryToken: readString(
			shareData?.temporary_token || data.temporary_token || shareData?.data?.temporary_token,
		),
	}
}

function resolveRequiredOrgCode(error: any, checkData?: any): string {
	return readString(
		error?.required_magic_organization_code ||
			error?.response?.data?.required_magic_organization_code ||
			error?.data?.required_magic_organization_code ||
			checkData?.required_magic_organization_code,
	)
}

function getFileName(file: AttachmentItem): string {
	return readString(file.file_name || file.filename || file.name).replace(/^\/+/, "")
}

function findAppConfigFile(files: AttachmentItem[]): AttachmentItem | null {
	return (
		files.find((file) => {
			const fileName = getFileName(file)
			const relativePath = readString(file.relative_file_path).replace(/^\/+/, "")
			return fileName === "app.json" || relativePath.endsWith("/app.json")
		}) || null
	)
}

async function loadAppAnonymous(files: AttachmentItem[]): Promise<boolean> {
	const appConfigFile = findAppConfigFile(files)
	if (!appConfigFile?.file_id) return false

	const [urlItem] = (await getTemporaryDownloadUrl({
		file_ids: [appConfigFile.file_id],
		enableErrorMessagePrompt: false,
	})) as Array<{ url?: string }>
	if (!urlItem?.url) return false

	const response = await fetch(urlItem.url)
	if (!response.ok) return false
	const config = await response.json()
	return config && typeof config === "object" && config.anonymous === true
}

function hasLoginAuthorization(): boolean {
	return Boolean(userStore.user.authorization?.trim() || userStore.user.userInfo?.user_id)
}

function redirectToLogin(): void {
	authEventBus.emit(AuthEventName.RequestLogin, {
		reason: "share-access-required",
		source: "share",
		returnTo: window.location.href,
		preserveQuery: true,
	})
}

function removePasswordFromCurrentUrl(): void {
	const url = new URL(window.location.href)
	if (!url.searchParams.has("password")) return
	url.searchParams.delete("password")
	window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}

function readHttpStatus(error: unknown): number {
	const value = error as {
		response?: { status?: unknown }
		status?: unknown
		statusCode?: unknown
	}
	return Number(value?.response?.status || value?.status || value?.statusCode || 0)
}

function readBusinessCode(error: unknown): number {
	const value = error as {
		code?: unknown
		data?: { code?: unknown; data?: { code?: unknown } }
		response?: { data?: { code?: unknown; data?: { code?: unknown } } }
	}
	return Number(
		value?.code ||
			value?.data?.code ||
			value?.data?.data?.code ||
			value?.response?.data?.code ||
			value?.response?.data?.data?.code ||
			0,
	)
}

function isShareUnavailableError(error: unknown): boolean {
	return (
		[404, 410].includes(readHttpStatus(error)) ||
		[51200, 51302, 51305].includes(readBusinessCode(error))
	)
}

function isPasswordRejectedError(error: unknown): boolean {
	return (
		[400, 401, 403].includes(readHttpStatus(error)) ||
		[51306, 51317].includes(readBusinessCode(error))
	)
}

export default function useMicroAppShareData({ appId }: UseMicroAppShareDataParams) {
	const { search } = useLocation()
	const currentAppIdRef = useRef(appId)
	const requestSequenceRef = useRef(0)
	const [resourceId, setResourceId] = useState("")
	const [coverUrl, setCoverUrl] = useState("")
	const [displayMode, setDisplayMode] = useState<MicroAppDisplayMode | null>(null)
	const [shareData, setShareData] = useState<any>(null)
	const [attachmentsTree, setAttachmentsTree] = useState<AttachmentItem[]>([])
	const [attachmentList, setAttachmentList] = useState<AttachmentItem[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<Error | null>(null)
	const [isNeedPassword, setIsNeedPassword] = useState(false)
	const [passwordFromUrl, setPasswordFromUrl] = useState("")
	const [verifiedPassword, setVerifiedPassword] = useState<string | undefined>()
	const { emptyStateInfo, handleSwitchOrganization, isSwitching, setRequiredOrgCode } =
		useSharePermission()

	const shareMeta = useMemo(() => resolveShareMeta(shareData), [shareData])
	const displayModeResolved = displayMode?.appId === appId
	const fullScreen = displayModeResolved ? displayMode.fullScreen : false
	currentAppIdRef.current = appId

	const createRequestContext = useCallback(
		(): ShareRequestContext => ({
			appId: currentAppIdRef.current,
			sequence: ++requestSequenceRef.current,
		}),
		[],
	)
	const isRequestCurrent = useCallback(
		(context: ShareRequestContext) =>
			context.appId === currentAppIdRef.current &&
			context.sequence === requestSequenceRef.current,
		[],
	)

	const applyShareData = useCallback(
		async (
			nextShareData: any,
			resolvedResourceId: string,
			context: ShareRequestContext,
			password?: string,
		) => {
			const meta = resolveShareMeta(nextShareData)
			const filesResponse = await SuperMagicApi.getShareResourceFiles({
				resource_id: resolvedResourceId,
				password,
			})
			if (!isRequestCurrent(context)) return

			const processedData = AttachmentDataProcessor.processAttachmentData(
				unwrapResponse(filesResponse),
			)
			// app.json 的下载接口依赖这两个全局值；只允许当前请求在读取配置前写入。
			if (meta.temporaryToken) {
				// @ts-ignore 复用现有 HTML 预览读取分享文件的临时 token 约定。
				window.temporary_token = meta.temporaryToken
			}
			if (meta.projectId) {
				// @ts-ignore 复用 HTML 预览内部对项目 ID 的读取约定。
				window.project_id = meta.projectId
			}

			const anonymous = await loadAppAnonymous(processedData.list || [])
			if (!isRequestCurrent(context)) return

			if (!anonymous && !hasLoginAuthorization()) {
				redirectToLogin()
				return
			}

			setShareData(nextShareData)
			setAttachmentList(processedData.list || [])
			setAttachmentsTree(processedData.tree || [])
			setError(null)
			setRequiredOrgCode("")
		},
		[isRequestCurrent, setRequiredOrgCode],
	)

	const fetchShareData = useCallback(
		async (
			{ resource_id, password }: { resource_id: string; password?: string },
			context: ShareRequestContext,
		) => {
			const response = await SuperMagicApi.getShareResource({
				resource_id,
				password,
			})
			if (!isRequestCurrent(context)) return response
			await applyShareData(response, resource_id, context, password)
			return response
		},
		[applyShareData, isRequestCurrent],
	)

	const getShareData = useCallback(
		(params: { resource_id: string; password?: string }) =>
			fetchShareData(params, createRequestContext()),
		[createRequestContext, fetchShareData],
	)

	const loadShare = useCallback(async () => {
		if (!appId) return
		const requestContext = createRequestContext()

		setLoading(true)
		setError(null)
		setRequiredOrgCode("")
		setResourceId("")
		setCoverUrl("")
		setDisplayMode(null)
		setShareData(null)
		setAttachmentList([])
		setAttachmentsTree([])
		setVerifiedPassword(undefined)
		let checkData: any
		let resolvedResourceId = ""
		try {
			const appResponse = await SuperMagicApi.resolvePublishedMicroApp(appId)
			if (!isRequestCurrent(requestContext)) return
			const appData = unwrapResponse<{
				resource_id?: string
				cover_url?: string
				extra?: {
					pure_mode?: boolean
				}
			}>(appResponse)
			resolvedResourceId = readString(appData?.resource_id)
			if (!resolvedResourceId) throw new Error("Micro app share mapping is missing")
			setResourceId(resolvedResourceId)
			setCoverUrl(readString(appData?.cover_url))
			setDisplayMode({
				appId: requestContext.appId,
				fullScreen: appData?.extra?.pure_mode === true,
			})

			const checkResponse: any = await SuperMagicApi.checkShareResourcePassword({
				resource_id: resolvedResourceId,
			})
			if (!isRequestCurrent(requestContext)) return
			checkData = unwrapResponse(checkResponse)
			const hasPassword = Boolean(checkData?.has_password)
			setIsNeedPassword(hasPassword)

			const urlPassword = new URLSearchParams(search).get("password") || ""
			setPasswordFromUrl(urlPassword)

			if (!hasPassword) {
				removeMicroAppSharePassword(appId, resolvedResourceId)
				await fetchShareData({ resource_id: resolvedResourceId }, requestContext)
				return
			}

			if (urlPassword) {
				try {
					await fetchShareData(
						{ resource_id: resolvedResourceId, password: urlPassword },
						requestContext,
					)
					if (isRequestCurrent(requestContext)) {
						setVerifiedPassword(urlPassword)
						removePasswordFromCurrentUrl()
					}
					return
				} catch (urlPasswordError) {
					if (!isRequestCurrent(requestContext)) return
					if (isShareUnavailableError(urlPasswordError)) throw urlPasswordError
					setPasswordFromUrl("")
					setShareData(null)
					setAttachmentList([])
					setAttachmentsTree([])
				}
			}

			const rememberedPassword = microAppSharePasswordStore.read(resolvedResourceId)?.password
			if (rememberedPassword) {
				try {
					await fetchShareData(
						{ resource_id: resolvedResourceId, password: rememberedPassword },
						requestContext,
					)
					if (isRequestCurrent(requestContext)) {
						setVerifiedPassword(rememberedPassword)
						removePasswordFromCurrentUrl()
					}
				} catch (rememberedPasswordError) {
					if (isShareUnavailableError(rememberedPasswordError)) {
						removeMicroAppSharePassword(appId, resolvedResourceId)
						throw rememberedPasswordError
					}
					if (isPasswordRejectedError(rememberedPasswordError)) {
						removeMicroAppSharePassword(appId, resolvedResourceId)
					}
					if (!isRequestCurrent(requestContext)) return
					setShareData(null)
					setAttachmentList([])
					setAttachmentsTree([])
					setError(null)
				}
			}
		} catch (err: any) {
			if (!isRequestCurrent(requestContext)) return
			if (isShareUnavailableError(err)) {
				removeMicroAppSharePassword(appId, resolvedResourceId)
			}
			setRequiredOrgCode(resolveRequiredOrgCode(err, checkData))
			setError(err)
			setDisplayMode({ appId: requestContext.appId, fullScreen: false })
		} finally {
			if (isRequestCurrent(requestContext)) setLoading(false)
		}
	}, [appId, createRequestContext, fetchShareData, isRequestCurrent, search, setRequiredOrgCode])

	useEffect(() => {
		void loadShare()
		return () => {
			requestSequenceRef.current += 1
			// @ts-ignore 清理分享页写入的临时上下文。
			window.temporary_token = ""
			// @ts-ignore
			window.project_id = ""
		}
	}, [loadShare])

	useTokenRefreshPolling({
		resourceId,
		password: verifiedPassword,
		scopeKey: appId,
		data: shareData,
	})

	return {
		shareData,
		resourceId,
		coverUrl,
		fullScreen,
		displayModeResolved,
		shareMeta,
		attachmentsTree,
		attachmentList,
		loading,
		error,
		isNeedPassword,
		passwordFromUrl,
		verifiedPassword,
		emptyStateInfo,
		handleSwitchOrganization,
		isSwitching,
		getShareData,
		setError,
		setVerifiedPassword,
		reload: loadShare,
	}
}
