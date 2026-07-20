import { useMemoizedFn } from "ahooks"
import { last } from "lodash-es"
import { useRef, useState } from "react"
import { AttachmentItem } from "../../TopicFilesButton/hooks"
import { ProjectListItem } from "../../../pages/Workspace/types"
import { useTranslation } from "react-i18next"
import { IMAGE_EXTENSIONS } from "@/constants/file"
import { UploadModal } from "../components/UploadModal"
import type { AddFilesOptions } from "../stores/FileUploadStore"

const imageExtensions = new Set(
	[...IMAGE_EXTENSIONS, "avif", "bmp", "heic", "heif", "ico", "tif", "tiff"].map((extension) =>
		extension.toLowerCase(),
	),
)

export function isImageUploadFile(file: File) {
	if (file.type.toLowerCase().startsWith("image/")) return true

	const extension = file.name.split(".").pop()?.toLowerCase()
	return Boolean(extension && imageExtensions.has(extension))
}

function useChooseUploadDirModal({
	addFiles: _addFiles,
	selectedProject,
	attachments,
	validateFileSize,
	validateFileCount,
}: {
	selectedProject?: ProjectListItem | null
	addFiles: (
		files: File[],
		path?: string,
		options?: AddFilesOptions | string,
	) => Promise<unknown> | unknown
	attachments?: AttachmentItem[]
	validateFileSize: (files: File[]) => { validFiles: File[]; hasWarning: boolean }
	validateFileCount: (files: File[]) => { validFiles: File[]; hasError: boolean }
}) {
	const [selectDirectoryModalVisible, setSelectDirectoryModalVisible] = useState(false)
	const [uploadFiles, setUploadFiles] = useState<File[]>([])
	const { t } = useTranslation("super")

	const chooseDirPromise = useRef<Promise<{ path: AttachmentItem[]; files: File[] }> | null>(null)
	const chooseDirResolve = useRef<
		((value: { path: AttachmentItem[]; files: File[] }) => void) | null
	>(null)
	const chooseDirReject = useRef<
		((value: { type: "cancel" | "error"; message?: string }) => void) | null
	>(null)

	const addFiles = useMemoizedFn(async (files: File[]) => {
		const imageFiles = files.filter(isImageUploadFile)
		const filesRequiringDirectory = files.filter((file) => !isImageUploadFile(file))

		// Editor images are transient message assets, so keep them out of the visible
		// project tree. Without a selected project, the temp path metadata is retained
		// on the upload mention and resolved after the message creates its project.
		if (imageFiles.length > 0) {
			await _addFiles(imageFiles, undefined, { useTempDirectory: true })
		}

		if (filesRequiringDirectory.length === 0) return
		if (!selectedProject) {
			await _addFiles(filesRequiringDirectory, undefined, "upload")
			return
		}

		setUploadFiles(filesRequiringDirectory)
		setSelectDirectoryModalVisible(true)

		// 如果当前有选择目录的请求，则等待请求完成
		chooseDirPromise.current = chooseDirPromise.current
			? chooseDirPromise.current
			: new Promise<{ path: AttachmentItem[]; files: File[] }>((resolve, reject) => {
					chooseDirResolve.current = resolve
					chooseDirReject.current = reject
				})

		try {
			const { path, files: editedFiles } = await chooseDirPromise.current

			if (path.length > 0) {
				const parentId = last(path)?.file_id
				_addFiles(editedFiles, parentId)
			} else {
				_addFiles(editedFiles, undefined)
			}
		} catch (err: unknown) {
			if (err && typeof err === "object" && "type" in err && err.type === "cancel") {
				console.log("Canceled")
			} else {
				console.error("Error", err)
			}
		} finally {
			chooseDirResolve.current = null
			chooseDirReject.current = null
			chooseDirPromise.current = null
			setUploadFiles([])
		}
	})

	const onModalClose = useMemoizedFn(() => {
		chooseDirReject.current?.({ type: "cancel" })
		chooseDirResolve.current = null
		chooseDirReject.current = null
		setSelectDirectoryModalVisible(false)
	})

	const onModalSubmit = useMemoizedFn((value: { path: AttachmentItem[]; files: File[] }) => {
		chooseDirResolve.current?.(value)
		chooseDirResolve.current = null
		chooseDirReject.current = null
		setSelectDirectoryModalVisible(false)
	})

	const UploadModalComponent = selectedProject && (
		<UploadModal
			visible={selectDirectoryModalVisible}
			projectId={selectedProject.id}
			uploadFiles={uploadFiles}
			attachments={attachments}
			isShowCreateDirectory={true}
			tips={t("selectPathModal.uploadDirectoryTip")}
			onSubmit={onModalSubmit}
			onClose={onModalClose}
			validateFileSize={validateFileSize}
			validateFileCount={validateFileCount}
		/>
	)

	return {
		selectDirectoryModalVisible,
		setSelectDirectoryModalVisible,
		addFilesWithDir: addFiles,
		onModalClose,
		onModalSubmit,
		uploadFiles,
		setUploadFiles,
		UploadModal: UploadModalComponent,
	}
}

export default useChooseUploadDirModal
