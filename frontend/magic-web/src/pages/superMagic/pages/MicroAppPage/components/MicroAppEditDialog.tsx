import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { FileApi, SuperMagicApi } from "@/apis"
import type { UpdateMicroAppBody } from "@/apis/modules/superMagic"
import magicToast from "@/components/base/MagicToaster/utils"
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
	isSubmitting = false,
	onOpenChange,
	onConfirm,
	onCaptureCover,
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
		if (!open || !appId) return

		let ignore = false
		async function loadMetadata() {
			setLoading(true)
			setCoverUploadError(false)
			revokeCoverObjectUrl()
			setInitialCoverFileKey(null)
			setCoverFileKey(null)
			setCoverUrl("")
			try {
				const detail = await SuperMagicApi.getMicroAppProject(appId)
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

	const handleCaptureCover = useCallback(async () => {
		if (!onCaptureCover || capturing) return
		setCapturing(true)
		try {
			const blob = await onCaptureCover()
			const file = new File([blob], `micro-app-cover-${Date.now()}.webp`, {
				type: blob.type || "image/webp",
			})
			setLocalCoverFile(file)
			magicToast.success(t("microAppPage.edit.captureSuccess"))
		} catch (error) {
			console.error("Failed to capture micro app cover:", error)
			magicToast.error(t("microAppPage.edit.captureFailed"))
		} finally {
			setCapturing(false)
		}
	}, [capturing, onCaptureCover, setLocalCoverFile, t])

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

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!isSubmitting && !uploading && !capturing) onOpenChange(nextOpen)
			}}
		>
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
										{loading
											? t("common.loading")
											: t("microAppPage.edit.coverEmpty")}
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
							{/* <Button
								type="button"
								variant="outline"
								className="gap-2"
								onClick={() => void handleCaptureCover()}
								disabled={
									!onCaptureCover ||
									capturing ||
									uploading ||
									loading ||
									isSubmitting
								}
								data-testid="micro-app-capture-cover"
							>
								{capturing ? (
									<Loader2 className="size-4 animate-spin" aria-hidden />
								) : (
									<Camera className="size-4" aria-hidden />
								)}
								{capturing
									? t("microAppPage.edit.capturing")
									: t("microAppPage.edit.captureCover")}
							</Button> */}
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

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={isSubmitting || uploading || capturing}
							onClick={() => onOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="submit"
							disabled={!canSubmit}
							data-testid="micro-app-edit-confirm"
						>
							{isSubmitting ? t("common.loading") : t("common.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
