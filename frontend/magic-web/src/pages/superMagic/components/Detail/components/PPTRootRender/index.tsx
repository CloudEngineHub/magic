import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDeepCompareEffect, useMemoizedFn } from "ahooks"
import { Flex } from "antd"
import PPTRender from "../PPTRender"
import MagicSpin from "@/components/base/MagicSpin"
import { useFileData } from "@/pages/superMagic/hooks/useFileData"
import { processHtmlContent } from "../../contents/HTML/htmlProcessor"
import { type FileItem } from "../../contents/HTML/utils/fetchInterceptor"
import { createParentMessageHandler } from "../../contents/HTML/utils/fetchInterceptor"
import type { PPTRootRenderProps } from "./types"
import { flattenAttachments } from "../../contents/HTML/utils"
import { cn } from "@/lib/utils"
import { getFileContentById } from "@/pages/superMagic/utils/api"

const MAGIC_PROJECT_FILE_NAME = "magic.project.js"

interface PendingLocalSlidePaths {
	slidePaths: string[]
}

interface PPTEntryData {
	file_id: string
	file_name?: string
	content?: string
	is_directory?: boolean
	relative_file_path?: string
	display_config?: Record<string, any>
	children?: any[]
}

function collectAttachmentNodes(items: any[] | undefined, result: any[] = []): any[] {
	if (!Array.isArray(items)) return result
	for (const item of items) {
		if (!item) continue
		result.push(item)
		collectAttachmentNodes(item?.children, result)
	}
	return result
}

function findAttachmentNodeByFileId(items: any[] | undefined, fileId: string): any | undefined {
	if (!fileId) return undefined
	if (!Array.isArray(items)) return undefined

	const directItem = items.find((item: any) => item?.file_id === fileId)
	if (directItem) return directItem

	for (const item of items) {
		const childItem = findAttachmentNodeByFileId(item?.children, fileId)
		if (childItem) return childItem
	}

	return undefined
}

function mergeAttachmentNodes(items: any[]): any[] {
	const map = new Map<string, any>()
	for (const item of items) {
		const key =
			item?.file_id ||
			item?.relative_file_path ||
			`${getAttachmentFileName(item)}-${item?.parent_id || ""}`
		if (!key) continue

		const existing = map.get(key)
		map.set(key, {
			...(existing || {}),
			...item,
			// Mobile preview details may be partial. Keep the attachment tree's path
			// metadata when the detail payload does not provide a concrete value.
			relative_file_path: item?.relative_file_path ?? existing?.relative_file_path,
			parent_id: item?.parent_id ?? existing?.parent_id,
			children: item?.children || existing?.children,
		})
	}
	return Array.from(map.values())
}

function normalizeFolderPath(relativePath?: string, fileName?: string): string {
	if (!relativePath || !fileName) return ""
	return relativePath.replace(fileName, "")
}

function normalizeDirectoryPath(relativePath?: string): string {
	if (!relativePath) return ""
	const path = relativePath.replace(/\/+$/, "")
	return path ? `${path}/` : ""
}

function getAttachmentFileName(item: any): string {
	return item?.file_name || item?.name || item?.filename || item?.display_filename || ""
}

function getSlidesSignature(slides: string[] | undefined): string {
	return JSON.stringify(slides || [])
}

/**
 * PPTRootRender Component
 * Handles PPT (slide) rendering by extracting slide paths from HTML content
 * and rendering them using the PPTRender component
 */
export default memo(function PPTRootRender(props: PPTRootRenderProps) {
	const {
		data: displayData,
		attachments,
		type,
		currentIndex,
		onPrevious,
		onNext,
		onFullscreen,
		onDownload,
		totalFiles,
		setUserSelectDetail,
		isFromNode,
		onClose,
		hasUserSelectDetail,
		isFullscreen,
		attachmentList,
		allowEdit,
		saveEditContent,
		className,
		updatedAt,
		displayConfig,
		openFileTab,
		selectedProject,
		activeFileId,
		isPlaybackMode,
		exportFile,
		exportPdf,
		exportPpt,
		allowDownload,
		projectId,
		onRegisterCheckBeforeClose,
		onUnregisterCheckBeforeClose,
	} = props

	const [filePathMapping, setFilePathMapping] = useState<Map<string, string>>(new Map())
	const [originalSlidesPaths, setOriginalSlidesPaths] = useState<string[]>([])
	const [renderKey] = useState(0)
	const [entryFileData, setEntryFileData] = useState<any>({})
	const [currentAttachmentList, setCurrentAttachmentList] = useState<any>([])
	const [magicProjectContent, setMagicProjectContent] = useState<string>()
	const [magicProjectLoading, setMagicProjectLoading] = useState(false)
	const pendingLocalSlidePathsRef = useRef<PendingLocalSlidePaths | null>(null)
	const entryData = displayData as PPTEntryData | undefined
	// 标记是否至少完成过一次内容解析，避免路径计算中误展示空态
	const [hasProcessedContent, setHasProcessedContent] = useState(false)
	const pptAttachmentList = useMemo(() => {
		return mergeAttachmentNodes([
			...collectAttachmentNodes((attachments || []) as any[]),
			...collectAttachmentNodes((attachmentList || []) as any[]),
			...collectAttachmentNodes(displayData ? [displayData] : []),
		])
	}, [attachments, attachmentList, displayData])
	const processAttachments = pptAttachmentList
	const magicProjectFile = useMemo(() => {
		if (!displayData?.file_id || pptAttachmentList.length === 0) return undefined

		const entryFile = pptAttachmentList.find(
			(item: any) => item?.file_id === displayData.file_id,
		)
		const isDirectoryEntry = Boolean(entryData?.is_directory)
		const entryFolderPath = isDirectoryEntry
			? normalizeDirectoryPath(entryData?.relative_file_path)
			: normalizeFolderPath(entryFile?.relative_file_path, getAttachmentFileName(entryFile))
		const targetPath = entryFolderPath
			? `${entryFolderPath}${MAGIC_PROJECT_FILE_NAME}`
			: undefined

		return pptAttachmentList.find((item: any) => {
			if (getAttachmentFileName(item) !== MAGIC_PROJECT_FILE_NAME) return false
			if (entryFile?.parent_id && item?.parent_id === entryFile.parent_id) return true
			if (
				isDirectoryEntry &&
				displayData?.file_id &&
				String(item?.parent_id ?? "") === String(displayData.file_id)
			) {
				return true
			}
			return Boolean(targetPath && item?.relative_file_path === targetPath)
		})
	}, [
		pptAttachmentList,
		displayData?.file_id,
		entryData?.is_directory,
		entryData?.relative_file_path,
	])

	// 同步派生 slidePaths：解析完成前先用 displayConfig.slides 快速首屏；
	// 一旦 magic.project.js 内容解析完成，就以文件内容为准，避免旧 displayConfig 盖住新 slides。
	const derivedSlidePaths = useMemo(() => {
		if (hasProcessedContent && (magicProjectFile?.file_id || originalSlidesPaths.length > 0)) {
			return originalSlidesPaths
		}
		if (
			displayConfig?.slides &&
			Array.isArray(displayConfig.slides) &&
			displayConfig.slides.length > 0
		) {
			return displayConfig.slides
		}
		return originalSlidesPaths
	}, [displayConfig?.slides, hasProcessedContent, magicProjectFile?.file_id, originalSlidesPaths])

	const entryContentFileId = entryData?.is_directory ? "" : displayData?.file_id || ""
	const { fileData: htmlFileData, loading } = useFileData({
		file_id: entryContentFileId,
		isEditing: false,
		updatedAt,
		activeFileId,
		isFromNode,
		content: displayData?.content || "",
		disabledUrlCache: isPlaybackMode,
	})

	useEffect(() => {
		pendingLocalSlidePathsRef.current = null
	}, [displayData?.file_id, magicProjectFile?.file_id])

	useEffect(() => {
		const fileId = magicProjectFile?.file_id
		if (!fileId) {
			setMagicProjectContent(undefined)
			setMagicProjectLoading(false)
			return
		}

		let cancelled = false
		setMagicProjectLoading(true)

		getFileContentById(fileId, { responseType: "text" })
			.then((content) => {
				if (cancelled) return
				const nextContent = typeof content === "string" ? content : ""
				setMagicProjectContent((prev) => (prev === nextContent ? prev : nextContent))
			})
			.catch((error) => {
				if (cancelled) return
				console.error("Failed to load magic.project.js content:", error)
				setMagicProjectContent(undefined)
			})
			.finally(() => {
				if (!cancelled) setMagicProjectLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [magicProjectFile?.file_id, magicProjectFile?.updated_at])

	/** Update HTML file data content */
	const updateDataContent = useMemoizedFn((fileData: any) => {
		const newEntryFileData = {
			...displayData,
			content: fileData || displayData?.content,
		}
		if (entryFileData.content !== newEntryFileData.content) {
			setEntryFileData(newEntryFileData)
		}
	})

	useDeepCompareEffect(() => {
		updateDataContent(htmlFileData)
	}, [htmlFileData])

	// Create message handler and register/remove listener
	useEffect(() => {
		let htmlRelativeFolderPath = "/"
		const currentFileId = displayData?.file_id
		if (currentFileId && pptAttachmentList.length > 0) {
			const currentFile = pptAttachmentList.find((item) => item.file_id === currentFileId)
			if (currentFile?.is_directory && currentFile.relative_file_path) {
				htmlRelativeFolderPath = normalizeDirectoryPath(currentFile.relative_file_path)
			} else if (currentFile && currentFile.relative_file_path && currentFile.file_name) {
				htmlRelativeFolderPath = currentFile.relative_file_path.replace(
					currentFile.file_name,
					"",
				)
			}
		}
		const allFiles = flattenAttachments(pptAttachmentList) as FileItem[]
		const messageHandler = createParentMessageHandler(
			allFiles,
			htmlRelativeFolderPath,
			currentFileId || "",
		)
		window.addEventListener("message", messageHandler)
		return () => {
			window.removeEventListener("message", messageHandler)
		}
	}, [pptAttachmentList, displayData?.file_id])

	const processContent = useMemoizedFn(async () => {
		try {
			const shouldUseMagicProject = Boolean(
				magicProjectFile?.file_id && magicProjectContent !== undefined,
			)
			const content = shouldUseMagicProject ? magicProjectContent : entryFileData?.content
			const result = await processHtmlContent({
				content,
				attachments: processAttachments,
				fileId: shouldUseMagicProject ? magicProjectFile?.file_id : displayData?.file_id,
				fileName: shouldUseMagicProject
					? getAttachmentFileName(magicProjectFile)
					: entryFileData?.file_name,
				attachmentList: pptAttachmentList,
				displayConfig,
			})

			if (shouldUseMagicProject && pendingLocalSlidePathsRef.current) {
				const pendingLocalSlidePaths = pendingLocalSlidePathsRef.current
				const isMagicProjectCaughtUp =
					getSlidesSignature(result.originalSlidesPaths) ===
					getSlidesSignature(pendingLocalSlidePaths.slidePaths)

				if (!isMagicProjectCaughtUp) {
					return
				}

				pendingLocalSlidePathsRef.current = null
			}

			setFilePathMapping(result.filePathMapping)
			setOriginalSlidesPaths(result.originalSlidesPaths)
		} catch (error) {
			console.error("Error processing HTML content for PPT:", error)
			setOriginalSlidesPaths([])
		} finally {
			setHasProcessedContent(true)
		}
	})

	useDeepCompareEffect(() => {
		// attachmentList 先到时不立即解析，等待 entryFileData.content 就绪
		if (
			(entryFileData?.content || magicProjectContent !== undefined) &&
			currentAttachmentList.length === 0 &&
			pptAttachmentList.length > 0
		) {
			setCurrentAttachmentList(pptAttachmentList)
			processContent()
		}
	}, [pptAttachmentList, currentAttachmentList, entryFileData?.content, magicProjectContent])

	useDeepCompareEffect(() => {
		if (!entryFileData?.content && magicProjectContent === undefined) return
		// 首次由 attachmentList 分支接管，避免首轮重复解析
		if (currentAttachmentList.length === 0 && pptAttachmentList.length) return
		processContent()
	}, [
		entryFileData,
		magicProjectContent,
		displayConfig,
		currentAttachmentList.length,
		pptAttachmentList.length,
	])

	// Handle sort panel save
	const handleSortSave = useCallback((newSlidesPaths: string[]) => {
		pendingLocalSlidePathsRef.current = {
			slidePaths: newSlidesPaths,
		}
		setOriginalSlidesPaths(newSlidesPaths)
	}, [])

	const handleDownload = useMemoizedFn(
		({
			fileId,
			fileVersion,
			type,
		}: {
			fileId: string
			fileVersion?: number
			type?: "file" | "pdf" | "ppt"
		}) => {
			if (type === "file") {
				exportFile?.(fileId, fileVersion)
			} else if (type === "pdf") {
				exportPdf?.(fileId)
			} else if (type === "ppt") {
				exportPpt?.(fileId)
			}
		},
	)

	const openNewTab = useCallback(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		(fileId: string, _path: string) => {
			if (!fileId) {
				console.warn("openNewTab: fileId is empty, cannot open new tab")
				return
			}

			const fileItem = findAttachmentNodeByFileId(pptAttachmentList, fileId)
			if (!fileItem) {
				console.warn("openNewTab: fileItem not found", { fileId })
				return
			}

			openFileTab?.(fileItem)
		},
		[pptAttachmentList, openFileTab],
	)

	// 仅在首次没有任何可渲染 slides 时阻塞；后续 magic.project.js 更新走后台拉取，
	// 保持 PPTRender 常驻，让 slidePaths 变化进入 store 的增量同步链路。
	const hasSlidesFromConfig = displayConfig?.slides?.length > 0
	const hasResolvedSlides = hasProcessedContent || originalSlidesPaths.length > 0
	const canRenderFromExistingState =
		hasSlidesFromConfig ||
		hasResolvedSlides ||
		(!attachmentList?.length && !entryFileData?.content && magicProjectContent === undefined)
	const isInitialEntryLoading = loading && !canRenderFromExistingState
	const isInitialMagicProjectLoading =
		Boolean(magicProjectFile?.file_id && magicProjectLoading) && !canRenderFromExistingState
	const isReadyToRender =
		!isInitialEntryLoading && !isInitialMagicProjectLoading && canRenderFromExistingState

	return (
		<div className={cn("h-full w-full", className)}>
			{!isReadyToRender ? (
				<Flex justify="center" align="center" className="h-full w-full bg-background">
					<MagicSpin spinning />
				</Flex>
			) : (
				<PPTRender
					key={`ppt-${renderKey}`}
					slidePaths={derivedSlidePaths}
					attachments={pptAttachmentList}
					attachmentList={pptAttachmentList}
					projectId={projectId}
					mainFileId={displayData?.file_id}
					mainFileName={displayData?.file_name}
					filePathMapping={filePathMapping}
					selectedProject={selectedProject}
					displayConfig={displayConfig}
					isPlaybackMode={isPlaybackMode}
					allowEdit={allowEdit}
					saveEditContent={saveEditContent}
					onSortSave={handleSortSave}
					openNewTab={openNewTab}
					onDownload={handleDownload}
					onFullscreen={onFullscreen}
					onActiveIndexChange={(_index, fileId) => {
						props.onActiveFileChange?.(fileId)
					}}
					isTabActive={props.isTabActive}
					allowDownload={allowDownload}
					onRegisterCheckBeforeClose={onRegisterCheckBeforeClose}
					onUnregisterCheckBeforeClose={onUnregisterCheckBeforeClose}
				/>
			)}
		</div>
	)
})
