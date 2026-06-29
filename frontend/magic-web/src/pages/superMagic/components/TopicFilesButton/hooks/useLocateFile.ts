import { useState, useEffect, useMemo } from "react"
import { useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { AttachmentItem } from "./types"
import {
	getAttachmentByLookupKey,
	getParentItemByLookupKey,
	getPathKeysByLookupKey,
	resolveAttachmentKey,
	type AttachmentIndex,
} from "../utils/attachmentIndex"
import { useOrganization } from "@/models/user/hooks/useOrganization"
import { ProjectStateRepository } from "@/models/config/repositories/SuperProjectStateRepository"

interface UseLocateFileOptions {
	treeIndex: AttachmentIndex
	expandedKeys: React.Key[]
	setExpandedKeys: (keys: React.Key[]) => void
	selectedProjectId?: string
}

/**
 * 在 PPT 节点的直接子节点中查找页面文件节点（只查找第一层）
 */
export function findSlidePageItemByName(
	pptItem: AttachmentItem,
	pageFileName: string,
): AttachmentItem | null {
	// 只查找第一层子节点，不递归
	if (!pptItem.children) return null

	for (const child of pptItem.children) {
		if (child.file_name === pageFileName) {
			return child
		}
	}
	return null
}

/**
 * useLocateFile - 文件定位功能 Hook
 * 负责处理文件在树中的定位、展开和滚动
 * 支持 PPT 文件的智能定位（定位到当前激活的页面）
 */
export function useLocateFile(options: UseLocateFileOptions) {
	const { treeIndex, expandedKeys, setExpandedKeys, selectedProjectId } = options
	const { organizationCode } = useOrganization()
	const projectStateRepository = useMemo(() => new ProjectStateRepository(), [])

	// 定位文件状态
	const [locatingFileId, setLocatingFileId] = useState<string | null>(null)

	// 普通文件定位逻辑（提取为独立函数）
	const handleLocateNormalFile = useMemoizedFn((fileId: string) => {
		console.log("📍 Locating normal file:", fileId)

		// Read the path from treeIndex to avoid scanning the full tree.
		const path = getPathKeysByLookupKey(treeIndex, fileId)
		console.log("📂 File path:", path)

		// 展开所有父文件夹（排除最后一个，因为那是文件本身）
		const foldersToExpand = path.slice(0, -1)
		const newExpandedKeys = Array.from(new Set([...expandedKeys, ...foldersToExpand]))
		setExpandedKeys(newExpandedKeys)

		// 设置定位状态，触发闪烁动画
		setLocatingFileId(fileId)

		// 滚动到文件位置（延迟以确保展开动画完成）
		setTimeout(() => {
			const fileElement = document.querySelector(`[data-file-id="${fileId}"]`)
			if (fileElement) {
				fileElement.scrollIntoView({ behavior: "smooth", block: "center" })
			}
		}, 300)

		// 清除定位状态（闪烁动画结束后）
		setTimeout(() => {
			setLocatingFileId(null)
		}, 2000)
	})

	// 处理 PPT 文件定位
	const handleLocatePPTFile = useMemoizedFn(async (pptFileId: string, pptItem: AttachmentItem) => {
		console.log("📊 Locating PPT file:", pptFileId)

		// 1. 从缓存获取当前激活的页面索引
		let activeIndex = 0
		if (organizationCode && selectedProjectId) {
			try {
				const state = await projectStateRepository.getProjectState(
					organizationCode,
					selectedProjectId,
				)
				activeIndex = state?.fileState?.pptActiveIndexMap?.[pptFileId] ?? 0
				console.log("📍 PPT activeIndex from cache:", activeIndex)
			} catch (error) {
				console.warn("⚠️ Failed to get PPT activeIndex from cache:", error)
			}
		}

		// 2. 从 display_config.slides 获取页面文件名
		const slides = pptItem.display_config?.slides
		if (!slides || !Array.isArray(slides)) {
			console.warn("⚠️ PPT slides array not found, fallback to entry file")
			handleLocateNormalFile(pptFileId)
			return
		}

		const pageFileName = slides[activeIndex] || slides[0]
		console.log("📄 Target page file:", pageFileName, "at index:", activeIndex)

		// 3. 查找对应的页面文件节点（只在当前 PPT 的第一层子节点中查找）
		const pageItem = findSlidePageItemByName(pptItem, pageFileName)

		if (pageItem) {
			const pageKey = resolveAttachmentKey(pageItem, pageFileName)
			console.log("✅ Found page file item, locating to:", pageKey)
			// 定位到页面文件
			handleLocateNormalFile(pageKey)
		} else {
			// 降级：定位到 PPT 入口文件
			console.warn("⚠️ Page file not found, fallback to entry file")
			handleLocateNormalFile(pptFileId)
		}
	})

	// 主定位函数
	const handleLocateFileInTree = useMemoizedFn(async (fileId: string) => {
		console.log("🎯 Locating file in tree:", fileId)

		// Find the file.
		const item = getAttachmentByLookupKey(treeIndex, fileId)
		if (!item) {
			console.warn("⚠️ File item not found in tree:", fileId)
			return
		}

		// 检查是否是 PPT 入口文件
		if (item.display_config?.type === "slide" && item.display_config?.slides) {
			const parentItem = getParentItemByLookupKey(treeIndex, fileId)
			if (!parentItem) {
				console.warn("⚠️ Parent item not found for PPT entry file:", fileId)
				return
			}
			console.log("🎬 Detected PPT entry file, handling PPT location")
			await handleLocatePPTFile(fileId, parentItem)
			return
		}
		// 普通文件定位
		handleLocateNormalFile(fileId)
	})

	// 订阅定位文件事件
	useEffect(() => {
		const handleLocateEvent = (fileId: string) => {
			handleLocateFileInTree(fileId)
		}

		pubsub.subscribe(PubSubEvents.Locate_File_In_Tree, handleLocateEvent)

		return () => {
			pubsub.unsubscribe(PubSubEvents.Locate_File_In_Tree, handleLocateEvent)
		}
	}, [handleLocateFileInTree])

	return {
		locatingFileId,
		handleLocateFileInTree,
	}
}
