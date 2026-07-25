import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Copy, ImagePlus, Loader2, RefreshCw, Rocket, Trash2, X } from "lucide-react"
import { SuperMagicApi } from "@/apis"
import type {
	MicroAppPublishShareRange,
	MicroAppPublishShareType,
	MicroAppPublishTarget,
	PublishedMicroAppProjectItem,
	PublishMicroAppProjectBody,
} from "@/apis/modules/superMagic"
import MagicModal from "@/components/base/MagicModal"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Label } from "@/components/shadcn-ui/label"
import { Separator } from "@/components/shadcn-ui/separator"
import { useUpload } from "@/hooks/useUploadFiles"
import {
	ShareRangeField,
	ShareTypeField,
	type ShareRange,
	type ShareTarget,
} from "@/pages/superMagic/components/Share/ShareFields"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import { generateSharePassword } from "@/pages/superMagic/components/Share/utils"
import { clipboard } from "@/utils/clipboard-helpers"
import { isMicroAppPublished } from "../utils/microAppPublish"

interface MicroAppPublishDialogProps {
	open: boolean
	appId?: string
	projectName?: string
	onProjectNameChange?: (projectName: string) => void
	onPublishStatusChange?: (published: boolean) => void
	onOpenChange: (open: boolean) => void
}

interface MicroAppPublishFormState {
	appName: string
	shareType: MicroAppPublishShareType
	shareRange: MicroAppPublishShareRange
	targets: MicroAppPublishTarget[]
	password: string
	coverFileKey?: string | null
	coverUrl: string
}

const MICRO_APP_PUBLISH_TYPES = [
	ShareType.Organization,
	ShareType.Public,
	ShareType.PasswordProtected,
]
const MAX_COVER_FILE_SIZE = 10 * 1024 * 1024

function createDefaultFormState(appName = ""): MicroAppPublishFormState {
	return {
		appName,
		shareType: ShareType.Organization,
		shareRange: "all",
		targets: [],
		password: generateSharePassword(),
		coverFileKey: undefined,
		coverUrl: "",
	}
}

export function buildMicroAppPublishPayload(
	formState: MicroAppPublishFormState,
): PublishMicroAppProjectBody {
	const payload: PublishMicroAppProjectBody = {
		app_name: formState.appName.trim(),
		share_type: formState.shareType,
	}

	if (formState.coverFileKey !== undefined) {
		payload.cover_file_key = formState.coverFileKey
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

function createFormStateFromPublishedItem(
	item: PublishedMicroAppProjectItem | null,
	appName?: string,
): MicroAppPublishFormState {
	return {
		appName: item?.app_name || appName || "",
		shareType: item?.share_type || ShareType.Organization,
		shareRange: item?.share_range || "all",
		targets: item?.target_ids || [],
		password: item?.password || generateSharePassword(),
		coverFileKey: item?.cover_file_key ?? undefined,
		coverUrl: item?.cover_url || "",
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
	if (item.access_url) return item.access_url
	if (item.app_id) return `${window.location.origin}/micro-app/${item.app_id}`
	return ""
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
	projectName,
	onProjectNameChange,
	onPublishStatusChange,
	onOpenChange,
}: MicroAppPublishDialogProps) {
	const { t } = useTranslation("super")
	const coverInputRef = useRef<HTMLInputElement>(null)
	const coverObjectUrlRef = useRef<string | null>(null)
	const [formState, setFormState] = useState<MicroAppPublishFormState>(() =>
		createDefaultFormState(),
	)
	const [publishedItem, setPublishedItem] = useState<PublishedMicroAppProjectItem | null>(null)
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [unpublishing, setUnpublishing] = useState(false)
	const [coverUploadError, setCoverUploadError] = useState(false)

	const { uploadAndGetFileUrl, uploading } = useUpload({
		storageType: "public",
		useSnowflakeId: true,
	})

	const publishedAtText = useMemo(
		() => formatPublishedAt(publishedItem?.published_at),
		[publishedItem?.published_at],
	)
	const accessUrl = useMemo(() => buildMicroAppAccessUrl(publishedItem), [publishedItem])
	const hasPublished = isMicroAppPublished(publishedItem)
	const coverUploading = uploading

	const revokeCoverObjectUrl = useCallback(() => {
		if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current)
		coverObjectUrlRef.current = null
	}, [])

	useEffect(() => {
		if (!open || !appId) return

		let ignore = false

		async function loadPublishedInfo() {
			setLoading(true)
			setCoverUploadError(false)
			try {
				const detail = await SuperMagicApi.getMicroAppProject(appId)
				if (ignore) return

				const nextItem = detail.publish || null
				const nextFormState = createFormStateFromPublishedItem(
					nextItem,
					detail.project?.project_name || projectName,
				)

				if (nextItem?.cover_file_key && !nextFormState.coverUrl) {
					try {
						const fileUrl = await SuperMagicApi.getFileUrl(nextItem.cover_file_key)
						if (ignore) return
						nextFormState.coverUrl = fileUrl.url
					} catch (error) {
						console.error("Failed to resolve micro app cover url:", error)
					}
				}

				if (ignore) return
				setPublishedItem(nextItem)
				setFormState(nextFormState)
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
	}, [appId, open, projectName, t])

	useEffect(() => {
		if (open) return
		setLoading(false)
		setSaving(false)
		setUnpublishing(false)
		setCoverUploadError(false)
		revokeCoverObjectUrl()
	}, [open, revokeCoverObjectUrl])

	useEffect(() => () => revokeCoverObjectUrl(), [revokeCoverObjectUrl])

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

	const handleAppNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setFormState((prev) => ({ ...prev, appName: event.target.value }))
	}, [])

	const uploadCoverFile = useCallback(
		async (file: File) => {
			const { fullfilled } = await uploadAndGetFileUrl([
				{ name: file.name, file, status: "init" },
			])
			const uploadedFile = fullfilled[0]?.value
			if (!uploadedFile?.path) {
				setCoverUploadError(true)
				magicToast.error(t("microAppPage.publish.coverUploadFailed"))
				return
			}

			setCoverUploadError(false)
			setFormState((prev) => ({
				...prev,
				coverFileKey: uploadedFile.path,
				coverUrl: uploadedFile.url || prev.coverUrl,
			}))
			if (uploadedFile.url) revokeCoverObjectUrl()
		},
		[revokeCoverObjectUrl, t, uploadAndGetFileUrl],
	)

	const handleCoverChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0]
			event.target.value = ""
			if (!file) return
			if (!file.type.startsWith("image/")) {
				magicToast.error(t("microAppPage.publish.coverInvalidType"))
				return
			}
			if (file.size > MAX_COVER_FILE_SIZE) {
				magicToast.error(t("microAppPage.publish.coverTooLarge"))
				return
			}

			revokeCoverObjectUrl()
			setCoverUploadError(false)
			coverObjectUrlRef.current = URL.createObjectURL(file)
			setFormState((prev) => ({
				...prev,
				coverFileKey: undefined,
				coverUrl: coverObjectUrlRef.current || "",
			}))
			void uploadCoverFile(file)
		},
		[revokeCoverObjectUrl, t, uploadCoverFile],
	)

	const handleClearCover = useCallback(() => {
		revokeCoverObjectUrl()
		setCoverUploadError(false)
		setFormState((prev) => ({ ...prev, coverFileKey: null, coverUrl: "" }))
	}, [revokeCoverObjectUrl])

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
		setFormState((prev) => ({ ...prev, password: event.target.value }))
	}, [])

	const handlePasswordReset = useCallback(() => {
		setFormState((prev) => ({ ...prev, password: generateSharePassword() }))
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
				projectName: formState.appName.trim() || projectName,
				accessUrl,
				password,
				passwordLabel: t("microAppPage.publish.password"),
			}),
		)
		magicToast.success(t("microAppPage.publish.shareTextCopySuccess"))
	}, [
		accessUrl,
		formState.appName,
		projectName,
		publishedItem?.password,
		publishedItem?.share_type,
		t,
	])

	const handleSave = useCallback(async () => {
		if (!appId || saving || coverUploading || coverUploadError) return
		const nextAppName = formState.appName.trim()
		if (!nextAppName) {
			magicToast.error(t("microAppPage.publish.projectNameRequired"))
			return
		}
		if (nextAppName.length > 100) {
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
			const savedAppName = nextItem.app_name || nextAppName
			const savedCoverFileKey = nextItem.cover_file_key ?? formState.coverFileKey
			setPublishedItem({
				...nextItem,
				app_id: nextItem.app_id || appId,
				app_name: savedAppName,
				cover_file_key: savedCoverFileKey,
				cover_url: nextItem.cover_url || formState.coverUrl,
				share_type: nextItem.share_type || formState.shareType,
				share_range: nextItem.share_range || formState.shareRange,
				target_ids: nextItem.target_ids || formState.targets,
				password: nextItem.password || formState.password,
			})
			setFormState((prev) => ({
				...prev,
				appName: savedAppName,
				coverFileKey: savedCoverFileKey,
				coverUrl: nextItem.cover_url || prev.coverUrl,
			}))
			onProjectNameChange?.(savedAppName)
			onPublishStatusChange?.(true)
			magicToast.success(t("microAppPage.publish.saveSuccess"))
		} catch (error) {
			console.error("Failed to publish micro app:", error)
			magicToast.error(t("microAppPage.publish.saveFailed"))
		} finally {
			setSaving(false)
		}
	}, [
		appId,
		coverUploadError,
		coverUploading,
		formState,
		onProjectNameChange,
		onPublishStatusChange,
		saving,
		t,
	])

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
					setFormState((prev) => ({
						...createDefaultFormState(prev.appName),
						coverFileKey: prev.coverFileKey,
						coverUrl: prev.coverUrl,
					}))
					onPublishStatusChange?.(false)
					magicToast.success(t("microAppPage.publish.unpublishSuccess"))
				} catch (error) {
					console.error("Failed to unpublish micro app:", error)
					magicToast.error(t("microAppPage.publish.unpublishFailed"))
				} finally {
					setUnpublishing(false)
				}
			},
		})
	}, [appId, onPublishStatusChange, t, unpublishing])

	return (
		<MagicModal
			open={open}
			title={t("microAppPage.publish.title")}
			onCancel={() => onOpenChange(false)}
			footer={null}
			width={560}
			destroyOnClose
		>
			<div
				className="flex max-h-[80dvh] min-h-0 flex-col gap-4"
				data-testid="micro-app-publish-dialog"
			>
				<div
					className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
					data-testid="micro-app-publish-scroll-area"
				>
					<div className="rounded-lg border border-border bg-muted/30 p-3">
						<Label htmlFor="micro-app-publish-project-name">
							{t("microAppPage.publish.projectName")}
						</Label>
						<Input
							id="micro-app-publish-project-name"
							value={formState.appName}
							onChange={handleAppNameChange}
							maxLength={100}
							className="mt-2 h-9 bg-background"
							data-testid="micro-app-publish-project-name"
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							{t("microAppPage.publish.description")}
						</p>
					</div>

					<div className="rounded-lg border border-border bg-muted/30 p-3">
						<div className="flex items-center justify-between gap-3">
							<div>
								<Label>{t("microAppPage.publish.cover")}</Label>
								<p className="mt-1 text-xs text-muted-foreground">
									{t("microAppPage.publish.coverDescription")}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<input
									ref={coverInputRef}
									type="file"
									accept="image/*"
									className="hidden"
									onChange={handleCoverChange}
									data-testid="micro-app-cover-input"
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => coverInputRef.current?.click()}
									disabled={coverUploading || loading || saving}
									data-testid="micro-app-cover-upload"
								>
									{coverUploading ? (
										<Loader2 className="mr-1.5 size-3.5 animate-spin" />
									) : (
										<ImagePlus className="mr-1.5 size-3.5" />
									)}
									{t("microAppPage.publish.coverUpload")}
								</Button>
								{formState.coverFileKey !== undefined || formState.coverUrl ? (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-8 text-muted-foreground"
										onClick={handleClearCover}
										aria-label={t("microAppPage.publish.coverClear")}
										data-testid="micro-app-cover-clear"
									>
										<X className="size-4" />
									</Button>
								) : null}
							</div>
						</div>
						<div className="mt-3 overflow-hidden rounded-md border border-border bg-background">
							{formState.coverUrl ? (
								<img
									src={formState.coverUrl}
									alt=""
									className="h-28 w-full object-cover"
									data-testid="micro-app-cover-preview"
								/>
							) : (
								<div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
									{formState.coverFileKey
										? t("microAppPage.publish.coverSet")
										: t("microAppPage.publish.coverEmpty")}
								</div>
							)}
						</div>
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
				</div>

				<Separator />

				<div className="flex items-center justify-between gap-3">
					<div>
						{hasPublished ? (
							<Button
								type="button"
								variant="ghost"
								className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
								onClick={handleUnpublish}
								disabled={
									loading ||
									saving ||
									unpublishing ||
									coverUploading ||
									coverUploadError
								}
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
							disabled={saving || unpublishing || coverUploading || coverUploadError}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							className="gap-2"
							onClick={handleSave}
							disabled={
								!appId ||
								loading ||
								saving ||
								unpublishing ||
								coverUploading ||
								coverUploadError
							}
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
