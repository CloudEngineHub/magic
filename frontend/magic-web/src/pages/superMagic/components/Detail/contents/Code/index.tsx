import CommonHeaderV2 from "@/pages/superMagic/components/Detail/components/CommonHeaderV2"
import { useStyles } from "./style"
import { Flex, Modal } from "antd"
import { useMemo, useState, useEffect, useCallback, useRef } from "react"
import { useFileData } from "@/pages/superMagic/hooks/useFileData"
import CodeEditor from "@/components/base/CodeEditor"
import { shadow } from "@/utils/shadow"
import { useMemoizedFn, useResponsive } from "ahooks"
import AIOptimization from "@/pages/superMagic/components/Detail/components/AIOptimization"
import CommonFooter from "../../components/CommonFooter"
import Deleted from "../../components/Deleted"
import useSaveHandlerRegistration from "../../hooks/useSaveHandlerRegistration"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import FileEditButtons from "@/pages/superMagic/components/Detail/components/EditToolbar/FileEditButtons"
import type { HeaderActionConfig } from "@/pages/superMagic/components/Detail/components/CommonHeaderV2/types"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import useExportMenuItems from "../HTML/useExportMenuItems"
import { exportHtmlToImage, type ImageExportFormat } from "@magic-web/html2image"
import { textToHtml } from "../../../../utils/textToHtml"
import {
	decompressCanvasData,
	isCompressedCanvas,
} from "../Design/utils/magicProjectCompression"

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function CodeViewer(props: any) {
	const {
		data,
		attachments,
		attachmentList,
		file_name,
		type,
		onFullscreen,
		onDownload,
		isFromNode,
		isFullscreen,
		// New props for ActionButtons functionality
		viewMode,
		onViewModeChange,
		onCopy,
		fileContent,
		currentFile,
		className,
		updatedAt,
		detailMode,
		isEditMode,
		saveEditContent,
		setIsEditMode,
		allowEdit,
		onRegisterSaveHandler,
		showFileHeader = true,
		activeFileId,
		showFooter,
		isPlaybackMode,
		allowDownload,
		exportFile,
		isExporting,
	} = props

	const { styles, cx } = useStyles()
	const responsive = useResponsive()
	const isMobile = responsive.md === false
	const { t } = useTranslation("super")
	const codeContainerRef = useRef<HTMLDivElement>(null)

	const { content: displayContent, file_id } = data

	const {
		fileData,
		fileVersion,
		changeFileVersion,
		fileVersionsList,
		handleVersionRollback,
		fetchFileVersions,
		isNewestVersion,
		isDeleted,
	} = useFileData({
		file_id,
		updatedAt,
		isEditing: isEditMode,
		activeFileId,
		isFromNode,
		disabledUrlCache: isPlaybackMode,
	})

	const [content, setContent] = useState<string>("")
	const [editingCodeContent, setEditingCodeContent] = useState<string>("")

	// 初始化 content
	useEffect(() => {
		const initialContent = displayContent ? displayContent : fileData
		setContent(initialContent || "")
	}, [displayContent, fileData])

	// 按钮处理函数
	const handleEdit = useMemoizedFn(() => {
		if (setIsEditMode) {
			setIsEditMode(true)
			// 初始化编辑内容
			setEditingCodeContent(content || "")
		}
	})

	const handleSave = useMemoizedFn(async () => {
		if (editingCodeContent && editingCodeContent !== content) {
			// 保存代码编辑内容，使用 shadow 函数加密
			const enable_shadow = true
			await saveEditContent?.(
				shadow(editingCodeContent),
				file_id,
				enable_shadow,
				fetchFileVersions,
			)
			// 更新 content 状态
			setContent(editingCodeContent)
			if (data?.file_name === "magic.project.js") {
				pubsub.publish(PubSubEvents.Update_Attachments)
			}
		}
		// 不再退出编辑模式
	})

	// Register save handler when in edit mode
	useSaveHandlerRegistration({
		isEditMode,
		handleSave,
		onRegisterSaveHandler,
	})

	const handleSaveAndExit = useMemoizedFn(async () => {
		await handleSave()
		if (setIsEditMode) {
			setIsEditMode(false)
		}
	})

	const handleCancel = useMemoizedFn(() => {
		if (setIsEditMode) {
			setIsEditMode(false)
		}
		// 重置编辑内容
		setEditingCodeContent("")
	})

	const quitEditMode = useMemoizedFn(() => {
		if (setIsEditMode) {
			setIsEditMode(false)
		}
		setEditingCodeContent("")
	})

	// 当 viewMode 变化时，退出编辑模式
	useEffect(() => {
		if (setIsEditMode && isEditMode) {
			setIsEditMode(false)
		}
		// 重置编辑内容
		setEditingCodeContent("")
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [viewMode])

	const [isExportingImage, setIsExportingImage] = useState(false)
	const [decompressedModalOpen, setDecompressedModalOpen] = useState(false)
	const [decompressedContent, setDecompressedContent] = useState<string>("")
	const [compressSizeInfo, setCompressSizeInfo] = useState<{ before: number; after: number; elementCount: number } | null>(null)

	const isMagicProjectFile = data?.file_name === "magic.project.js"

	// 快捷键仅对 v2（压缩格式）的 magic.project.js 生效
	const isV2MagicProjectFile = useMemo(() => {
		if (!isMagicProjectFile) return false
		const currentContent = content || displayContent || ""
		return currentContent.includes("MAGICPROJECTDESIGNDATA://")
	}, [isMagicProjectFile, content, displayContent])

	const handleDecompressCanvas = useCallback(() => {
		try {
			const currentContent = content || displayContent || ""
			// 尝试解析 JS 内容，提取 JSON 对象
			let jsonStr = currentContent.trim()
			// magic.project.js 通常是 `window.__MAGIC_PROJECT__ = {...}` 或纯 JSON
			const assignMatch = jsonStr.match(/=\s*([\s\S]+?)\s*;?\s*$/)
			if (assignMatch) {
				jsonStr = assignMatch[1]
			}
			const parsed = JSON.parse(jsonStr)

			// 查找并解压 canvas 字段
			if (parsed.canvas && isCompressedCanvas(parsed.canvas)) {
				const compressedSize = new TextEncoder().encode(parsed.canvas).length
				const decompressed = decompressCanvasData(parsed.canvas) as { elements?: unknown[] }
				const elementCount = Array.isArray(decompressed?.elements) ? decompressed.elements.length : 0
				const result = { ...parsed, canvas: decompressed }
				const decompressedStr = JSON.stringify(result, null, 2)
				const decompressedSize = new TextEncoder().encode(JSON.stringify(decompressed)).length
				setDecompressedContent(decompressedStr)
				setCompressSizeInfo({ before: compressedSize, after: decompressedSize, elementCount })
			} else {
				// canvas 不是压缩格式，直接格式化展示
				const canvasObj = parsed.canvas as { elements?: unknown[] } | undefined
				const elementCount = Array.isArray(canvasObj?.elements) ? canvasObj.elements.length : 0
				const formatted = JSON.stringify(parsed, null, 2)
				setDecompressedContent(formatted)
				setCompressSizeInfo(elementCount > 0 ? { before: 0, after: 0, elementCount } : null)
			}
			setDecompressedModalOpen(true)
		} catch (error) {
			console.error("[CodeViewer] Decompress canvas failed:", error)
			magicToast.error("解压失败: " + (error instanceof Error ? error.message : "未知错误"))
		}
	}, [content, displayContent])

	// 快捷键 Cmd+Shift+D (Mac) / Ctrl+Shift+D (Win) 触发解压 Canvas
	// 仅对当前聚焦面板内的 v2 格式 magic.project.js 生效（避免多面板同时打开时重复触发）
	useEffect(() => {
		if (!isV2MagicProjectFile) return
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
				// 检查当前焦点是否在本组件容器内
				const container = codeContainerRef.current
				if (!container) return
				if (!container.contains(document.activeElement) && document.activeElement !== document.body) return
				e.preventDefault()
				handleDecompressCanvas()
			}
		}
		window.addEventListener("keydown", handler)
		return () => window.removeEventListener("keydown", handler)
	}, [isV2MagicProjectFile, handleDecompressCanvas])

	const handleExportSource = useMemoizedFn(() => {
		exportFile?.(file_id, fileVersion)
	})

	const handleExportImage = useMemoizedFn(async (format: ImageExportFormat = "png") => {
		const currentContent = content || displayContent
		if (!currentContent) {
			magicToast.error(t("topicFiles.contextMenu.fileExport.exportFailed"))
			return
		}

		const toastKey = `code-image-export-${file_id || Date.now()}`
		setIsExportingImage(true)
		magicToast.loading({
			key: toastKey,
			content: t("topicFiles.exporting"),
			duration: 0,
		})

		try {
			// Derive language from file extension
			const ext = (file_name || "").split(".").pop() || "plaintext"
			const html = textToHtml(currentContent, { language: ext })
			await exportHtmlToImage({
				pages: [html],
				format,
				fileName: (file_name || "export").replace(/\.[^.]+$/, ""),
				onProgress: ({ phase, current, total }) => {
					if (phase !== "capture" || total <= 1) return
					magicToast.loading({
						key: toastKey,
						content: `${t("topicFiles.exporting")} (${current}/${total})`,
						duration: 0,
					})
				},
			}).promise
			magicToast.success({
				key: toastKey,
				content: t("topicFiles.exportSuccess"),
				duration: 1000,
			})
		} catch (error) {
			console.error("[image-export] Code export failed:", error)
			magicToast.destroy(toastKey)
			magicToast.error(t("topicFiles.contextMenu.fileExport.exportFailed"))
		} finally {
			setIsExportingImage(false)
		}
	})

	const { ExportDropdownButton } = useExportMenuItems({
		handleExportSource,
		handleExportPDF: () => {},
		handleExportImage,
		isExporting: isExporting || isExportingImage,
		showButtonText: true,
		supportPPT: false,
		showExportImage: true,
		showExportPdf: false,
	})

	const headerActionConfig = useMemo<HeaderActionConfig>(
		() => ({
			customActions: [
				{
					key: "code-ai-optimization",
					zone: "primary",
					visible: () =>
						Boolean(
							allowEdit &&
							!isMobile &&
							data?.file_id &&
							!isEditMode &&
							isNewestVersion,
						),
					render: (context) => (
						<AIOptimization
							attachmentList={attachmentList}
							file_id={data?.file_id}
							showButtonText={context.showButtonText}
						/>
					),
				},
				{
					key: "code-edit-actions",
					zone: "primary",
					visible: () =>
						Boolean(
							setIsEditMode && allowEdit && !isMobile && file_id && isNewestVersion,
						),
					render: (context) => (
						<FileEditButtons
							isEditMode={isEditMode}
							isSaving={false}
							showButtonText={context.showButtonText}
							onEdit={handleEdit}
							onSave={handleSave}
							onSaveAndExit={handleSaveAndExit}
							onCancel={handleCancel}
						/>
					),
				},
			],
		}),
		[
			allowEdit,
			attachmentList,
			data?.file_id,
			file_id,
			handleCancel,
			handleEdit,
			handleSave,
			isEditMode,
			isMobile,
			isNewestVersion,
			setIsEditMode,
		],
	)

	const headerContext = useMemo(
		() => ({
			type,
			onFullscreen,
			onDownload: () => onDownload(file_id, fileVersion),
			isFromNode,
			isFullscreen,
			viewMode,
			onViewModeChange,
			onCopy,
			fileContent: fileContent || content,
			currentFile,
			detailMode,
			showDownload: allowDownload !== false,
			isEditMode,
			fileVersion,
			isNewestFileVersion: isNewestVersion,
			changeFileVersion,
			fileVersionsList,
			handleVersionRollback,
			quitEditMode,
			allowEdit,
			attachments,
			actionConfig: headerActionConfig,
		}),
		[
			allowDownload,
			allowEdit,
			attachments,
			changeFileVersion,
			content,
			currentFile,
			detailMode,
			fileContent,
			file_id,
			fileVersion,
			fileVersionsList,
			handleVersionRollback,
			isEditMode,
			isFromNode,
			isFullscreen,
			isNewestVersion,
			onCopy,
			onDownload,
			onFullscreen,
			onViewModeChange,
			quitEditMode,
			type,
			viewMode,
			headerActionConfig,
		],
	)

	return (
		<Flex ref={codeContainerRef} vertical className={cx(styles.container, className)} tabIndex={-1}>
			{showFileHeader && <CommonHeaderV2 {...headerContext} />}
			{isEditMode ? (
				<CodeEditor
					content={content || ""}
					fileName={file_name || "file"}
					isEditMode={isEditMode}
					onChange={(value) => {
						setEditingCodeContent(value)
					}}
					height="100%"
					showLineNumbers={true}
					theme="light"
				/>
			) : isDeleted ? (
				<Deleted data={data} showHeader={false} />
			) : (
				<CodeEditor
					fileName={file_name || "file"}
					isEditMode={false}
					content={content || ""}
					theme="light"
				/>
			)}
			{/* 底部 */}
			{showFooter && (
				<CommonFooter
					fileVersion={fileVersion}
					changeFileVersion={changeFileVersion}
					fileVersionsList={fileVersionsList}
					handleVersionRollback={handleVersionRollback}
					quitEditMode={quitEditMode}
					allowEdit={allowEdit}
					isEditMode={isEditMode}
				/>
			)}
			<Modal
				title="Decompressed Canvas Data"
				open={decompressedModalOpen}
				onCancel={() => setDecompressedModalOpen(false)}
				footer={null}
				width="80vw"
				styles={{ body: { maxHeight: "70vh", overflow: "auto", padding: 0 } }}
			>
				{compressSizeInfo && (
					<div style={{ padding: "8px 16px", fontSize: 13, color: "#666", borderBottom: "1px solid #f0f0f0", display: "flex", gap: 16, flexWrap: "wrap" }}>
						<span>元素数量: <strong>{compressSizeInfo.elementCount}</strong></span>
						{compressSizeInfo.before > 0 && compressSizeInfo.after > 0 && (
							<>
								<span>压缩前 (canvas): <strong>{formatBytes(compressSizeInfo.after)}</strong></span>
								<span>压缩后 (canvas): <strong>{formatBytes(compressSizeInfo.before)}</strong></span>
								<span>压缩率: <strong>{((1 - compressSizeInfo.before / compressSizeInfo.after) * 100).toFixed(1)}%</strong></span>
							</>
						)}
					</div>
				)}
				<CodeEditor
					content={decompressedContent}
					fileName="canvas.json"
					isEditMode={false}
					theme="light"
					height="70vh"
				/>
			</Modal>
		</Flex>
	)
}
