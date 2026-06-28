/**
 * 附件数据处理服务
 * 统一处理附件数据，包括 display_config 的特殊逻辑
 * 解决 index.html 文件使用父目录 display_config 的问题
 */

import {
	getCustomIndexPath,
	resolveFileByRelativePath,
} from "../components/MessageList/components/MessageAttachment/utils"
import { AttachmentItem } from "../components/TopicFilesButton/hooks"
import { AttachmentDataProcessorPerf } from "./attachmentDataProcessorPerf"

export interface ProcessedAttachmentData {
	tree: any[]
	list: any[]
}

interface ProcessAttachmentDataOptions {
	preserveList?: boolean
}

interface AttachmentProcessIndexes {
	itemsByFileId: Map<string, AttachmentItem>
	customEntryConfigByFileId: Map<string, CustomAncestorResult>
}

type CustomAncestorResult = {
	display_config: Record<string, unknown>
	customFolderId: string
}

export class AttachmentDataProcessor {
	/**
	 * 统一处理附件数据，包括 display_config 的特殊逻辑
	 * 内部自闭环处理验证和返回逻辑，减少调用层的代码复杂度
	 * @param rawData API返回的原始数据
	 * @returns 处理后的附件数据，如果处理失败则返回原始数据
	 */
	static processAttachmentData(
		rawData: {
			tree: AttachmentItem[]
			list: AttachmentItem[]
		},
		options: ProcessAttachmentDataOptions = {},
	): ProcessedAttachmentData {
		if (!rawData) {
			return { tree: [], list: [] }
		}

		const { tree = [], list: rawList = [] } = rawData
		const perf = AttachmentDataProcessorPerf.create(tree)

		// 从 tree 生成 list（扁平化）
		const list = options.preserveList
			? rawList
			: perf.measureFlatten(() => this.flattenAttachments(tree))

		try {
			const indexes = perf.measureIndexBuild(list.length, () =>
				this.buildAttachmentIndexes(list, tree),
			)
			const { processedTree, processedList } = perf.measureDisplayConfig(() =>
				this.processDisplayConfigForTreeAndList(tree, list, indexes, perf),
			)

			const processedData = {
				tree: processedTree,
				list: processedList,
			}

			// 内部验证处理后的数据
			if (this.validateProcessedData(processedData)) {
				perf.finishSuccess(processedList.length)
				return processedData
			} else {
				console.warn("🔶 AttachmentDataProcessor: 处理后的数据验证失败，返回原始数据")
				perf.finishValidationFailed(list.length)
				return { tree, list }
			}
		} catch (error) {
			console.error("🔴 AttachmentDataProcessor: 处理数据时发生错误，返回原始数据:", error)
			perf.finishError(error, list.length)
			return { tree, list }
		}
	}

	/**
	 * 处理项目列表中的 display_config
	 * @param items 要处理的项目列表
	 * @param allItems 所有项目的扁平列表（用于查找父目录）
	 * @returns 处理后的项目列表
	 */
	private static processDisplayConfigForTreeAndList(
		tree: AttachmentItem[],
		list: AttachmentItem[],
		indexes: AttachmentProcessIndexes,
		perf?: AttachmentDataProcessorPerf,
	) {
		const processedTree = this.processDisplayConfigForItems(
			tree,
			indexes,
			perf,
			new Map<string, AttachmentItem>(),
		)
		const processedList = this.processDisplayConfigForItems(
			list,
			indexes,
			perf,
			new Map<string, AttachmentItem>(),
		)

		return { processedTree, processedList }
	}

	private static processDisplayConfigForItems(
		items: AttachmentItem[],
		indexes: AttachmentProcessIndexes,
		perf?: AttachmentDataProcessorPerf,
		processedItemByFileId?: Map<string, AttachmentItem>,
	): AttachmentItem[] {
		return items.map((item) =>
			this.processDisplayConfigForItem(item, indexes, perf, processedItemByFileId),
		)
	}

	private static processDisplayConfigForItem(
		item: AttachmentItem,
		indexes: AttachmentProcessIndexes,
		perf?: AttachmentDataProcessorPerf,
		processedItemByFileId?: Map<string, AttachmentItem>,
	): AttachmentItem {
		const fileId = this.getFileIdKey(item)
		if (fileId) {
			const cached = processedItemByFileId?.get(fileId)
			if (cached) return cached
		}

		let result: AttachmentItem = item
		const customAncestorResult = fileId
			? indexes.customEntryConfigByFileId.get(fileId)
			: undefined
		if (customAncestorResult) {
			result = {
				...item,
				display_config: {
					...customAncestorResult.display_config,
					_customFolderId: customAncestorResult.customFolderId,
				},
				_originalDisplayConfig: item.display_config,
			}
			if (fileId) processedItemByFileId?.set(fileId, result)
			return result
		}

		// Special handling for index.html.
		if (this.isIndexHtmlFile(item) && item.parent_id) {
			const parentDisplayConfig = this.findParentDisplayConfig(item.parent_id, indexes, perf)
			if (parentDisplayConfig) {
				result = {
					...item,
					display_config: parentDisplayConfig,
					_originalDisplayConfig: item.display_config, // Keep original display_config for later use.
				}
				if (fileId) processedItemByFileId?.set(fileId, result)
				return result
			}
		}

		// Process children recursively.
		if (item.children && Array.isArray(item.children)) {
			result = {
				...item,
				children: this.processDisplayConfigForItems(
					item.children,
					indexes,
					perf,
					processedItemByFileId,
				),
			}

			// Sort slide items by slices when display_config.type is slide.
			if (
				item.display_config?.type === "slide" &&
				Array.isArray(item.display_config?.slides)
			) {
				// Slides may be paths or names; normalize them to names.
				const slidesOrder = new Map(
					(item.display_config.slides as string[]).map((slide, index) => [
						slide.split("/").pop(),
						index,
					]),
				)

				const sortedChildren = result.children?.sort((a, b) => {
					const aName = a.file_name || a.filename || ""
					const bName = b.file_name || b.filename || ""
					const aIndex = slidesOrder.get(aName) ?? -1
					const bIndex = slidesOrder.get(bName) ?? -1

					// If both are in slides, keep slide order.
					if (aIndex !== -1 && bIndex !== -1) {
						return aIndex - bIndex
					}
					// If only a is in slides, put a first.
					if (aIndex !== -1) {
						return -1
					}
					// If only b is in slides, put b first.
					if (bIndex !== -1) {
						return 1
					}
					// If neither is in slides, keep the original order.
					return 0
				})
				result = { ...result, children: sortedChildren }
			}
		}

		if (fileId) processedItemByFileId?.set(fileId, result)
		return result
	}

	/**
	 * 判断是否为 index.html 文件
	 * @param item 文件项
	 * @returns 是否为 index.html 文件
	 */
	private static isIndexHtmlFile(item: any): boolean {
		const fileName = item.file_name || item.filename || item.display_filename || ""
		return fileName.toLowerCase() === "index.html"
	}

	/**
	 * 查找父目录的 display_config
	 * @param parentId 父目录ID
	 * @param allItems 所有项目列表
	 * @returns 父目录的 display_config
	 */
	private static findParentDisplayConfig(
		parentId: string | number,
		indexes: AttachmentProcessIndexes,
		perf?: AttachmentDataProcessorPerf,
	): any {
		const parent = this.findItemByFileId(parentId, indexes, perf)
		return parent?.display_config
	}

	private static buildAttachmentIndexes(
		items: AttachmentItem[],
		tree: AttachmentItem[],
	): AttachmentProcessIndexes {
		const itemsByFileId = new Map<string, AttachmentItem>()
		const customEntryConfigByFileId = new Map<string, CustomAncestorResult>()

		items.forEach((item) => {
			if (item.file_id !== undefined && item.file_id !== null) {
				itemsByFileId.set(String(item.file_id), item)
			}
		})

		const stack = [...tree].reverse()
		while (stack.length > 0) {
			const item = stack.pop()
			if (!item) continue

			const fileId = this.getFileIdKey(item)
			if (fileId && !itemsByFileId.has(fileId)) {
				itemsByFileId.set(fileId, item)
			}

			const meta = item.display_config as Record<string, unknown> | undefined
			const indexPath = getCustomIndexPath(meta)
			if (item.is_directory && meta?.type === "custom" && indexPath) {
				const resolved = resolveFileByRelativePath(
					item.children as unknown[] | undefined,
					indexPath,
				) as { file_id?: string } | null
				if (resolved?.file_id && item.file_id !== undefined && item.file_id !== null) {
					customEntryConfigByFileId.set(String(resolved.file_id), {
						display_config: meta,
						customFolderId: String(item.file_id),
					})
				}
			}

			if (item.children?.length) {
				for (let index = item.children.length - 1; index >= 0; index -= 1) {
					stack.push(item.children[index])
				}
			}
		}

		return { itemsByFileId, customEntryConfigByFileId }
	}

	private static getFileIdKey(item: AttachmentItem): string | undefined {
		if (item.file_id === undefined || item.file_id === null) return undefined
		return String(item.file_id)
	}

	private static findItemByFileId(
		fileId: string | number,
		indexes: AttachmentProcessIndexes,
		perf?: AttachmentDataProcessorPerf,
	): AttachmentItem | undefined {
		return perf
			? perf.measureMapLookup(() => indexes.itemsByFileId.get(String(fileId)))
			: indexes.itemsByFileId.get(String(fileId))
	}

	/**
	 * 扁平化附件列表的辅助函数
	 * 将嵌套的附件结构展开为一维数组
	 * @param items 嵌套的附件列表
	 * @returns 扁平化的附件列表
	 */
	private static flattenAttachments(items: any[]): any[] {
		let result: any[] = []
		items.forEach((item) => {
			result.push(item)
			if (item.children && Array.isArray(item.children)) {
				result = result.concat(this.flattenAttachments(item.children))
			}
		})
		return result
	}

	/**
	 * 验证处理后的数据结构
	 * @param data 处理后的数据
	 * @returns 验证结果
	 */
	static validateProcessedData(data: ProcessedAttachmentData): boolean {
		try {
			return (
				Array.isArray(data.tree) &&
				Array.isArray(data.list) &&
				data.tree.every((item) => item.file_id) &&
				data.list.every((item) => item.file_id)
			)
		} catch (error) {
			console.error("数据验证失败:", error)
			return false
		}
	}
}
