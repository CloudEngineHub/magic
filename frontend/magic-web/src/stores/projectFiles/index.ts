import { makeAutoObservable, observable } from "mobx"
import { WorkspaceFolder } from "./types"
import { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { createFileTreePerfScope } from "@/pages/superMagic/utils/fileTreePerf"
import {
	applyProjectAttachmentsChangesToTree,
	type ApplyProjectAttachmentsChangesResult,
} from "@/pages/superMagic/utils/projectAttachments/changeReducer"
import {
	projectAttachmentsChangeLog,
	type ProjectAttachmentsChangeTraceContext,
} from "@/pages/superMagic/utils/projectAttachments/changeLogReporter"
import type { SuperMagicFileChangeItem } from "@/types/chat/intermediate_message"

interface SetWorkspaceFileTreeOptions {
	list?: AttachmentItem[]
	source?: string
}

export class ProjectFilesStore {
	constructor() {
		makeAutoObservable(
			this,
			{
				workspaceFileTree: observable.ref,
				workspaceFilesList: observable.ref,
				currentSelectedProject: observable.ref,
			},
			{ autoBind: true },
		)
	}

	workspaceFileTree: AttachmentItem[] = []
	workspaceFilesList: AttachmentItem[] = []
	currentSelectedProject: ProjectListItem | null = null

	isSameProject(project1: ProjectListItem | null, project2: ProjectListItem | null) {
		return project1?.id === project2?.id
	}

	setSelectedProject(selectedProject: ProjectListItem | null) {
		if (!selectedProject || !this.isSameProject(this.currentSelectedProject, selectedProject)) {
			this.workspaceFileTree = []
			this.workspaceFilesList = []
		}
		this.currentSelectedProject = selectedProject
	}

	hasFolder(fileId: string) {
		return this.workspaceFilesList.some(
			(file) => file.type === "directory" && file.file_id === fileId,
		)
	}

	/**
	 * Get filenames in a specific folder path
	 * @param folderPath - The folder path prefix to filter files
	 * @returns Array of filenames in the specified folder
	 */
	getFileNamesInFolder(folderPath: string): string[] {
		return this.workspaceFilesList
			.filter((item) => {
				// Filter out folders, keep only files
				if (item.type !== "file") return false

				// Check if file is in the specified folder path
				return item.file_key.startsWith(folderPath)
			})
			.map((file) => {
				// Extract filename from file_key (get the last part after the last slash)
				const lastSlashIndex = file.file_key.lastIndexOf("/")
				return lastSlashIndex !== -1
					? file.file_key.slice(lastSlashIndex + 1)
					: file.file_key
			})
	}

	/**
	 * Get filenames by parent ID
	 * @param parentId - The parent directory ID (undefined for root)
	 * @returns Array of filenames in the specified parent directory
	 */
	getFileNamesByParentId(parentId?: string): string[] {
		return this.workspaceFilesList
			.filter((item) => {
				// Filter out folders, keep only files
				if (item.type !== "file") return false

				// Check if file is in the specified parent directory
				// Handle both undefined parentId (root) and string parentId
				return item.parent_id === parentId
			})
			.map((file) => file.file_name as string)
	}

	/**
	 * Get folder data
	 * @param parent_id - Folder ID
	 * @returns Folder data
	 */
	getFolderData(parent_id: string | number | undefined): WorkspaceFolder | undefined {
		return this.workspaceFilesList.find(
			(item) => item.type === "directory" && item.file_id === parent_id,
		) as WorkspaceFolder | undefined
	}

	setWorkspaceFileTree(tree: AttachmentItem[], options: SetWorkspaceFileTreeOptions = {}) {
		const perf = createFileTreePerfScope(tree)
		const commitStartedAt = perf.start()
		const source = options.source || "unknown"
		const hasReusableList = Array.isArray(options.list)
		const workspaceFilesList = hasReusableList
			? this.createWorkspaceFilesListFromReusableList(tree, options.list || [], perf, source)
			: perf.measure(
					"store_flatten_ms",
					() => this.flattenWorkspaceFileTree(tree),
					(result) => ({
						flattened_count: result.length,
						list_reused: false,
						source,
					}),
				)

		this.workspaceFileTree = this.excludeHiddenItems(tree)
		this.workspaceFilesList = this.excludeHiddenItems(workspaceFilesList)
		perf.recordDuration("store_commit_ms", commitStartedAt, {
			workspace_file_tree_count: this.workspaceFileTree.length,
			workspace_files_list_count: this.workspaceFilesList.length,
			list_reused: hasReusableList,
			source,
		})
		perf.snapshotHeap("after_setWorkspaceFileTree")
	}

	private createWorkspaceFilesListFromReusableList(
		tree: AttachmentItem[],
		list: AttachmentItem[],
		perf: ReturnType<typeof createFileTreePerfScope>,
		source: string,
	) {
		const treeItemByFileId = perf.measure(
			"store_tree_id_index_ms",
			() => this.indexWorkspaceFileTreeByFileId(tree),
			(result) => ({
				tree_id_index_count: result.size,
				provided_list_count: list.length,
				list_reused: true,
				source,
			}),
		)

		return perf.measure(
			"store_list_reuse_ms",
			() => this.reuseWorkspaceFilesList(list, treeItemByFileId),
			(result) => ({
				reused_list_count: result.length,
				provided_list_count: list.length,
				list_reused: true,
				source,
			}),
		)
	}

	private indexWorkspaceFileTreeByFileId(tree: AttachmentItem[]) {
		const itemByFileId = new Map<string, AttachmentItem>()
		const stack = [...tree].reverse()

		while (stack.length > 0) {
			const item = stack.pop()
			if (!item) continue

			if (item.file_id !== undefined && item.file_id !== null) {
				itemByFileId.set(String(item.file_id), item)
			}

			if (item.children?.length) {
				for (let index = item.children.length - 1; index >= 0; index -= 1) {
					stack.push(item.children[index])
				}
			}
		}

		return itemByFileId
	}

	private reuseWorkspaceFilesList(
		list: AttachmentItem[],
		treeItemByFileId: ReadonlyMap<string, AttachmentItem>,
	) {
		return list.map((item) => {
			const fileId = item.file_id
			if (fileId === undefined || fileId === null) return item
			return treeItemByFileId.get(String(fileId)) || item
		})
	}

	applyFileChanges(
		changes: SuperMagicFileChangeItem[],
		options: { locale?: string; trace?: ProjectAttachmentsChangeTraceContext } = {},
	): ApplyProjectAttachmentsChangesResult {
		const perf = createFileTreePerfScope(this.workspaceFileTree)
		const commitStartedAt = perf.start()
		projectAttachmentsChangeLog.storeApplyStart({
			trace: options.trace,
			changeCount: changes.length,
			beforeTreeCount: this.workspaceFileTree.length,
			beforeListCount: this.workspaceFilesList.length,
		})
		const result = perf.measure("store_apply_file_changes_ms", () =>
			applyProjectAttachmentsChangesToTree(this.workspaceFileTree, changes, options),
		)

		if (!result.fallbackRequired) {
			this.workspaceFileTree = result.tree
			this.workspaceFilesList = result.list
		}

		perf.recordDuration("store_apply_file_changes_commit_ms", commitStartedAt, {
			trace_id: options.trace?.traceId,
			project_id: options.trace?.projectId,
			change_count: changes.length,
			applied_count: result.appliedCount,
			skipped_count: result.skippedCount,
			fallback_required: result.fallbackRequired,
			fallback_reason: result.fallbackReason || "",
			operation_add_count: result.operationCounts.add,
			operation_delete_count: result.operationCounts.delete,
			operation_update_count: result.operationCounts.update,
			operation_unknown_count: result.operationCounts.unknown,
		})
		projectAttachmentsChangeLog.storeApplyFinish({
			trace: options.trace,
			changeCount: changes.length,
			result,
			afterTreeCount: this.workspaceFileTree.length,
			afterListCount: this.workspaceFilesList.length,
		})

		return result
	}

	addWorkspaceFile(file: AttachmentItem) {
		// Skip if file is hidden
		if (file.is_hidden) return

		const normalizedFile: AttachmentItem = {
			...file,
			type: file.type ?? (file.is_directory ? "directory" : "file"),
		}

		// Add to list
		this.workspaceFilesList = [...this.workspaceFilesList, normalizedFile]

		// Add to tree
		if (normalizedFile.parent_id) {
			this.workspaceFileTree = this.insertFileIntoTree(
				this.workspaceFileTree,
				normalizedFile.parent_id,
				normalizedFile,
			)
		} else {
			// Add to root level
			this.workspaceFileTree = [...this.workspaceFileTree, normalizedFile]
		}
	}

	/**
	 * Insert a node without mutating the existing tree. This keeps observable.ref updates visible.
	 */
	private insertFileIntoTree(
		tree: AttachmentItem[],
		parentId: string,
		file: AttachmentItem,
	): AttachmentItem[] {
		let inserted = false

		const nextTree = tree.map((node) => {
			if (node.file_id === parentId) {
				inserted = true
				return {
					...node,
					children: [...(node.children || []), file],
				}
			}

			if (!node.children?.length) return node

			const nextChildren = this.insertFileIntoTree(node.children, parentId, file)
			if (nextChildren === node.children) return node

			inserted = true
			return {
				...node,
				children: nextChildren,
			}
		})

		return inserted ? nextTree : tree
	}

	flattenWorkspaceFileTree(tree: AttachmentItem[]) {
		const flattenedTree: AttachmentItem[] = []
		const stack = [...tree].reverse()

		while (stack.length > 0) {
			const item = stack.pop()
			if (!item) continue

			flattenedTree.push(item)

			if (item.children?.length) {
				for (let index = item.children.length - 1; index >= 0; index -= 1) {
					stack.push(item.children[index])
				}
			}
		}

		return flattenedTree
	}

	excludeHiddenItems(items: AttachmentItem[]): AttachmentItem[] {
		return items.filter((item) => !item.is_hidden)
	}

	hasProjectFile(fileId: string) {
		const matches = this.workspaceFilesList.filter((file) => file.file_id === fileId)
		const hasMatch = matches.some((file) => file.type === "file")
		return hasMatch
	}
}

const projectFilesStore = new ProjectFilesStore()

export const createProjectFilesStore = () => {
	return new ProjectFilesStore()
}

export default projectFilesStore
