import ContentRenderer from "./components/ContentRenderer"
import { DetailType } from "./types"
import { SuperMagicApi } from "@/apis"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { Suspense, useEffect, useRef, useState } from "react"
import { useDeepCompareEffect } from "ahooks"
import { useTranslation } from "react-i18next"
import { exportSingleFileToPpt } from "@/pages/superMagic/components/TopicFilesButton/utils/exportSingleFile"
import { getExportAllFileIds } from "./contents/HTML/utils"
import MagicProgressToast from "@/components/base/MagicProgressToast"
import useEditMode from "./hooks/useEditMode"
import useCheckBeforeCloseWithSave from "./hooks/useCheckBeforeCloseWithSave"
import { useSyncCustomProjectFolderNameBeforeSave } from "./hooks/useSyncCustomProjectFolderNameBeforeSave"
import MagicModal from "@/components/base/MagicModal"
import { downloadFileWithAnchor } from "@/pages/superMagic/utils/handleFIle"
import { DownloadImageMode } from "../../pages/Workspace/types"
import { MagicSpin } from "@/components/base"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import magicToast from "@/components/base/MagicToaster/utils"
import { prepareSingleSlideExport } from "@/pages/superMagic/services/pptService"
import { exportPPTX } from "@magic/html2pptx"
import { pptxExternalLogger, reportPptxExportError } from "@/pages/superMagic/utils/pptxLogger"
import { createPptxResourceErrorCollector } from "@/pages/superMagic/utils/pptxResourceErrors"
import { hasPPTMetadata, isFileInPPTMode } from "./utils/file"
import { prepareHtmlPagesForExport } from "@/utils/htmlExportPrepare"
import { exportHtmlToImage, type ImageExportFormat } from "@magic-web/html2image"
import {
	createPptxSlideConfig,
	resolvePptScaleContentDimensions,
} from "./contents/HTML/utils/slide-dimensions"
import { ossUploadService } from "@/stores/folderUpload/uploadService"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import { createRandomUuidV4 } from "@/utils/create-random-uuid-v4"
import { unshadow } from "@/utils/shadow"
import {
	documentExportService,
	type DocumentExport,
} from "@/pages/superMagic/services/documentExport"

export default function Render(props: any) {
	const {
		type,
		data,
		attachments,
		setUserSelectDetail,
		currentIndex,
		onPrevious,
		onNext,
		onFullscreen,
		onDownload,
		totalFiles,
		hasUserSelectDetail,
		isFromNode,
		onClose,
		userSelectDetail,
		isFullscreen,
		attachmentList,
		allowEdit,
		// New props for ActionButtons functionality
		viewMode,
		onViewModeChange,
		onCopy,
		onShare,
		onFavorite,
		fileContent,
		isFavorited,
		// File sharing props
		topicId,
		baseShareUrl,
		currentFile,
		className,
		updatedAt,
		detailMode,
		displayConfig,
		openFileTab,
		selectedProject,
		selectedTopic,
		showFileHeader = true,
		headerRenderMode = "full",
		onRefreshFile,
		activeFileId,
		onActiveFileChange,
		showFooter = true,
		isPlaybackMode = false,
		documentFlowFullscreen = false,
		// Register/unregister checkBeforeClose callback
		onRegisterCheckBeforeClose,
		onUnregisterCheckBeforeClose,
		projectId,
		allowDownload,
		mdToolbarContainer,
	} = props
	const { t } = useTranslation("super")
	const isPptRenderer =
		type === DetailType.PowerPoint ||
		(type === DetailType.Html &&
			(hasPPTMetadata(data) || isFileInPPTMode(data?.file_id, attachmentList ?? [])))
	const supportsDocumentFlow =
		documentFlowFullscreen &&
		!isPptRenderer &&
		[DetailType.Html, DetailType.Md, DetailType.Text, DetailType.Pdf, DetailType.Code].includes(
			type,
		)
	const { isEditMode, setIsEditMode, checkBeforeClose } = useEditMode({
		fileId: data?.file_id,
		fileName: data?.file_name || data?.display_filename || data?.filename,
	})

	// Use hook to manage save handler registration and wrapped checkBeforeClose
	const { registerSaveHandler } = useCheckBeforeCloseWithSave({
		checkBeforeClose,
		fileId: data?.file_id,
		onRegisterCheckBeforeClose,
		onUnregisterCheckBeforeClose,
	})

	const { syncCustomProjectFolderNameBeforeSave } = useSyncCustomProjectFolderNameBeforeSave({
		attachments,
		currentFileData: data,
	})

	const [exportProgress, setExportProgress] = useState(0)
	const [isExporting, setIsExporting] = useState(false)
	const shouldRefreshAfterSave = useRef(false)

	// 订阅进入编辑状态事件
	useEffect(() => {
		const handleEnterEditMode = (fileId: string) => {
			// 只有当事件中的 fileId 与当前文件的 fileId 匹配时才触发
			if (fileId === data?.file_id) {
				setIsEditMode(true)
			}
		}
		pubsub.subscribe(PubSubEvents.Enter_Edit_Mode, handleEnterEditMode)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Enter_Edit_Mode, handleEnterEditMode)
		}
	}, [data?.file_id, setIsEditMode])

	// 当数据变化时，如果并且用户处于编辑状态，则需要记录保存之后刷新文件
	useDeepCompareEffect(() => {
		if (isEditMode) {
			shouldRefreshAfterSave.current = true
		}
	}, [data])

	// 当用户退出编辑状态时，如果需要刷新文件，则刷新文件
	useEffect(() => {
		if (!isEditMode && shouldRefreshAfterSave.current) {
			// onRefreshFile?.()
			shouldRefreshAfterSave.current = false
		}
	}, [isEditMode])

	//支持批量，但是现在只需要保存单个文件即可,html内容需要混淆后才能保存
	const saveEditContent = async (
		newContent: any,
		fileId?: string,
		enable_shadow: boolean = false,
		fetchFileVersions?: (fileId: string) => void,
		// 在 PPT 编辑子页场景，会传递对应的 isEditMode 参数
		isPPTEditMode?: boolean,
		// 是否在保存后退出编辑模式，默认为 false（保持编辑状态）
		shouldExitEditMode: boolean = false,
	) => {
		const targetFileId = fileId || data.file_id
		const { editing_user_count } = await SuperMagicApi.getFileEditCount(targetFileId)
		const threshold = isPPTEditMode || isEditMode ? 1 : 0
		if (editing_user_count > threshold) {
			await new Promise((resolve, reject) => {
				const modal = MagicModal.confirm({
					title: t("detail.editingConflictPrompt"),
					variant: "default",
					showIcon: true,
					okText: t("common.continue"),
					cancelText: t("common.cancel"),
					closable: false,
					maskClosable: false,
					centered: true,
					onOk: async () => {
						await doSave(
							targetFileId,
							newContent,
							enable_shadow,
							undefined,
							shouldExitEditMode,
						)
						modal.destroy()
						resolve(true)
					},
					onCancel: () => {
						modal.destroy()
						reject("cancel")
					},
				})
			})
			return
		}
		await doSave(targetFileId, newContent, enable_shadow, fetchFileVersions, shouldExitEditMode)
	}

	async function doSave(
		targetFileId: string,
		newContent: any,
		enable_shadow: boolean,
		fetchFileVersions?: (
			fileId: string,
			page_size?: number,
			isLoadMore?: boolean,
			isSelectNewest?: boolean,
		) => void,
		shouldExitEditMode: boolean = false,
	) {
		const key = `save-${targetFileId}`
		magicToast.loading({
			content: t("common.saving"),
			key,
		})
		try {
			try {
				await syncCustomProjectFolderNameBeforeSave(targetFileId, newContent)
			} catch (error) {
				console.error("syncCustomProjectFolderNameBeforeSave failed:", error)
			}

			const fileKey = data?.file_key
			const projectIdValue = selectedProject?.id || projectId
			const contentStr =
				typeof newContent === "string" ? newContent : JSON.stringify(newContent)
			const uploadContent =
				enable_shadow && contentStr.startsWith("SHADOWED_")
					? unshadow(contentStr)
					: contentStr

			// Edited content can exceed the save API request-body limit, so this path reuses
			// the OSS key returned in the current file metadata for direct upload. The key
			// must come from that metadata only; do not replace it with user input or a
			// client-constructed cross-project path. Changes are still committed via replaceFile.
			if (fileKey && projectIdValue) {
				const uploadedPath = await ossUploadService.uploadContentByFileKey(
					uploadContent,
					fileKey,
					projectIdValue,
					data?.file_name || "content.html",
				)

				await SuperMagicApi.replaceFile({
					id: targetFileId,
					file_key: uploadedPath,
				})
			} else {
				const res = await SuperMagicApi.saveFileContent([
					{
						file_id: targetFileId,
						content: newContent,
						enable_shadow,
					},
				])
				if (!res?.success_files?.length) {
					magicToast.error({
						content: t("common.saveFailed"),
						key,
					})
					return
				}
			}

			await fetchFileVersions?.(targetFileId, 10, undefined, true)
			magicToast.success({
				content: t("common.saveSuccess"),
				key,
			})
			if (shouldExitEditMode) {
				setIsEditMode(false)
			}
		} catch (err) {
			magicToast.error({
				content: t("common.saveFailed"),
				key,
			})
		}
	}

	const exportFile = async (fileId: string, fileVersion?: number) => {
		getTemporaryDownloadUrl({
			file_ids: [fileId],
			file_versions: fileVersion ? { [fileId]: fileVersion } : undefined,
			download_mode: DownloadImageMode.Download,
			is_download: true,
		}).then((res: any) => {
			downloadFileWithAnchor(res[0]?.url)
		})
		// const fileIds = getExportAllFileIds(fileId, attachments)
		// batchExportFile({
		// 	projectId: selectedProject?.id,
		// 	fileIds,
		// 	t,
		// 	onStart: startExport,
		// 	onEnd: endExport,
		// 	onProgress,
		// 	onError,
		// })
	}
	const startExport = () => {
		setIsExporting(true)
		setExportProgress(0)
	}
	const onProgress = (progress: number) => {
		setExportProgress(Math.round(progress))
	}
	const endExport = () => {
		setExportProgress(100)
		setTimeout(() => {
			setIsExporting(false)
			setExportProgress(0)
			// magicToast.success(t("topicFiles.exportSuccess"))
		}, 500)
	}
	const onError = () => {
		setIsExporting(false)
		setExportProgress(0)
		magicToast.error(t("topicFiles.contextMenu.fileExport.exportFailed"))
	}

	const exportPdf = async (fileId: string) => {
		if (!fileId) return

		const documentExporter = documentExportService.get()
		if (!documentExporter) {
			magicToast.error(t("topicFiles.contextMenu.fileExport.unsupportedInCurrentVersion"))
			return
		}

		const toastId = createRandomUuidV4()
		const resourceErrors = documentExporter.createResourceErrorCollector(t)
		let pdfHandle: DocumentExport.Handle | null = null

		const getPdfExportToastContent = (progressText: string) => (
			<div className="flex items-center gap-2">
				<span>{progressText}</span>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="h-6 bg-destructive-custom px-2 text-xs text-destructive hover:opacity-90"
					onClick={() => pdfHandle?.cancel?.()}
				>
					{t("topicFiles.exportCancel")}
				</Button>
			</div>
		)

		try {
			magicToast.loading({
				key: toastId,
				content: getPdfExportToastContent(t("topicFiles.exporting")),
				duration: 0,
			})

			const fileItem = attachmentList?.find((item: any) => item.file_id === fileId)
			const result = await prepareSingleSlideExport({
				fileId,
				fileName: fileItem?.file_name || data?.file_name,
				attachmentList: attachments ?? [],
			})

			if (!result.htmlSlides.some(Boolean)) {
				throw new Error("Failed to fetch HTML file content")
			}

			const inPptMode =
				displayConfig?.type === "slide" || isFileInPPTMode(fileId, attachmentList ?? [])

			const preparedHtmlSlides = await prepareHtmlPagesForExport({
				pages: result.htmlSlides,
				attachments: attachments ?? [],
				fileId,
				fileName: fileItem?.file_name || data?.file_name,
				attachmentList: attachments ?? [],
				displayConfig,
			})

			pdfHandle = documentExporter.exportPages(preparedHtmlSlides, {
				fileName: (result.fileName || "export") + ".pdf",
				skipFailedPages: true,
				pptMode: inPptMode,
				vector: {
					fitContentWidth: !inPptMode,
				},
				onResourceLoadError: resourceErrors.onResourceLoadError,
				onPageProgress: (ctx) => {
					const { index, total } = ctx as DocumentExport.PageProgressContext
					if (total <= 1) return
					magicToast.loading({
						key: toastId,
						content: getPdfExportToastContent(
							`${t("topicFiles.exporting")} (${index + 1}/${total})`,
						),
						duration: 0,
					})
				},
			})
			await pdfHandle.promise
			magicToast.success({
				key: toastId,
				content: t("topicFiles.exportSuccess"),
				duration: 1000,
			})
		} catch (error) {
			console.error("[filePdfExport] export failed:", error)
			const isAbort = (error as { name?: string } | null)?.name === "AbortError"
			magicToast[isAbort ? "info" : "error"]({
				key: toastId,
				content: isAbort
					? t("topicFiles.exportCancel")
					: t("topicFiles.contextMenu.fileExport.exportFailed"),
				duration: 1000,
			})
		}
	}

	const exportRasterPdf = async (fileId: string, pageMode: "fit" | "paginate") => {
		if (!fileId) return

		const documentExporter = documentExportService.get()
		if (!documentExporter) {
			magicToast.error(t("topicFiles.contextMenu.fileExport.unsupportedInCurrentVersion"))
			return
		}

		const toastId = createRandomUuidV4()
		const resourceErrors = documentExporter.createResourceErrorCollector(t)
		let pdfHandle: DocumentExport.Handle | null = null

		const getPdfExportToastContent = (progressText: string) => (
			<div className="flex items-center gap-2">
				<span>{progressText}</span>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="h-6 bg-destructive-custom px-2 text-xs text-destructive hover:opacity-90"
					onClick={() => pdfHandle?.cancel?.()}
				>
					{t("topicFiles.exportCancel")}
				</Button>
			</div>
		)

		try {
			magicToast.loading({
				key: toastId,
				content: getPdfExportToastContent(t("topicFiles.exporting")),
				duration: 0,
			})

			const fileItem = attachmentList?.find((item: any) => item.file_id === fileId)
			const result = await prepareSingleSlideExport({
				fileId,
				fileName: fileItem?.file_name || data?.file_name,
				attachmentList: attachments ?? [],
			})

			if (!result.htmlSlides.some(Boolean)) {
				throw new Error("Failed to fetch HTML file content")
			}

			const inPptMode =
				displayConfig?.type === "slide" || isFileInPPTMode(fileId, attachmentList ?? [])

			const preparedHtmlSlides = await prepareHtmlPagesForExport({
				pages: result.htmlSlides,
				attachments: attachments ?? [],
				fileId,
				fileName: fileItem?.file_name || data?.file_name,
				attachmentList: attachments ?? [],
				displayConfig,
			})

			pdfHandle = documentExporter.exportRasterPages(preparedHtmlSlides, {
				fileName: (result.fileName || "export") + ".pdf",
				skipFailedPages: true,
				pptMode: inPptMode,
				pageMode,
				onResourceLoadError: resourceErrors.onResourceLoadError,
			})
			await pdfHandle.promise
			magicToast.success({
				key: toastId,
				content: t("topicFiles.exportSuccess"),
				duration: 1000,
			})
		} catch (error) {
			console.error("[fileRasterPdfExport] export failed:", error)
			const isAbort = (error as { name?: string } | null)?.name === "AbortError"
			magicToast[isAbort ? "info" : "error"]({
				key: toastId,
				content: isAbort
					? t("topicFiles.exportCancel")
					: t("topicFiles.contextMenu.fileExport.exportFailed"),
				duration: 1000,
			})
		}
	}
	const exportPpt = async (fileId: string) => {
		const fileIds = getExportAllFileIds(fileId, attachments)
		fileIds?.length > 0 &&
			exportSingleFileToPpt({
				fileId: fileId,
				projectId: selectedProject?.id || projectId,
				t,
				onStart: startExport,
				onEnd: endExport,
				onProgress,
				onError,
			})
	}

	const exportPptx = async (fileId: string) => {
		if (!fileId) return

		const toastId = createRandomUuidV4()
		let exportHandle: ReturnType<typeof exportPPTX> | null = null
		const resourceErrors = createPptxResourceErrorCollector(t)

		function getExportToastContent(progressText: string) {
			return (
				<div className="flex items-center gap-2">
					<span>{progressText}</span>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="h-6 bg-destructive-custom px-2 text-xs text-destructive hover:opacity-90"
						onClick={() => exportHandle?.cancel()}
					>
						{t("topicFiles.exportCancel")}
					</Button>
				</div>
			)
		}

		try {
			magicToast.loading({
				key: toastId,
				content: getExportToastContent(t("topicFiles.exporting")),
				duration: 0,
			})

			const fileItem = attachmentList?.find((item: any) => item.file_id === fileId)
			const result = await prepareSingleSlideExport({
				fileId,
				fileName: fileItem?.file_name || data?.file_name,
				attachmentList: attachments ?? [],
			})

			if (!result.htmlSlides.some(Boolean)) {
				magicToast.error({
					key: toastId,
					content: t("topicFiles.contextMenu.fileExport.exportFailed"),
					duration: 1000,
				})
				return
			}

			const preparedHtmlSlides = await prepareHtmlPagesForExport({
				pages: result.htmlSlides,
				attachments: attachments ?? [],
				fileId,
				fileName: fileItem?.file_name || data?.file_name,
				attachmentList: attachments ?? [],
				displayConfig,
			})

			const autoSize = !isFileInPPTMode(fileId, attachmentList ?? [])
			const pptxConfig = createPptxSlideConfig(
				resolvePptScaleContentDimensions(preparedHtmlSlides[0]),
			)
			const pptFontResolver = documentExportService.get()?.getPptFontResolver?.()

			exportHandle = exportPPTX(preparedHtmlSlides, {
				fileName: result.fileName,
				skipFailedPages: true,
				autoSize,
				config: pptxConfig,
				fontResolver: pptFontResolver,
				logger: pptxExternalLogger,
				logLevel: "warn",
				onResourceLoadError: resourceErrors.onResourceLoadError,
			})

			await exportHandle.promise

			magicToast.success({
				key: toastId,
				content: t("topicFiles.exportSuccess"),
				duration: 1000,
			})
		} catch (error: unknown) {
			const isAbort = (error as { name?: string } | null)?.name === "AbortError"
			if (isAbort) {
				magicToast.info({
					key: toastId,
					content: t("topicFiles.exportCancel"),
					duration: 1000,
				})
			} else {
				magicToast.error({
					key: toastId,
					content: t("topicFiles.contextMenu.fileExport.exportFailed"),
					duration: 1000,
				})
				reportPptxExportError(error, { fileId, source: "Render" })
			}
		}
	}

	const exportImage = async (fileId: string, format: ImageExportFormat = "png") => {
		if (!fileId) return

		const toastId = createRandomUuidV4()
		try {
			magicToast.loading({
				key: toastId,
				content: t("topicFiles.exporting"),
				duration: 0,
			})

			const fileItem = attachmentList?.find((item: any) => item.file_id === fileId)
			const result = await prepareSingleSlideExport({
				fileId,
				fileName: fileItem?.file_name || data?.file_name,
				attachmentList: attachments ?? [],
			})

			if (!result.htmlSlides.some(Boolean)) {
				throw new Error("Failed to fetch HTML file content")
			}

			const preparedHtmlSlides = await prepareHtmlPagesForExport({
				pages: result.htmlSlides,
				attachments: attachments ?? [],
				fileId,
				fileName: fileItem?.file_name || data?.file_name,
				attachmentList: attachments ?? [],
				displayConfig,
			})

			await exportHtmlToImage({
				pages: preparedHtmlSlides,
				format,
				fileName: (result.fileName || "export").replace(/\.html?$/i, ""),
				onProgress: ({ phase, current, total }) => {
					if (phase !== "capture" || total <= 1) return
					magicToast.loading({
						key: toastId,
						content: `${t("topicFiles.exporting")} (${current}/${total})`,
						duration: 0,
					})
				},
			}).promise
			magicToast.success({
				key: toastId,
				content: t("topicFiles.exportSuccess"),
				duration: 1000,
			})
		} catch (error) {
			console.error("[fileImageExport] export failed:", error)
			magicToast.error({
				key: toastId,
				content: t("topicFiles.contextMenu.fileExport.exportFailed"),
				duration: 1000,
			})
		}
	}

	// Common props object for passing to content components
	const commonProps = {
		type,
		attachments,
		setUserSelectDetail,
		currentIndex,
		onPrevious,
		onNext,
		onFullscreen,
		onDownload,
		totalFiles,
		hasUserSelectDetail,
		isFromNode,
		onClose,
		userSelectDetail,
		isFullscreen,
		attachmentList,
		isEditMode,
		setIsEditMode,
		saveEditContent,
		allowEdit,
		// Register save handler from content component
		onRegisterSaveHandler: registerSaveHandler,
		// New props for ActionButtons functionality
		viewMode,
		onViewModeChange,
		onCopy,
		onShare,
		onFavorite,
		fileContent,
		isFavorited,
		// File sharing props
		topicId,
		baseShareUrl,
		currentFile,
		className,
		updatedAt,
		detailMode,
		// display_config: display_config || data?.display_config,
		displayConfig: displayConfig || data?.display_config,
		openFileTab,
		exportFile,
		exportPdf,
		exportRasterPdf,
		exportPpt,
		exportPptx,
		exportImage,
		isExporting,
		selectedProject,
		selectedTopic,
		showFileHeader,
		headerRenderMode,
		onRefreshFile,
		activeFileId,
		onActiveFileChange,
		showFooter,
		isPlaybackMode,
		// PPT uses a viewport-sized stage for slide scaling and must keep its original layout.
		documentFlowFullscreen: supportsDocumentFlow,
		mdToolbarContainer,
		isTabActive: props.isTabActive,
		allowDownload,
		projectId,
	}

	return (
		<>
			<div
				className={cn(
					supportsDocumentFlow
						? "flex min-h-dvh min-w-0 flex-col"
						: documentFlowFullscreen
							? "flex h-dvh min-w-0 flex-col overflow-hidden"
							: "flex h-full min-h-0 min-w-0 flex-col",
					className,
				)}
			>
				<Suspense
					fallback={
						supportsDocumentFlow ? (
							<div className="min-h-dvh" />
						) : (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									height: "100%",
									minHeight: "400px",
								}}
							>
								<MagicSpin />
							</div>
						)
					}
				>
					<ContentRenderer type={type} data={data} commonProps={commonProps} />
				</Suspense>
			</div>

			{/* 使用封装的进度条组件 */}
			<MagicProgressToast
				visible={isExporting}
				progress={exportProgress}
				text={t("topicFiles.exportingTip")}
				position="top"
				width={280}
				showPercentage={true}
				progressHeight={4}
			/>
		</>
	)
}
