import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Copy, Loader2, RefreshCw, Rocket, Trash2 } from "lucide-react"
import MagicModal from "@/components/base/MagicModal"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Label } from "@/components/shadcn-ui/label"
import { Separator } from "@/components/shadcn-ui/separator"
import { SuperMagicApi } from "@/apis"
import type {
	MicroAppPublishShareRange,
	MicroAppPublishShareType,
	MicroAppPublishTarget,
	PublishedMicroAppProjectItem,
	PublishMicroAppProjectBody,
} from "@/apis/modules/superMagic"
import {
	ShareRangeField,
	ShareTypeField,
	type ShareRange,
	type ShareTarget,
} from "@/pages/superMagic/components/Share/ShareFields"
import { ResourceType, ShareType } from "@/pages/superMagic/components/Share/types"
import { generateSharePassword } from "@/pages/superMagic/components/Share/utils"
import { clipboard } from "@/utils/clipboard-helpers"

interface MicroAppPublishDialogProps {
	open: boolean
	appId?: string
	projectId?: string
	projectName?: string
	onProjectNameChange?: (projectName: string) => void
	onOpenChange: (open: boolean) => void
}

interface MicroAppPublishFormState {
	projectName: string
	shareType: MicroAppPublishShareType
	shareRange: MicroAppPublishShareRange
	targets: MicroAppPublishTarget[]
	password: string
}

const MICRO_APP_PUBLISH_TYPES = [
	ShareType.Organization,
	ShareType.Public,
	ShareType.PasswordProtected,
]

function createDefaultFormState(projectName = ""): MicroAppPublishFormState {
	return {
		projectName,
		shareType: ShareType.Organization,
		shareRange: "all",
		targets: [],
		password: generateSharePassword(),
	}
}

export function buildMicroAppPublishPayload(
	formState: MicroAppPublishFormState,
): PublishMicroAppProjectBody {
	const payload: PublishMicroAppProjectBody = {
		project_name: formState.projectName.trim(),
		share_type: formState.shareType,
	}

	if (formState.shareType === ShareType.Organization) {
		payload.share_range = formState.shareRange
		if (formState.shareRange === "designated") {
			payload.target_ids = formState.targets.map((target) => ({
				target_type: target.target_type,
				target_id: target.target_id,
			}))
		}
	}

	if (formState.shareType === ShareType.PasswordProtected) {
		payload.password = formState.password.trim()
	}

	return payload
}

function getPublishedItemFromResponse(
	response: PublishedMicroAppProjectItem | { data?: PublishedMicroAppProjectItem },
): PublishedMicroAppProjectItem {
	if ("data" in response && response.data) return response.data
	return response as PublishedMicroAppProjectItem
}

function getShareSettingFromResponse(response: unknown): Record<string, any> | null {
	if (!response || typeof response !== "object") return null
	const hasSettingFields = (value: Record<string, any>) =>
		"resource_id" in value || "share_type" in value || "project_id" in value

	if (
		"data" in response &&
		response.data &&
		typeof response.data === "object" &&
		hasSettingFields(response.data as Record<string, any>)
	) {
		return response.data as Record<string, any>
	}

	const directResponse = response as Record<string, any>
	return hasSettingFields(directResponse) ? directResponse : null
}

function getShareRecordsFromResponse(response: unknown): Array<Record<string, any>> {
	if (Array.isArray(response)) return response
	if (!response || typeof response !== "object") return []
	if ("data" in response && Array.isArray(response.data)) return response.data
	if (
		"data" in response &&
		response.data &&
		typeof response.data === "object" &&
		Array.isArray((response.data as { list?: unknown }).list)
	) {
		return (response.data as { list: Array<Record<string, any>> }).list
	}
	if (Array.isArray((response as { list?: unknown }).list)) {
		return (response as { list: Array<Record<string, any>> }).list
	}
	return []
}

function createPublishedItemFromShareSetting({
	appId,
	projectId,
	resourceId,
	projectName,
	share,
	setting,
}: {
	appId: string
	projectId: string
	resourceId: string
	projectName?: string
	share: Record<string, any>
	setting: Record<string, any>
}): PublishedMicroAppProjectItem {
	return {
		app_id: appId,
		project_id: String(setting.project_id || share.project_id || projectId),
		project_name: setting.project_name || share.project_name || projectName,
		resource_id: String(setting.resource_id || resourceId),
		share_id: setting.share_id || share.share_id || share.id,
		share_code: setting.share_code || share.share_code,
		share_type: (setting.share_type ||
			share.share_type ||
			ShareType.Organization) as MicroAppPublishShareType,
		share_range: (setting.share_range ||
			share.share_range ||
			"all") as MicroAppPublishShareRange,
		target_ids: (setting.target_ids || share.target_ids || []) as MicroAppPublishTarget[],
		access_url: setting.access_url || share.access_url || share.share_url,
		published_at:
			setting.published_at ||
			setting.shared_at ||
			setting.created_at ||
			share.shared_at ||
			share.created_at,
		password: setting.password || share.password || "",
		publish_status: setting.publish_status || share.publish_status,
	}
}

async function loadPublishedMicroAppProject(
	appId: string,
	projectId: string,
	projectName?: string,
) {
	const shareRecordsResponse = await SuperMagicApi.getShareResourcesList({
		page: 1,
		page_size: 10,
		resource_type: ResourceType.FileCollection,
		project_id: projectId,
		share_project: true,
		filter_type: "active",
	})
	const existingShare = getShareRecordsFromResponse(shareRecordsResponse).find((share) => {
		if (share.deleted_at) return false
		if (share.share_project === false) return false
		return !share.project_id || String(share.project_id) === String(projectId)
	})
	const resourceId = existingShare?.resource_id || existingShare?.share_code
	if (!resourceId) return null

	const settingResponse = await SuperMagicApi.getShareInfoByCode({ code: String(resourceId) })
	const setting = getShareSettingFromResponse(settingResponse) || existingShare

	return createPublishedItemFromShareSetting({
		appId,
		projectId,
		resourceId: String(resourceId),
		projectName,
		share: existingShare,
		setting,
	})
}

function createFormStateFromPublishedItem(
	item: PublishedMicroAppProjectItem,
	projectName?: string,
): MicroAppPublishFormState {
	return {
		projectName: item.project_name || projectName || "",
		shareType: item.share_type,
		shareRange: item.share_range || "all",
		targets: item.target_ids || [],
		password: item.password || "",
	}
}

function formatPublishedAt(value?: string): string {
	if (!value) return ""
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString()
}

export function buildMicroAppAccessUrl(item: PublishedMicroAppProjectItem | null): string {
	if (!item) return ""
	if (item.app_id) return `${window.location.origin}/micro-app/${item.app_id}`
	return item.access_url || ""
}

export function buildMicroAppShareText({
	projectName,
	accessUrl,
	password,
	passwordLabel,
}: {
	projectName?: string
	accessUrl: string
	password?: string
	passwordLabel: string
}): string {
	const lines = [projectName, accessUrl].filter(Boolean) as string[]
	if (password) lines.push(`${passwordLabel}: ${password}`)
	return lines.join("\n")
}

export default function MicroAppPublishDialog({
	open,
	appId,
	projectId,
	projectName,
	onProjectNameChange,
	onOpenChange,
}: MicroAppPublishDialogProps) {
	const { t } = useTranslation("super")
	const [formState, setFormState] = useState<MicroAppPublishFormState>(() =>
		createDefaultFormState(),
	)
	const [publishedItem, setPublishedItem] = useState<PublishedMicroAppProjectItem | null>(null)
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [unpublishing, setUnpublishing] = useState(false)

	const publishedAtText = useMemo(
		() => formatPublishedAt(publishedItem?.published_at),
		[publishedItem?.published_at],
	)
	const accessUrl = useMemo(() => buildMicroAppAccessUrl(publishedItem), [publishedItem])
	const hasPublished = Boolean(publishedItem?.resource_id || publishedItem?.access_url)

	useEffect(() => {
		if (!open || !appId || !projectId) return

		let ignore = false

		async function loadPublishedInfo() {
			setLoading(true)
			try {
				const matchedItem = await loadPublishedMicroAppProject(
					appId,
					projectId,
					projectName,
				)
				if (ignore) return

				setPublishedItem(matchedItem)
				setFormState(
					matchedItem
						? createFormStateFromPublishedItem(matchedItem, projectName)
						: createDefaultFormState(projectName),
				)
			} catch (error) {
				if (ignore) return
				console.error("Failed to load micro app publish info:", error)
				setPublishedItem(null)
				setFormState(createDefaultFormState(projectName))
				magicToast.error(t("microAppPage.publish.loadFailed"))
			} finally {
				if (!ignore) setLoading(false)
			}
		}

		void loadPublishedInfo()

		return () => {
			ignore = true
		}
	}, [appId, open, projectId, projectName, t])

	useEffect(() => {
		if (open) return
		setLoading(false)
		setSaving(false)
		setUnpublishing(false)
	}, [open])

	const handleShareTypeChange = useCallback((shareType: ShareType) => {
		setFormState((prev) => {
			const nextShareType = shareType as MicroAppPublishShareType
			return {
				...prev,
				shareType: nextShareType,
				password:
					nextShareType === ShareType.PasswordProtected && !prev.password
						? generateSharePassword()
						: prev.password,
			}
		})
	}, [])

	const handleProjectNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setFormState((prev) => ({
			...prev,
			projectName: event.target.value,
		}))
	}, [])

	const handleShareRangeChange = useCallback((shareRange: ShareRange) => {
		setFormState((prev) => ({
			...prev,
			shareRange: shareRange as MicroAppPublishShareRange,
		}))
	}, [])

	const handleTargetsChange = useCallback((targets: ShareTarget[]) => {
		setFormState((prev) => ({
			...prev,
			targets: targets.map((target) => ({
				target_type: target.target_type,
				target_id: target.target_id,
			})),
		}))
	}, [])

	const handlePasswordChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setFormState((prev) => ({
			...prev,
			password: event.target.value,
		}))
	}, [])

	const handlePasswordReset = useCallback(() => {
		setFormState((prev) => ({
			...prev,
			password: generateSharePassword(),
		}))
	}, [])

	const handleCopyAccessUrl = useCallback(() => {
		if (!accessUrl) return
		clipboard.writeText(accessUrl)
		magicToast.success(t("microAppPage.publish.copySuccess"))
	}, [accessUrl, t])

	const handleCopyShareText = useCallback(() => {
		if (!accessUrl) return
		const password =
			publishedItem?.share_type === ShareType.PasswordProtected
				? (publishedItem.password || "").trim()
				: ""
		clipboard.writeText(
			buildMicroAppShareText({
				projectName: formState.projectName.trim() || projectName,
				accessUrl,
				password,
				passwordLabel: t("microAppPage.publish.password"),
			}),
		)
		magicToast.success(t("microAppPage.publish.shareTextCopySuccess"))
	}, [
		accessUrl,
		formState.projectName,
		projectName,
		publishedItem?.password,
		publishedItem?.share_type,
		t,
	])

	const handleSave = useCallback(async () => {
		if (!appId || !projectId || saving) return
		const nextProjectName = formState.projectName.trim()
		if (!nextProjectName) {
			magicToast.error(t("microAppPage.publish.projectNameRequired"))
			return
		}
		if (nextProjectName.length > 100) {
			magicToast.error(t("microAppPage.publish.projectNameTooLong"))
			return
		}
		if (formState.shareType === ShareType.PasswordProtected) {
			const passwordLength = formState.password.trim().length
			if (passwordLength < 4 || passwordLength > 32) {
				magicToast.error(t("microAppPage.publish.passwordInvalid"))
				return
			}
		}

		setSaving(true)
		try {
			const response = await SuperMagicApi.publishMicroAppProject(
				appId,
				buildMicroAppPublishPayload(formState),
			)
			const nextItem = getPublishedItemFromResponse(response)
			const savedProjectName = nextItem.project_name?.trim() || nextProjectName
			setPublishedItem({
				...nextItem,
				app_id: nextItem.app_id || appId,
				project_id: nextItem.project_id || projectId,
				project_name: savedProjectName,
				share_type: nextItem.share_type || formState.shareType,
				share_range: nextItem.share_range || formState.shareRange,
				target_ids: nextItem.target_ids || formState.targets,
				password: nextItem.password || formState.password,
			})
			setFormState((prev) => ({ ...prev, projectName: savedProjectName }))
			onProjectNameChange?.(savedProjectName)
			magicToast.success(t("microAppPage.publish.saveSuccess"))
		} catch (error) {
			console.error("Failed to publish micro app:", error)
			magicToast.error(t("microAppPage.publish.saveFailed"))
		} finally {
			setSaving(false)
		}
	}, [appId, formState, onProjectNameChange, projectId, saving, t])

	const handleUnpublish = useCallback(() => {
		if (!appId || unpublishing) return

		MagicModal.confirm({
			title: t("microAppPage.publish.unpublishConfirmTitle"),
			content: t("microAppPage.publish.unpublishConfirmContent"),
			okText: t("microAppPage.publish.unpublish"),
			cancelText: t("common.cancel"),
			variant: "destructive",
			onOk: async () => {
				setUnpublishing(true)
				try {
					await SuperMagicApi.unpublishMicroAppProject(appId)
					setPublishedItem(null)
					setFormState(createDefaultFormState(formState.projectName))
					magicToast.success(t("microAppPage.publish.unpublishSuccess"))
				} catch (error) {
					console.error("Failed to unpublish micro app:", error)
					magicToast.error(t("microAppPage.publish.unpublishFailed"))
				} finally {
					setUnpublishing(false)
				}
			},
		})
	}, [appId, formState.projectName, t, unpublishing])

	return (
		<MagicModal
			open={open}
			title={t("microAppPage.publish.title")}
			onCancel={() => onOpenChange(false)}
			footer={null}
			width={560}
			destroyOnClose
		>
			<div className="flex flex-col gap-4" data-testid="micro-app-publish-dialog">
				<div className="rounded-lg border border-border bg-muted/30 p-3">
					<Label htmlFor="micro-app-publish-project-name">
						{t("microAppPage.publish.projectName")}
					</Label>
					<Input
						id="micro-app-publish-project-name"
						value={formState.projectName}
						onChange={handleProjectNameChange}
						maxLength={100}
						className="mt-2 h-9 bg-background"
						data-testid="micro-app-publish-project-name"
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("microAppPage.publish.description")}
					</p>
				</div>

				{loading ? (
					<div
						className="flex min-h-48 items-center justify-center text-muted-foreground"
						data-testid="micro-app-publish-loading"
					>
						<Loader2 className="size-6 animate-spin" />
					</div>
				) : (
					<>
						{hasPublished ? (
							<div className="rounded-lg border border-border p-3">
								<div className="flex items-center gap-2">
									<Rocket className="size-4 text-primary" />
									<p className="text-sm font-medium text-foreground">
										{t("microAppPage.publish.published")}
									</p>
								</div>
								{publishedAtText ? (
									<p className="mt-1 text-xs text-muted-foreground">
										{t("microAppPage.publish.publishedAt", {
											time: publishedAtText,
										})}
									</p>
								) : null}
								{accessUrl ? (
									<div
										className="mt-3 rounded-md border border-border bg-muted/30 p-3"
										data-testid="micro-app-publish-quick-share"
									>
										<div className="flex items-center justify-between gap-3">
											<div className="min-w-0">
												<p className="text-sm font-medium text-foreground">
													{t("microAppPage.publish.quickShareTitle")}
												</p>
												<p className="mt-0.5 text-xs text-muted-foreground">
													{t(
														"microAppPage.publish.quickShareDescription",
													)}
												</p>
											</div>
											<div className="flex shrink-0 items-center gap-2">
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="h-8 gap-1.5"
													onClick={handleCopyAccessUrl}
													data-testid="micro-app-publish-copy-link"
												>
													<Copy className="size-3.5" />
													{t("microAppPage.publish.copyLink")}
												</Button>
												<Button
													type="button"
													size="sm"
													className="h-8 gap-1.5"
													onClick={handleCopyShareText}
													data-testid="micro-app-publish-copy-share-text"
												>
													<Copy className="size-3.5" />
													{t("microAppPage.publish.copyShareText")}
												</Button>
											</div>
										</div>
										<Input
											readOnly
											value={accessUrl}
											className="mt-3 h-9 min-w-0 bg-background"
											data-testid="micro-app-publish-access-url"
										/>
									</div>
								) : null}
							</div>
						) : null}

						<ShareTypeField
							value={formState.shareType as ShareType}
							onChange={handleShareTypeChange}
							availableTypes={MICRO_APP_PUBLISH_TYPES}
						/>

						{formState.shareType === ShareType.Organization ? (
							<ShareRangeField
								value={formState.shareRange}
								onChange={handleShareRangeChange}
								targets={formState.targets}
								onTargetsChange={handleTargetsChange}
								resourceId={publishedItem?.resource_id}
							/>
						) : null}

						{formState.shareType === ShareType.PasswordProtected ? (
							<div className="flex flex-col gap-2">
								<Label htmlFor="micro-app-publish-password">
									{t("microAppPage.publish.password")}
								</Label>
								<div className="flex items-center gap-2">
									<Input
										id="micro-app-publish-password"
										value={formState.password}
										onChange={handlePasswordChange}
										maxLength={32}
										className="h-9"
										data-testid="micro-app-publish-password"
									/>
									<Button
										type="button"
										variant="outline"
										size="icon"
										className="size-9 shrink-0"
										onClick={handlePasswordReset}
										aria-label={t("microAppPage.publish.resetPassword")}
									>
										<RefreshCw className="size-4" />
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									{t("microAppPage.publish.passwordHint")}
								</p>
							</div>
						) : null}
					</>
				)}

				<Separator />

				<div className="flex items-center justify-between gap-3">
					<div>
						{hasPublished ? (
							<Button
								type="button"
								variant="ghost"
								className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
								onClick={handleUnpublish}
								disabled={loading || saving || unpublishing}
								data-testid="micro-app-unpublish-button"
							>
								{unpublishing ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Trash2 className="size-4" />
								)}
								{t("microAppPage.publish.unpublish")}
							</Button>
						) : null}
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={saving || unpublishing}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							className="gap-2"
							onClick={handleSave}
							disabled={!projectId || loading || saving || unpublishing}
							data-testid="micro-app-publish-save"
						>
							{saving ? <Loader2 className="size-4 animate-spin" /> : null}
							{hasPublished
								? t("microAppPage.publish.update")
								: t("microAppPage.publish.publish")}
						</Button>
					</div>
				</div>
			</div>
		</MagicModal>
	)
}
