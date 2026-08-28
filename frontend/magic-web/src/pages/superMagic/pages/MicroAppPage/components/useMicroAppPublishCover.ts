import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type Dispatch,
	type SetStateAction,
} from "react"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import { useUpload } from "@/hooks/useUploadFiles"
import type { MicroAppPublishFormState } from "./microAppPublishDialogUtils"

const MAX_COVER_FILE_SIZE = 10 * 1024 * 1024

/** 管理发布封面的上传、临时预览 URL 和关闭弹窗时的资源释放。 */
export default function useMicroAppPublishCover(
	setFormState: Dispatch<SetStateAction<MicroAppPublishFormState>>,
) {
	const { t } = useTranslation("super")
	const coverInputRef = useRef<HTMLInputElement>(null)
	const coverObjectUrlRef = useRef<string | null>(null)
	const [coverUploadError, setCoverUploadError] = useState(false)
	const { uploadAndGetFileUrl, uploading: coverUploading } = useUpload({
		storageType: "public",
		useSnowflakeId: true,
	})

	const revokeCoverObjectUrl = useCallback(() => {
		if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current)
		coverObjectUrlRef.current = null
	}, [])

	useEffect(() => () => revokeCoverObjectUrl(), [revokeCoverObjectUrl])

	const clearCoverUploadError = useCallback(() => setCoverUploadError(false), [])

	const resetCoverUploadState = useCallback(() => {
		setCoverUploadError(false)
		revokeCoverObjectUrl()
	}, [revokeCoverObjectUrl])

	const uploadCoverFile = useCallback(
		async (file: File) => {
			try {
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
			} catch (error) {
				setCoverUploadError(true)
				magicToast.error(t("microAppPage.publish.coverUploadFailed"))
				console.error("Failed to upload micro app cover:", error)
			}
		},
		[revokeCoverObjectUrl, setFormState, t, uploadAndGetFileUrl],
	)

	const handleCoverFile = useCallback(
		(file: File) => {
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
		[revokeCoverObjectUrl, setFormState, t, uploadCoverFile],
	)

	const handleCoverChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0]
			event.target.value = ""
			if (file) handleCoverFile(file)
		},
		[handleCoverFile],
	)

	const handleClearCover = useCallback(() => {
		revokeCoverObjectUrl()
		setCoverUploadError(false)
		setFormState((prev) => ({ ...prev, coverFileKey: null, coverUrl: "" }))
	}, [revokeCoverObjectUrl, setFormState])

	return {
		coverInputRef,
		coverUploading,
		coverUploadError,
		clearCoverUploadError,
		resetCoverUploadState,
		handleCoverFile,
		handleCoverChange,
		handleClearCover,
	}
}
