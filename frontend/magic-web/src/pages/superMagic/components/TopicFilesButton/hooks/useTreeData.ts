import { useMemo, useRef } from "react"
import { measureFileTreeOperation } from "@/pages/superMagic/utils/fileTreePerf"
import { convertToTreeData, type TreeNodeData } from "../utils/treeDataConverter"
import { buildTreeIndex, type TreeIndex } from "../utils/treeIndex"
import type { AttachmentItem } from "./types"
import { recordDeferredTreeBuild, recordTreeIndexStructureMetrics } from "./useTreeDataPerf"

interface UseTreeDataOptions {
	mergedFiles: AttachmentItem[]
	renamingItemId?: string | null
	deferFullTreeBuild?: boolean
	cacheIdentity?: string
}

/**
 * useTreeData - 管理树形数据的转换和相关计算
 */
export function useTreeData(options: UseTreeDataOptions) {
	const { mergedFiles, renamingItemId, deferFullTreeBuild = false, cacheIdentity = "" } = options
	const previousTreeDataRef = useRef<TreeNodeData[]>([])
	const previousTreeIndexRef = useRef<TreeIndex | null>(null)
	const previousCacheIdentityRef = useRef(cacheIdentity)

	if (previousCacheIdentityRef.current !== cacheIdentity) {
		previousTreeDataRef.current = []
		previousTreeIndexRef.current = null
		previousCacheIdentityRef.current = cacheIdentity
	}

	const canDeferFullTreeBuild = Boolean(
		deferFullTreeBuild &&
		previousTreeDataRef.current.length > 0 &&
		previousTreeIndexRef.current,
	)

	// 转换为 Tree 数据
	const treeData = useMemo(() => {
		if (canDeferFullTreeBuild) {
			recordDeferredTreeBuild({
				mergedFilesCount: mergedFiles.length,
				cacheIdentity,
				stage: "tree_data",
			})
			return previousTreeDataRef.current
		}

		const nextTreeData = measureFileTreeOperation(
			"convertToTreeData_ms",
			mergedFiles,
			() => convertToTreeData(mergedFiles, 0, renamingItemId),
			(nextTreeData) => ({
				tree_data_root_count: nextTreeData.length,
				has_renaming_item: Boolean(renamingItemId),
			}),
		)
		previousTreeDataRef.current = nextTreeData
		return nextTreeData
	}, [cacheIdentity, canDeferFullTreeBuild, mergedFiles, renamingItemId])

	const treeIndex = useMemo(() => {
		if (canDeferFullTreeBuild && previousTreeIndexRef.current) {
			recordDeferredTreeBuild({
				mergedFilesCount: mergedFiles.length,
				cacheIdentity,
				stage: "tree_index",
			})
			return previousTreeIndexRef.current
		}

		const nextTreeIndex = measureFileTreeOperation(
			"tree_index_build_ms",
			mergedFiles,
			() => buildTreeIndex(treeData),
			(nextTreeIndex) => {
				const context = {
					tree_data_root_count: treeData.length,
					index_entry_count: nextTreeIndex.totalCount,
				}
				return {
					...context,
					...recordTreeIndexStructureMetrics(nextTreeIndex, context),
				}
			},
		)
		previousTreeIndexRef.current = nextTreeIndex
		return nextTreeIndex
	}, [cacheIdentity, canDeferFullTreeBuild, mergedFiles, treeData])

	// 递归获取所有文件ID（包括子文件）
	const getAllFileIds = useMemo(() => {
		return (treeNodes: TreeNodeData[]): string[] => {
			if (treeNodes === treeData) {
				return [...treeIndex.allKeys]
			}

			const fileIds: string[] = []

			function traverse(nodes: TreeNodeData[]) {
				for (const node of nodes) {
					// 添加当前节点的ID
					fileIds.push(node.key)

					// 如果有子节点，递归遍历
					if (node.children && node.children.length > 0) {
						traverse(node.children)
					}
				}
			}

			traverse(treeNodes)
			return fileIds
		}
	}, [treeData, treeIndex])

	// 递归计算总文件数量
	const getTotalCount = useMemo(() => {
		return (treeNodes: TreeNodeData[]): number => {
			if (treeNodes === treeData) {
				return treeIndex.totalCount
			}

			let count = 0

			function traverse(nodes: TreeNodeData[]) {
				for (const node of nodes) {
					count++

					// 如果有子节点，递归遍历
					if (node.children && node.children.length > 0) {
						traverse(node.children)
					}
				}
			}

			traverse(treeNodes)
			return count
		}
	}, [treeData, treeIndex])

	return {
		// 数据
		treeData,
		treeIndex,
		isDeferredTreeData: canDeferFullTreeBuild,

		// 工具函数
		getAllFileIds,
		getTotalCount,
	}
}
