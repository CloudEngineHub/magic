import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import { FileApi, SuperMagicApi } from "@/apis"
import type { PublishedMicroAppProjectItem } from "@/apis/modules/superMagic"
import MagicModal from "@/components/base/MagicModal"
import magicToast from "@/components/base/MagicToaster/utils"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { useUpload } from "@/hooks/useUploadFiles"
import type { ShareRange, ShareTarget } from "@/pages/superMagic/components/Share/ShareFields"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import { generateSharePassword } from "@/pages/superMagic/components/Share/utils"
import { clipboard } from "@/utils/clipboard-helpers"
import { isMicroAppPublished } from "../utils/microAppPublish"
import {
	buildMicroAppAccessUrl,
	buildMicroAppPublishPayload,
	buildMicroAppShareText,
	createDefaultMicroAppPublishFormState as createDefaultFormState,
	createFormStateFromPublishedItem,
	formatMicroAppPublishedAt as formatPublishedAt,
	getMicroAppPublishValidationError,
	getPublishedItemFromResponse,
	type MicroAppPublishFormState,
} from "./microAppPublishDialogUtils"
import MicroAppPublishDialogContent from "./MicroAppPublishDialogContent"

export {
	buildMicroAppAccessUrl,
	buildMicroAppPublishPayload,
	buildMicroAppShareText,
	getMicroAppPublishValidationError,
} from "./microAppPublishDialogUtils"

interface MicroAppPublishDialogProps {
	open: boolean
	appId?: string
	projectName?: string
	mobile?: boolean
	onProjectNameChange?: (projectName: string) => void
	onPublishStatusChange?: (published: boolean) => void
	onOpenChange: (open: boolean) => void
}

const MAX_COVER_FILE_SIZE = 10 * 1024 * 1024

export default function MicroAppPublishDialog({
	open,
	appId,
	projectName,
	mobile = false,
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
	const validationError = useMemo(() => getMicroAppPublishValidationError(formState), [formState])
	const validationMessage = validationError ? t(`microAppPage.publish.${validationError}`) : ""

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
						const fileUrl = await FileApi.getFileUrl(nextItem.cover_file_key)
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
				accessUrl,
				shareTitle: t("microAppPage.publish.shareTextTitle", {
					projectName: formState.appName.trim() || projectName,
				}),
				accessHint: t("microAppPage.publish.shareTextAccessHint"),
				passwordText: password
					? t("microAppPage.publish.shareTextPassword", { password })
					: undefined,
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
		const nextValidationError = getMicroAppPublishValidationError(formState)
		if (nextValidationError) {
			magicToast.error(t(`microAppPage.publish.${nextValidationError}`))
			return
		}
		const nextAppName = formState.appName.trim()

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

	const closeDialog = () => onOpenChange(false)
	const isBusy = saving || unpublishing || coverUploading
	const content = (
		<MicroAppPublishDialogContent
			mobile={mobile}
			appId={appId}
			formState={formState}
			publishedItem={publishedItem}
			publishedAtText={publishedAtText}
			accessUrl={accessUrl}
			hasPublished={hasPublished}
			loading={loading}
			saving={saving}
			unpublishing={unpublishing}
			coverUploading={coverUploading}
			coverUploadError={coverUploadError}
			validationError={validationError}
			validationMessage={validationMessage}
			coverInputRef={coverInputRef}
			onAppNameChange={handleAppNameChange}
			onCoverChange={handleCoverChange}
			onClearCover={handleClearCover}
			onShareTypeChange={handleShareTypeChange}
			onShareRangeChange={handleShareRangeChange}
			onTargetsChange={handleTargetsChange}
			onPasswordChange={handlePasswordChange}
			onPasswordReset={handlePasswordReset}
			onCopyAccessUrl={handleCopyAccessUrl}
			onCopyShareText={handleCopyShareText}
			onUnpublish={handleUnpublish}
			onClose={closeDialog}
			onSave={handleSave}
		/>
	)

	if (mobile) {
		return (
			<MagicPopup
				visible={open}
				onClose={closeDialog}
				position="bottom"
				title={t("microAppPage.publish.title")}
				headerVariant="actionHeader"
				headerTitle={t("microAppPage.publish.title")}
				headerLeadingAction={{
					icon: <X />,
					ariaLabel: t("common.cancel"),
					onClick: closeDialog,
					disabled: isBusy,
					testId: "micro-app-publish-close",
				}}
				dismissible={!isBusy}
				maskClosable={!isBusy}
				className="h-[88dvh] max-h-[88dvh] rounded-t-[20px] border-0 p-0"
				bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
			>
				{content}
			</MagicPopup>
		)
	}

	return (
		<MagicModal
			open={open}
			title={t("microAppPage.publish.title")}
			onCancel={closeDialog}
			footer={null}
			width={560}
			destroyOnClose
		>
			{content}
		</MagicModal>
	)
}
