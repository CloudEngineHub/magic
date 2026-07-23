import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router"
import { SuperMagicApi } from "@/apis"
import { RouteName } from "@/routes/constants"
import { history } from "@/routes/history"
import { userStore } from "@/models/user"
import { buildLoginRedirectSearchParams } from "@/pages/login/utils/loginRedirect"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { useSharePermission } from "@/pages/share/hooks/useSharePermission"
import { useTokenRefreshPolling } from "@/pages/share/hooks/useTokenRefreshPolling"

interface UseMicroAppShareDataParams {
	appId: string
}

interface MicroAppShareMeta {
	projectId: string
	projectName: string
	temporaryToken: string
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

function convertToQuery(params: URLSearchParams): Record<string, string> {
	const query: Record<string, string> = {}
	params.forEach((value, key) => {
		query[key] = value
	})
	return query
}

function redirectToLogin(): void {
	history.replace({
		name: RouteName.Login,
		query: convertToQuery(
			buildLoginRedirectSearchParams({
				currentHref: window.location.href,
				redirectTarget: window.location.href,
			}),
		),
	})
}

export default function useMicroAppShareData({ appId }: UseMicroAppShareDataParams) {
	const { search } = useLocation()
	const [resourceId, setResourceId] = useState("")
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

	const applyShareData = useCallback(
		async (nextShareData: any, resolvedResourceId: string, password?: string) => {
			const meta = resolveShareMeta(nextShareData)
			if (meta.temporaryToken) {
				// @ts-ignore 复用现有 HTML 预览读取分享文件的临时 token 约定。
				window.temporary_token = meta.temporaryToken
			}
			if (meta.projectId) {
				// @ts-ignore 复用 HTML 预览内部对项目 ID 的读取约定。
				window.project_id = meta.projectId
			}

			const filesResponse = await SuperMagicApi.getShareResourceFiles({
				resource_id: resolvedResourceId,
				password,
			})
			const processedData = AttachmentDataProcessor.processAttachmentData(
				unwrapResponse(filesResponse),
			)
			const anonymous = await loadAppAnonymous(processedData.list || [])
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
		[setRequiredOrgCode],
	)

	const getShareData = useCallback(
		async ({ resource_id, password }: { resource_id: string; password?: string }) => {
			const response = await SuperMagicApi.getShareResource({
				resource_id,
				password,
			})
			await applyShareData(response, resource_id, password)
			return response
		},
		[applyShareData],
	)

	const loadShare = useCallback(async () => {
		if (!appId) return

		setLoading(true)
		setError(null)
		setRequiredOrgCode("")
		setResourceId("")
		setShareData(null)
		setAttachmentList([])
		setAttachmentsTree([])
		setVerifiedPassword(undefined)
		let checkData: any
		try {
			const appResponse = await SuperMagicApi.resolvePublishedMicroApp(appId)
			const appData = unwrapResponse<{ resource_id?: string }>(appResponse)
			const resolvedResourceId = readString(appData?.resource_id)
			if (!resolvedResourceId) throw new Error("Micro app share mapping is missing")
			setResourceId(resolvedResourceId)

			const checkResponse: any = await SuperMagicApi.checkShareResourcePassword({
				resource_id: resolvedResourceId,
			})
			checkData = unwrapResponse(checkResponse)
			const hasPassword = Boolean(checkData?.has_password)
			setIsNeedPassword(hasPassword)

			const urlPassword = new URLSearchParams(search).get("password") || ""
			setPasswordFromUrl(urlPassword)

			if (!hasPassword) {
				await getShareData({ resource_id: resolvedResourceId })
				return
			}

			if (urlPassword) {
				try {
					await getShareData({ resource_id: resolvedResourceId, password: urlPassword })
					setVerifiedPassword(urlPassword)
				} catch {
					setShareData(null)
					setAttachmentList([])
					setAttachmentsTree([])
				}
			}
		} catch (err: any) {
			setRequiredOrgCode(resolveRequiredOrgCode(err, checkData))
			setError(err)
		} finally {
			setLoading(false)
		}
	}, [appId, getShareData, search, setRequiredOrgCode])

	useEffect(() => {
		void loadShare()
		return () => {
			// @ts-ignore 清理分享页写入的临时上下文。
			window.temporary_token = ""
			// @ts-ignore
			window.project_id = ""
		}
	}, [loadShare])

	useTokenRefreshPolling({
		resourceId,
		password: verifiedPassword,
		data: shareData,
	})

	return {
		shareData,
		resourceId,
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
