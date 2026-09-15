import { useCallback, useEffect, useRef, useState } from "react"
import { ImagePlus, Loader2, Trash2, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { FileApi, SuperMagicApi } from "@/apis"
import type { UpdateMicroAppBody } from "@/apis/modules/superMagic"
import magicToast from "@/components/base/MagicToaster/utils"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import { useUpload } from "@/hooks/useUploadFiles"
import { shouldSuppressInputAutoFocusInMagicApp } from "@/utils/inputFocusPolicy"

interface MicroAppEditDialogProps {
	open: boolean
	appId?: string
	projectName?: string
	mobile?: boolean
	isSubmitting?: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (changes: UpdateMicroAppBody) => Promise<boolean>
	onCaptureCover?: () => Promise<Blob>
}

const MAX_COVER_FILE_SIZE = 10 * 1024 * 1024

/** 编辑微应用名称和封面，桌面端与移动端共用同一套保存逻辑。 */
export default function MicroAppEditDialog({
	open,
	appId,
	projectName,
	mobile = false,
	isSubmitting = false,
	onOpenChange,
	onConfirm,
}: MicroAppEditDialogProps) {
	const { t } = useTranslation("super")
	const coverInputRef = useRef<HTMLInputElement>(null)
	const coverObjectUrlRef = useRef<string | null>(null)
	const [nameInput, setNameInput] = useState("")
	const [initialName, setInitialName] = useState("")
	const [initialCoverFileKey, setInitialCoverFileKey] = useState<string | null>(null)
	const [coverFileKey, setCoverFileKey] = useState<string | null | undefined>(null)
	const [coverUrl, setCoverUrl] = useState("")
	const [loading, setLoading] = useState(false)
	const [capturing, setCapturing] = useState(false)
	const [coverUploadError, setCoverUploadError] = useState(false)
	const shouldAutoFocusInput = !shouldSuppressInputAutoFocusInMagicApp()

	const revokeCoverObjectUrl = useCallback(() => {
		if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current)
		coverObjectUrlRef.current = null
	}, [])

	const { uploadAndGetFileUrl, uploading } = useUpload({
		storageType: "public",
		useSnowflakeId: true,
	})

	useEffect(() => {
		if (!open) return
		const nextName = projectName || ""
		setNameInput(nextName)
		setInitialName(nextName.trim())
	}, [open, projectName])

	useEffect(() => {
		const currentAppId = appId
		if (!open || !currentAppId) return

		let ignore = false
		async function loadMetadata() {
			setLoading(true)
			setCoverUploadError(false)
			revokeCoverObjectUrl()
			setInitialCoverFileKey(null)
			setCoverFileKey(null)
			setCoverUrl("")
			try {
				const detail = await SuperMagicApi.getMicroAppProject(currentAppId)
				if (ignore) return

				const nextCoverFileKey = detail.publish?.cover_file_key ?? null
				setInitialCoverFileKey(nextCoverFileKey)
				setCoverFileKey(nextCoverFileKey)
				const nextName = detail.project?.project_name || projectName || ""
				setNameInput(nextName)
				setInitialName(nextName.trim())
				setCoverUrl("")

				if (nextCoverFileKey) {
					const fileUrl = await FileApi.getFileUrl(nextCoverFileKey)
					if (!ignore) setCoverUrl(fileUrl.url)
				}
			} catch (error) {
				if (ignore) return
				console.error("Failed to load micro app metadata:", error)
				magicToast.error(t("microAppPage.edit.loadFailed"))
			} finally {
				if (!ignore) setLoading(false)
			}
		}

		void loadMetadata()
		return () => {
			ignore = true
		}
	}, [appId, open, projectName, revokeCoverObjectUrl, t])

	useEffect(() => {
		if (open) return
		setLoading(false)
		setCapturing(false)
		setCoverUploadError(false)
		revokeCoverObjectUrl()
	}, [open, revokeCoverObjectUrl])

	useEffect(() => () => revokeCoverObjectUrl(), [revokeCoverObjectUrl])

	const uploadCoverFile = useCallback(
		async (file: File) => {
			const { fullfilled } = await uploadAndGetFileUrl([
				{ name: file.name, file, status: "init" },
			])
			const uploadedFile = fullfilled[0]?.value
			if (!uploadedFile?.path) {
				setCoverUploadError(true)
				magicToast.error(t("microAppPage.edit.coverUploadFailed"))
				return
			}

			setCoverUploadError(false)
			setCoverFileKey(uploadedFile.path)
			if (uploadedFile.url) {
				revokeCoverObjectUrl()
				setCoverUrl(uploadedFile.url)
			}
		},
		[revokeCoverObjectUrl, t, uploadAndGetFileUrl],
	)

	const setLocalCoverFile = useCallback(
		(file: File) => {
			revokeCoverObjectUrl()
			setCoverUploadError(false)
			coverObjectUrlRef.current = URL.createObjectURL(file)
			setCoverUrl(coverObjectUrlRef.current)
			setCoverFileKey(undefined)
			void uploadCoverFile(file)
		},
		[revokeCoverObjectUrl, uploadCoverFile],
	)

	const handleCoverFile = useCallback(
		(file: File) => {
			if (!file.type.startsWith("image/")) {
				magicToast.error(t("microAppPage.edit.coverInvalidType"))
				return
			}
			if (file.size > MAX_COVER_FILE_SIZE) {
				magicToast.error(t("microAppPage.edit.coverTooLarge"))
				return
			}
			setLocalCoverFile(file)
		},
		[setLocalCoverFile, t],
	)

	const handleCoverChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0]
			event.target.value = ""
			if (!file) return
			handleCoverFile(file)
		},
		[handleCoverFile],
	)

	useEffect(() => {
		if (!open || loading || capturing || uploading || isSubmitting) return

		const handlePaste = (event: ClipboardEvent) => {
			const clipboardData = event.clipboardData
			if (!clipboardData) return

			const clipboardFiles = Array.from(clipboardData.files ?? [])
			const imageFile =
				clipboardFiles.find((file) => file.type.startsWith("image/")) ??
				Array.from(clipboardData.items ?? [])
					.find((item) => item.kind === "file" && item.type.startsWith("image/"))
					?.getAsFile()

			if (!imageFile) return
			event.preventDefault()
			handleCoverFile(imageFile)
		}

		document.addEventListener("paste", handlePaste)
		return () => document.removeEventListener("paste", handlePaste)
	}, [capturing, handleCoverFile, isSubmitting, loading, open, uploading])

	const handleClearCover = useCallback(() => {
		revokeCoverObjectUrl()
		setCoverUploadError(false)
		setCoverFileKey(null)
		setCoverUrl("")
	}, [revokeCoverObjectUrl])

	const trimmedName = nameInput.trim()
	const nameChanged = Boolean(trimmedName && trimmedName !== initialName)
	const coverChanged = coverFileKey !== undefined && coverFileKey !== initialCoverFileKey
	const canSubmit = Boolean(
		trimmedName &&
		(nameChanged || coverChanged) &&
		!loading &&
		!capturing &&
		!uploading &&
		!coverUploadError &&
		!isSubmitting,
	)

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!canSubmit) return

		const changes: UpdateMicroAppBody = {}
		if (nameChanged) changes.app_name = trimmedName
		if (coverChanged) changes.cover_file_key = coverFileKey

		const updated = await onConfirm(changes)
		if (updated) onOpenChange(false)
	}

	function handleContainerOpenChange(nextOpen: boolean) {
		if (!isSubmitting && !uploading && !capturing) onOpenChange(nextOpen)
	}

	const formFields = (
		<>
			<label className="flex flex-col gap-2 text-sm font-medium text-foreground">
				<span>{t("microAppPage.edit.nameLabel")}</span>
				<Input
					autoFocus={shouldAutoFocusInput}
					maxLength={100}
					value={nameInput}
					placeholder={t("microAppPage.edit.namePlaceholder")}
					disabled={loading || isSubmitting}
					onChange={(event) => setNameInput(event.target.value)}
					data-testid="micro-app-edit-name-input"
				/>
			</label>

			<div className="flex flex-col gap-2">
				<div>
					<p className="text-sm font-medium text-foreground">
						{t("microAppPage.edit.coverLabel")}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("microAppPage.edit.coverDescription")}
					</p>
				</div>

				<div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border bg-muted">
					{coverUrl ? (
						<img
							src={coverUrl}
							alt={t("microAppPage.edit.coverPreviewAlt")}
							className="size-full object-cover"
							data-testid="micro-app-edit-cover-preview"
						/>
					) : (
						<div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
							<ImagePlus className="size-7" aria-hidden />
							<span className="text-xs">
								{loading ? t("common.loading") : t("microAppPage.edit.coverEmpty")}
							</span>
						</div>
					)}
					{coverUrl ? (
						<Button
							type="button"
							variant="secondary"
							size="icon"
							className="absolute right-2 top-2 size-8 bg-background/90"
							onClick={handleClearCover}
							disabled={uploading || capturing || isSubmitting}
							aria-label={t("microAppPage.edit.clearCover")}
						>
							<Trash2 className="size-4" aria-hidden />
						</Button>
					) : null}
				</div>

				<input
					ref={coverInputRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={handleCoverChange}
				/>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						className="gap-2"
						onClick={() => coverInputRef.current?.click()}
						disabled={capturing || uploading || loading || isSubmitting}
					>
						{uploading ? (
							<Loader2 className="size-4 animate-spin" aria-hidden />
						) : (
							<ImagePlus className="size-4" aria-hidden />
						)}
						{uploading
							? t("microAppPage.edit.uploading")
							: t("microAppPage.edit.uploadCover")}
					</Button>
				</div>
			</div>
		</>
	)

	const cancelButton = (
		<Button
			type="button"
			variant="outline"
			className={mobile ? "h-11 w-full" : undefined}
			disabled={isSubmitting || uploading || capturing}
			onClick={() => onOpenChange(false)}
		>
			{t("common.cancel")}
		</Button>
	)
	const saveButton = (
		<Button
			type="submit"
			className={mobile ? "h-11 w-full" : undefined}
			disabled={!canSubmit}
			data-testid="micro-app-edit-confirm"
		>
			{isSubmitting ? t("common.loading") : t("common.save")}
		</Button>
	)

	if (mobile) {
		const isBusy = isSubmitting || uploading || capturing
		const closeMobilePopup = () => handleContainerOpenChange(false)

		return (
			<MagicPopup
				visible={open}
				onClose={closeMobilePopup}
				position="bottom"
				title={t("microAppPage.edit.title")}
				headerVariant="actionHeader"
				headerTitle={t("microAppPage.edit.title")}
				headerLeadingAction={{
					icon: <X />,
					ariaLabel: t("common.cancel"),
					onClick: closeMobilePopup,
					disabled: isBusy,
					testId: "micro-app-edit-close",
				}}
				dismissible={!isBusy}
				maskClosable={!isBusy}
				className="max-h-[88dvh] rounded-t-[20px] border-0 p-0"
				bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
			>
				<div
					className="flex min-h-0 flex-1 flex-col overflow-hidden"
					data-testid="micro-app-edit-dialog"
					data-mobile="true"
				>
					<form
						className="flex min-h-0 flex-1 flex-col overflow-hidden"
						onSubmit={handleSubmit}
					>
						<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-5 pt-1">
							{formFields}
						</div>
						<div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-background px-4 pb-4 pt-3">
							{saveButton}
							{cancelButton}
						</div>
					</form>
				</div>
			</MagicPopup>
		)
	}

	return (
		<Dialog open={open} onOpenChange={handleContainerOpenChange}>
			<DialogContent
				className="sm:max-w-[520px]"
				showCloseButton={!isSubmitting && !uploading && !capturing}
				data-testid="micro-app-edit-dialog"
				onOpenAutoFocus={(event) => {
					if (!shouldAutoFocusInput) event.preventDefault()
				}}
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{t("microAppPage.edit.title")}</DialogTitle>
					<DialogDescription>{t("microAppPage.edit.description")}</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-5" onSubmit={handleSubmit}>
					{formFields}

					<DialogFooter>
						{cancelButton}
						{saveButton}
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
