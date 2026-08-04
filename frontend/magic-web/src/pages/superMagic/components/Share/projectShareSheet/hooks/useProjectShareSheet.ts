import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { NodeType, type TreeNode } from "@dtyq/user-selector"
import { SuperMagicApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import { clipboard } from "@/utils/clipboard-helpers"
import { ShareMode, ShareType, ResourceType } from "@/pages/superMagic/components/Share/types"
import {
	calculateDefaultShareName,
	generateSharePassword,
} from "@/pages/superMagic/components/Share/utils"
import {
	calculateDefaultOpenFileId,
	canSetAsDefault,
	findFileInTree,
	isFileDescendantOfSelectedFolders,
} from "@/pages/superMagic/components/Share/FileSelector/utils"
import { useShareProject } from "@/pages/superMagic/layouts/MainLayout/hooks/useShareProject"
import {
	SharedResourceType,
	SharedTopicFilterStatus,
	type FileShareItem,
	type ProjectShareItem,
} from "@/pages/superMagic/components/ShareManagement/types"
import { useShareData } from "@/pages/superMagic/components/ShareManagement/hooks/useShareData"
import { generateShareUrl } from "@/pages/superMagic/components/ShareManagement/utils/shareTypeHelpers"
import {
	canUseNativeShare,
	shareToNativeTarget,
} from "@/pages/superMagic/components/Share/utils/nativeShare"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type {
	MobileShareItem,
	MobileShareSheetMode,
	ProjectShareFormState,
	ProjectShareSheetController,
	ProjectShareSheetProps,
	ProjectShareSheetView,
	SelectedFileHierarchyNode,
} from "../types"
import { buildShareClipboardText } from "../utils/buildShareClipboardText"
import { isOrganizationShareScopeAll } from "@/pages/superMagic/components/ShareManagement/utils/shareScopeSummary"
import { isPartialFileShare, isWholeProjectShare } from "../utils/shareScope"
import {
	buildRecordingShareSelection,
	collectRecordingRequiredShareFileIds,
	mergeRecordingShareFileIds,
} from "@/pages/superMagic/pages/AudioRecordings/utils/build-recording-share-selection"
import { isAudioProjectMode } from "@/services/audioRecordings/audioProjectMode"

/**
 * Constructs the base default values for the share form.
 * `shareName` will be overridden by `buildDefaultShareNameForSheet` when the Sheet opens the creation page.
 */
function createInitialFormState(isAudioRecordingScene = false): ProjectShareFormState {
	return {
		shareName: "",
		shareType: ShareType.PasswordProtected,
		shareExpiry: null,
		password: generateSharePassword(),
		shareRange: "all",
		shareTargets: [],
		advancedSettings: {
			allowCopy: true,
			showFileList: isAudioRecordingScene ? false : true,
			showOriginalInfo: true,
			hideCreatorInfo: false,
			allowDownloadProjectFile: true,
		},
	}
}

/**
 * Retrieves the selected files/folders from the attachment tree,
 * used for displaying the creation page and detail page in file mode.
 */
function collectSelectedItems(
	attachments: AttachmentItem[],
	selectedIds: string[],
): AttachmentItem[] {
	if (selectedIds.length === 0 || attachments.length === 0) {
		return []
	}

	const selectedIdSet = new Set(selectedIds)
	const result: AttachmentItem[] = []

	const visit = (items: AttachmentItem[]) => {
		items.forEach((item) => {
			const itemId = item.file_id
			if (itemId && selectedIdSet.has(itemId)) {
				result.push(item)
			}
			if (item.children?.length) {
				visit(item.children)
			}
		})
	}

	visit(attachments)
	return result
}

interface BuildDefaultShareNameForSheetParams {
	mode: MobileShareSheetMode
	projectMode?: string | null
	defaultOpenFileId?: string
	attachments: AttachmentItem[]
	effectiveSelectedFileIds: string[]
	projectName?: string
	t: (key: string, options?: Record<string, unknown>) => string
}

function buildDefaultShareNameForSheet({
	mode,
	projectMode,
	defaultOpenFileId,
	attachments,
	effectiveSelectedFileIds,
	projectName,
	t,
}: BuildDefaultShareNameForSheetParams): string {
	const selectedItems = collectSelectedItems(attachments, effectiveSelectedFileIds)
	return calculateDefaultShareName(
		defaultOpenFileId,
		selectedItems,
		attachments,
		t,
		mode === "project",
		projectName,
		projectMode,
	)
}

/**
 * Converts attachment nodes into tree nodes that can be directly rendered by the share Sheet,
 * preventing the View layer from having to parse the raw attachment structure.
 */
function createSelectedHierarchyNode(item: AttachmentItem): SelectedFileHierarchyNode | null {
	const itemId = item.file_id
	if (!itemId) {
		return null
	}

	return {
		id: itemId,
		name: item.name || item.file_name || item.display_filename || item.filename || "",
		isDirectory: Boolean(item.is_directory),
		fileExtension: item.file_extension,
		children: (item.children || [])
			.map((child) => createSelectedHierarchyNode(child))
			.filter((child): child is SelectedFileHierarchyNode => Boolean(child)),
	}
}

/**
 * Builds the hierarchical tree of "selected files":
 * - When a file is directly selected, it is kept as a root node.
 * - When a folder is directly selected, the entire folder subtree is preserved, ensuring descendants and subfolders can be expanded in details.
 * - Unselected parent folders will not appear as extra items at the root level to keep the sharing semantic clean.
 */
function buildSelectedFileHierarchy(
	attachments: AttachmentItem[],
	selectedIds: string[],
): SelectedFileHierarchyNode[] {
	if (selectedIds.length === 0 || attachments.length === 0) {
		return []
	}

	const selectedIdSet = new Set(selectedIds)
	const result: SelectedFileHierarchyNode[] = []

	const visit = (items: AttachmentItem[]) => {
		items.forEach((item) => {
			const itemId = item.file_id
			if (!itemId) {
				if (item.children?.length) {
					visit(item.children)
				}
				return
			}

			if (selectedIdSet.has(itemId)) {
				const node = createSelectedHierarchyNode(item)
				if (node) {
					result.push(node)
				}
				return
			}

			if (item.children?.length) {
				visit(item.children)
			}
		})
	}

	visit(attachments)
	return result
}

/**
 * Counts the number of selected files:
 * - Regular files count as 1.
 * - Folders count as the total number of their descendant files.
 * - Empty folders fall back to a count of 1, avoiding showing "Selected 0 files" when an empty folder is actually selected.
 */
function countSelectedHierarchyFiles(nodes: SelectedFileHierarchyNode[]): number {
	return nodes.reduce((total, node) => {
		if (!node.isDirectory) {
			return total + 1
		}

		const childCount = countSelectedHierarchyFiles(node.children)
		return total + (childCount > 0 ? childCount : 1)
	}, 0)
}

/**
 * Checks whether a default-open candidate still belongs to the current share selection.
 */
function isDefaultOpenFileInSelection(
	fileId: string,
	selectedFileIds: string[],
	attachments: AttachmentItem[],
): boolean {
	if (selectedFileIds.includes(fileId)) {
		return true
	}

	const selectedIdSet = new Set(selectedFileIds)
	const stack = [...attachments]

	while (stack.length > 0) {
		const item = stack.pop()
		if (!item?.file_id) {
			if (item?.children?.length) {
				stack.push(...item.children)
			}
			continue
		}

		if (selectedIdSet.has(item.file_id) && item.children?.length) {
			const childrenStack = [...item.children]
			while (childrenStack.length > 0) {
				const child = childrenStack.pop()
				if (child?.file_id === fileId) {
					return true
				}
				if (child?.children?.length) {
					childrenStack.push(...child.children)
				}
			}
			continue
		}

		if (item.children?.length) {
			stack.push(...item.children)
		}
	}

	// Some flat payloads only preserve parent_id, so keep the existing helper as a compatibility fallback.
	return isFileDescendantOfSelectedFolders(fileId, selectedFileIds, attachments)
}

/**
 * Finds an attachment by ID using the current tree payload without relying on parent metadata.
 */
function findAttachmentInTree(
	attachments: AttachmentItem[],
	fileId: string,
): AttachmentItem | undefined {
	const stack = [...attachments]

	while (stack.length > 0) {
		const item = stack.pop()
		if (!item) {
			continue
		}

		if (item.file_id === fileId) {
			return item
		}

		if (item.children?.length) {
			stack.push(...item.children)
		}
	}

	return undefined
}

/**
 * Resolves the file ID used for default-open behavior in mobile file shares.
 */
function resolveDefaultOpenFileId({
	defaultOpenFileId,
	selectedFileIds,
	attachments,
}: {
	defaultOpenFileId?: string
	selectedFileIds: string[]
	attachments: AttachmentItem[]
}): string | undefined {
	if (selectedFileIds.length === 0 || attachments.length === 0) {
		return undefined
	}

	if (
		defaultOpenFileId &&
		canSetAsDefault(findAttachmentInTree(attachments, defaultOpenFileId) ?? {}) &&
		isDefaultOpenFileInSelection(defaultOpenFileId, selectedFileIds, attachments)
	) {
		return defaultOpenFileId
	}

	return calculateDefaultOpenFileId(selectedFileIds, attachments) ?? undefined
}

/**
 * Finds a default-open attachment from the flat list first, falling back to the tree only when needed.
 */
function findDefaultOpenFileItem({
	fileId,
	attachmentList,
	attachments,
}: {
	fileId?: string
	attachmentList: AttachmentItem[]
	attachments: AttachmentItem[]
}): AttachmentItem | undefined {
	if (!fileId) {
		return undefined
	}

	return (
		attachmentList.find((item) => item.file_id === fileId) ||
		(findFileInTree(
			attachments as unknown as Record<string, unknown>[],
			fileId,
		) as AttachmentItem | null) ||
		undefined
	)
}

/**
 * Builds the selectable default-open scope as a pruned tree plus a flat candidate list.
 * Folders stay in the tree for navigation, while only openable files/folders become candidates.
 */
function buildDefaultOpenFileScope({
	attachments,
	selectedFileIds,
	includeWholeTree,
}: {
	attachments: AttachmentItem[]
	selectedFileIds: string[]
	includeWholeTree: boolean
}): { tree: AttachmentItem[]; candidates: AttachmentItem[] } {
	const selectedIdSet = new Set(selectedFileIds)
	const candidates: AttachmentItem[] = []

	const visit = (item: AttachmentItem, forceIncludeChildren: boolean): AttachmentItem | null => {
		const itemId = item.file_id
		const isSelectedRoot = includeWholeTree || Boolean(itemId && selectedIdSet.has(itemId))
		const shouldIncludeChildren = forceIncludeChildren || isSelectedRoot
		const childNodes = (item.children || [])
			.map((child) => visit(child, shouldIncludeChildren))
			.filter((child): child is AttachmentItem => Boolean(child))

		if (item.is_hidden || !itemId) {
			return childNodes.length > 0
				? ({ ...item, children: childNodes } as AttachmentItem)
				: null
		}

		if (shouldIncludeChildren && canSetAsDefault(item)) {
			candidates.push(item)
		}

		if (shouldIncludeChildren || childNodes.length > 0) {
			return {
				...item,
				children: childNodes,
			}
		}

		return null
	}

	if (attachments.length === 0) {
		return { tree: [], candidates }
	}

	return {
		tree: attachments
			.map((item) => visit(item, includeWholeTree))
			.filter((item): item is AttachmentItem => Boolean(item)),
		candidates,
	}
}

const DINGTALK_AVATAR_SIZE_SUFFIX_PATTERN = /@\d+w_\d+h$/

function normalizeDetailMemberNode(node: TreeNode): TreeNode {
	const isUser = node.type === "User" || node.dataType === NodeType.User
	const normalizedId = isUser ? node.user_id || node.id : node.department_id || node.id
	const normalizedAvatarUrl =
		typeof node.avatar_url === "string" &&
		node.avatar_url.includes("static-legacy.dingtalk.com")
			? node.avatar_url.replace(DINGTALK_AVATAR_SIZE_SUFFIX_PATTERN, "")
			: node.avatar_url || ""

	return {
		...node,
		id: normalizedId,
		avatar_url: normalizedAvatarUrl,
	}
}

/**
 * Mobile project share controller: orchestrates only the prototype view stack,
 * and delegates actions like save, list, and cancel to the existing share API/Hooks.
 */
export function useProjectShareSheet({
	open,
	mode = "project",
	projectMode,
	projectId,
	projectName,
	attachments,
	attachmentList,
	fileMap,
	defaultSelectedFileIds,
	defaultOpenFileId,
	initialSelectedShare,
	onClose,
}: ProjectShareSheetProps): ProjectShareSheetController {
	const { t } = useTranslation("super")
	const isAudioRecordingScene = isAudioProjectMode(projectMode)
	const effectiveMode: MobileShareSheetMode = isAudioRecordingScene ? "file" : mode
	const shareMode = effectiveMode === "file" ? ShareMode.File : ShareMode.Project
	const recordingShareSelection = useMemo(
		() => buildRecordingShareSelection(isAudioRecordingScene ? (fileMap ?? null) : null),
		[fileMap, isAudioRecordingScene],
	)
	const recordingRequiredFileIds = useMemo(
		() => (isAudioRecordingScene ? collectRecordingRequiredShareFileIds(fileMap ?? null) : []),
		[fileMap, isAudioRecordingScene],
	)
	const shareableAttachments = isAudioRecordingScene
		? recordingShareSelection.shareableFiles
		: attachments
	const shareableAttachmentList = useMemo(
		() =>
			isAudioRecordingScene ? recordingShareSelection.shareableFiles : (attachmentList ?? []),
		[attachmentList, isAudioRecordingScene, recordingShareSelection.shareableFiles],
	)
	const [view, setView] = useState<ProjectShareSheetView>("create")
	const [viewStack, setViewStack] = useState<ProjectShareSheetView[]>([])
	const [selectedShareId, setSelectedShareId] = useState<string | null>(null)
	const [localSelectedShare, setLocalSelectedShare] = useState<MobileShareItem | null>(null)
	const [saving, setSaving] = useState(false)
	const [editResourceId, setEditResourceId] = useState<string | undefined>()
	const [advancedOpen, setAdvancedOpen] = useState(true)
	const [memberSelectorOpen, setMemberSelectorOpen] = useState(false)
	const [selectedMemberNodes, setSelectedMemberNodes] = useState<TreeNode[]>([])
	const [detailMemberNodes, setDetailMemberNodes] = useState<TreeNode[]>([])
	const [detailMemberLoading, setDetailMemberLoading] = useState(false)
	// Keep the prefetched text tied to its share so a rapid selection change cannot reuse stale content.
	const [selectedShareMessage, setSelectedShareMessage] = useState<{
		resourceId: string
		text: string
	} | null>(null)
	const [canNativeShare] = useState(() => canUseNativeShare())
	const [formState, setFormState] = useState<ProjectShareFormState>(() =>
		createInitialFormState(isAudioRecordingScene),
	)
	const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
	const [userDefaultOpenFileId, setUserDefaultOpenFileId] = useState<string | undefined>()
	const [defaultOpenFilePickerOpen, setDefaultOpenFilePickerOpen] = useState(false)

	const shareProject = useShareProject({
		attachments: shareableAttachments,
		projectName,
	})
	const effectiveSelectedFileIds = useMemo(() => {
		if (isAudioRecordingScene) {
			return selectedFileIds
		}

		if (effectiveMode === "file") {
			if (defaultSelectedFileIds) {
				return defaultSelectedFileIds
			}

			if (
				initialSelectedShare &&
				"file_ids" in initialSelectedShare &&
				Array.isArray(initialSelectedShare.file_ids)
			) {
				return initialSelectedShare.file_ids
			}

			return []
		}

		return shareProject.defaultSelectedFileIds
	}, [
		defaultSelectedFileIds,
		effectiveMode,
		initialSelectedShare,
		isAudioRecordingScene,
		selectedFileIds,
		shareProject.defaultSelectedFileIds,
	])
	const defaultOpenFileScope = useMemo(() => {
		if (isAudioRecordingScene) {
			return { tree: [], candidates: [] }
		}

		return buildDefaultOpenFileScope({
			attachments: shareableAttachments,
			selectedFileIds: effectiveSelectedFileIds,
			includeWholeTree: effectiveMode === "project",
		})
	}, [effectiveMode, effectiveSelectedFileIds, isAudioRecordingScene, shareableAttachments])
	const autoDefaultOpenFileId = useMemo(() => {
		if (isAudioRecordingScene) {
			return undefined
		}

		return resolveDefaultOpenFileId({
			defaultOpenFileId,
			selectedFileIds: effectiveSelectedFileIds,
			attachments: shareableAttachments,
		})
	}, [defaultOpenFileId, effectiveSelectedFileIds, isAudioRecordingScene, shareableAttachments])
	const effectiveDefaultOpenFileId = useMemo(() => {
		if (isAudioRecordingScene) {
			return undefined
		}

		const userDefaultFile = userDefaultOpenFileId
			? defaultOpenFileScope.candidates.find((item) => item.file_id === userDefaultOpenFileId)
			: undefined

		return userDefaultFile?.file_id || autoDefaultOpenFileId
	}, [
		autoDefaultOpenFileId,
		defaultOpenFileScope.candidates,
		isAudioRecordingScene,
		userDefaultOpenFileId,
	])
	const defaultOpenFileItem = useMemo(
		() =>
			findDefaultOpenFileItem({
				fileId: effectiveDefaultOpenFileId,
				attachmentList: shareableAttachmentList,
				attachments: shareableAttachments,
			}),
		[effectiveDefaultOpenFileId, shareableAttachmentList, shareableAttachments],
	)

	// Share-management list API requires login; only fetch when the sheet is open.
	const shouldFetchShareLists = open && Boolean(projectId)

	const projectShareList = useShareData({
		resourceType: SharedResourceType.Project,
		filterStatus: SharedTopicFilterStatus.Active,
		searchText: "",
		projectId,
		currentPage: 1,
		pageSize: 50,
		enabled: shouldFetchShareLists,
	})
	const fileShareList = useShareData({
		resourceType: SharedResourceType.File,
		filterStatus: SharedTopicFilterStatus.Active,
		searchText: "",
		projectId,
		currentPage: 1,
		pageSize: 50,
		enabled: shouldFetchShareLists,
	})

	useEffect(() => {
		if (!open) return
		setView(initialSelectedShare ? "linkDetail" : "create")
		setViewStack([])
		setSelectedShareId(initialSelectedShare?.resource_id || null)
		setLocalSelectedShare(initialSelectedShare || null)
		setEditResourceId(undefined)
		setAdvancedOpen(true)
		setMemberSelectorOpen(false)
		setSelectedMemberNodes([])
		setDetailMemberNodes([])
		setDetailMemberLoading(false)
		setSelectedShareMessage(null)
		setUserDefaultOpenFileId(undefined)
		setDefaultOpenFilePickerOpen(false)
		setFormState({
			...createInitialFormState(isAudioRecordingScene),
			shareName: initialSelectedShare
				? ""
				: buildDefaultShareNameForSheet({
						mode: effectiveMode,
						projectMode,
						defaultOpenFileId: effectiveDefaultOpenFileId,
						attachments: shareableAttachments,
						effectiveSelectedFileIds: isAudioRecordingScene
							? recordingShareSelection.defaultSelectedFileIds
							: effectiveSelectedFileIds,
						projectName,
						t,
					}),
		})
		if (isAudioRecordingScene) {
			setSelectedFileIds(recordingShareSelection.defaultSelectedFileIds)
		}
		// Intentionally omit selection/mode deps so reopening does not overwrite user-edited shareName mid-session.
		// eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when sheet open context changes
	}, [open, projectName, initialSelectedShare])

	const filteredShareItems = useMemo(() => {
		const projectItems = projectShareList.data.filter(
			(item): item is ProjectShareItem => "resource_id" in item,
		)
		const fileItems = fileShareList.data.filter(
			(item): item is FileShareItem => "resource_id" in item,
		)
		const mergedItems = [...projectItems, ...fileItems]
		const scopedItems = !projectId
			? mergedItems
			: mergedItems.filter((item) => !item.project_id || item.project_id === projectId)

		return scopedItems.sort(
			(left, right) =>
				new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
		)
	}, [fileShareList.data, projectId, projectShareList.data])

	const selectedShare = useMemo(() => {
		const remoteMatch =
			filteredShareItems.find((item) => item.resource_id === selectedShareId) || null
		if (remoteMatch) return remoteMatch
		if (localSelectedShare?.resource_id === selectedShareId) return localSelectedShare
		return null
	}, [filteredShareItems, localSelectedShare, selectedShareId])
	// Expose text only when it belongs to the currently selected share.
	const selectedShareMessageText =
		selectedShareMessage && selectedShareMessage.resourceId === selectedShare?.resource_id
			? selectedShareMessage.text
			: ""
	const displayedSelectedFileIds = useMemo(() => {
		// Whole-project share detail: do not use list selection or share.file_ids, to avoid showing the selected-files block incorrectly.
		if (selectedShare && isWholeProjectShare(selectedShare)) {
			return []
		}

		if (
			selectedShare &&
			isPartialFileShare(selectedShare) &&
			"file_ids" in selectedShare &&
			Array.isArray(selectedShare.file_ids) &&
			selectedShare.file_ids.length > 0
		) {
			return selectedShare.file_ids
		}

		return effectiveSelectedFileIds
	}, [effectiveSelectedFileIds, selectedShare])
	const selectedFileItems = useMemo(
		() => collectSelectedItems(shareableAttachments, displayedSelectedFileIds),
		[displayedSelectedFileIds, shareableAttachments],
	)
	const selectedFileHierarchy = useMemo(
		() => buildSelectedFileHierarchy(shareableAttachments, displayedSelectedFileIds),
		[displayedSelectedFileIds, shareableAttachments],
	)
	const selectedFileCount = useMemo(
		() => countSelectedHierarchyFiles(selectedFileHierarchy),
		[selectedFileHierarchy],
	)

	useEffect(() => {
		if (
			!open ||
			view !== "linkDetail" ||
			selectedShare?.share_type !== ShareType.Organization ||
			!selectedShare.resource_id ||
			isOrganizationShareScopeAll(selectedShare.share_scope)
		) {
			setDetailMemberNodes([])
			setDetailMemberLoading(false)
			return
		}

		let isCancelled = false
		setDetailMemberLoading(true)
		setDetailMemberNodes([])

		// Keep the detail shell responsive and ignore late responses when the user switches shares quickly.
		void SuperMagicApi.getShareResourceMembers({
			resource_id: selectedShare.resource_id,
		})
			.then((response) => {
				if (isCancelled) {
					return
				}

				setDetailMemberNodes((response.members || []).map(normalizeDetailMemberNode))
			})
			.catch((error) => {
				if (isCancelled) {
					return
				}

				console.error("Failed to fetch organization share members:", error)
				setDetailMemberNodes([])
			})
			.finally(() => {
				if (!isCancelled) {
					setDetailMemberLoading(false)
				}
			})

		return () => {
			isCancelled = true
		}
	}, [
		open,
		selectedShare?.resource_id,
		selectedShare?.share_scope,
		selectedShare?.share_type,
		view,
	])

	useEffect(() => {
		if (!open || view !== "linkDetail" || !selectedShare?.resource_id) {
			setSelectedShareMessage(null)
			return
		}

		let isCancelled = false
		setSelectedShareMessage(null)
		const resourceId = selectedShare.resource_id

		// Prebuild the shared payload before any user action so iOS clipboard and Web Share calls stay inside the click gesture.
		void buildShareClipboardText({
			share: selectedShare,
			projectName,
			t,
		})
			.then((shareMessageText) => {
				if (!isCancelled) {
					setSelectedShareMessage({ resourceId, text: shareMessageText })
				}
			})
			.catch((error) => {
				if (!isCancelled) {
					console.error("Failed to build share message:", error)
					setSelectedShareMessage(null)
				}
			})

		return () => {
			isCancelled = true
		}
		// The selected share is the real rebuild signal; keeping `t` out avoids repeated async rebuilds in tests with unstable mocks.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, projectName, selectedShare, view])

	const goTo = useMemoizedFn((nextView: ProjectShareSheetView) => {
		setViewStack((prev) => [...prev, view])
		setView(nextView)
	})

	const goBack = useMemoizedFn(() => {
		setViewStack((prev) => {
			const nextStack = [...prev]
			const previousView = nextStack.pop()
			setView(previousView || "create")
			return nextStack
		})
	})

	const setFormValue = useCallback(
		<K extends keyof ProjectShareFormState>(key: K, value: ProjectShareFormState[K]) => {
			setFormState((prev) => ({
				...prev,
				[key]: value,
			}))
		},
		[],
	)

	const refreshShareList = useMemoizedFn(() => {
		projectShareList.refreshData()
		fileShareList.refreshData()
	})

	const confirmMemberSelector = useMemoizedFn((value: TreeNode[]) => {
		setSelectedMemberNodes(value)
		setMemberSelectorOpen(false)
		setFormState((prev) => ({
			...prev,
			// For mobile, selecting members implies sharing with a designated scope, preventing fallback to organization-wide visibility during submission.
			shareRange: value.length > 0 ? "designated" : "all",
			shareTargets: value.map((item) => ({
				target_type: item.dataType === NodeType.User ? "User" : "Department",
				target_id: item.id,
				name: item.name,
				avatar_url: item.avatar_url,
			})),
		}))
	})

	const openDefaultOpenFilePicker = useMemoizedFn(() => {
		if (defaultOpenFileScope.candidates.length === 0) return
		setDefaultOpenFilePickerOpen(true)
	})

	const closeDefaultOpenFilePicker = useMemoizedFn(() => {
		setDefaultOpenFilePickerOpen(false)
	})

	const selectDefaultOpenFile = useMemoizedFn((fileId: string) => {
		// Only accept IDs from the current share scope so the submitted payload cannot escape the visible picker.
		const selectedCandidate = defaultOpenFileScope.candidates.find(
			(item) => item.file_id === fileId,
		)
		if (!selectedCandidate?.file_id) return

		setUserDefaultOpenFileId(selectedCandidate.file_id)
		setDefaultOpenFilePickerOpen(false)
	})

	const copySelectedShareUrl = useMemoizedFn(async () => {
		if (!selectedShare?.resource_id || !selectedShareMessageText) return

		try {
			// Keep the clipboard write as the first asynchronous operation in the click handler for iOS WebKit.
			await clipboard.writeText(selectedShareMessageText)
			magicToast.success(t("share.copySuccess"))
		} catch {
			magicToast.error(t("common.copyFailed"))
		}
	})

	const copySelectedSharePassword = useMemoizedFn(async () => {
		if (!selectedShare?.password) return

		try {
			await clipboard.writeText(selectedShare.password)
			magicToast.success(t("share.copyPasswordSuccess"))
		} catch {
			magicToast.error(t("common.copyFailed"))
		}
	})

	/**
	 * Shares the prebuilt detail message through the mobile system share sheet.
	 */
	const shareSelectedShareToSystem = useMemoizedFn(async () => {
		if (!selectedShare?.resource_id || !selectedShareMessageText) return

		const shareUrl = generateShareUrl(
			selectedShare.resource_id,
			selectedShare.password,
			"files",
		)
		const result = await shareToNativeTarget({
			title: selectedShare.title || projectName,
			text: selectedShareMessageText,
			url: shareUrl,
		})

		if (result === "failed" || result === "unsupported") {
			magicToast.error(t("share.nativeShareFailed"))
		}
	})

	const submitCreateShare = useMemoizedFn(async () => {
		if (effectiveSelectedFileIds.length === 0) {
			magicToast.warning(t("share.noShareableFiles"))
			return
		}

		// Recording shares keep the visible picker unchanged and only augment the payload
		// so readonly/share pages always receive the bundle entry files they depend on.
		const submittedFileIds = isAudioRecordingScene
			? mergeRecordingShareFileIds(effectiveSelectedFileIds, recordingRequiredFileIds)
			: effectiveSelectedFileIds

		setSaving(true)
		try {
			// Align with desktop FileShareModal: allocate share resource_id via snowflake API.
			const resourceIdResponse = await SuperMagicApi.getSnowflakeIds()
			const resourceId = resourceIdResponse?.ids?.[0]
			if (!resourceId) {
				throw new Error("Failed to get share resource id")
			}

			const password =
				formState.shareType === ShareType.PasswordProtected ? formState.password : undefined
			const fallbackShareName =
				effectiveMode === "file"
					? calculateDefaultShareName(
							effectiveDefaultOpenFileId,
							selectedFileItems,
							shareableAttachments,
							t,
							false,
							projectName,
							projectMode,
						)
					: t("share.projectShareName", {
							projectName: projectName || t("common.untitledProject"),
						})
			const resourceName = formState.shareName.trim() || fallbackShareName

			await SuperMagicApi.createOrUpdateShareResource({
				resource_id: resourceId,
				resource_type: ResourceType.FileCollection,
				share_type: formState.shareType,
				resource_name: resourceName,
				expire_days: formState.shareExpiry === null ? undefined : formState.shareExpiry,
				share_range:
					formState.shareType === ShareType.Organization
						? formState.shareRange
						: undefined,
				target_ids:
					formState.shareType === ShareType.Organization &&
					formState.shareRange === "designated"
						? formState.shareTargets.map((target) => ({
								target_type: target.target_type,
								target_id: target.target_id,
							}))
						: undefined,
				password,
				file_ids: submittedFileIds,
				default_open_file_id: isAudioRecordingScene
					? undefined
					: effectiveDefaultOpenFileId,
				share_project: isAudioRecordingScene ? false : effectiveMode === "project",
				project_id: projectId,
				extra: {
					allow_copy_project_files: formState.advancedSettings.allowCopy ?? true,
					view_file_list: isAudioRecordingScene
						? false
						: (formState.advancedSettings.showFileList ?? true),
					hide_created_by_super_magic:
						formState.advancedSettings.hideCreatorInfo ?? false,
					show_original_info: formState.advancedSettings.showOriginalInfo ?? true,
					allow_download_project_file:
						formState.advancedSettings.allowDownloadProjectFile ?? true,
				},
			})

			const createdShareForClipboard: MobileShareItem =
				effectiveMode === "file"
					? ({
							title: resourceName,
							project_name: projectName || t("common.untitledProject"),
							project_id: projectId || "",
							workspace_id: "",
							workspace_name: "",
							resource_type: ResourceType.FileCollection,
							share_type: formState.shareType,
							resource_id: resourceId,
							has_password: Boolean(password),
							password,
							main_file_name:
								selectedFileItems[0]?.name || selectedFileItems[0]?.file_name || "",
							file_ids: submittedFileIds,
							created_at: new Date().toISOString(),
							expire_at: undefined,
							share_project: false,
							extend: {
								file_count: submittedFileIds.length,
							},
						} satisfies FileShareItem)
					: ({
							title: resourceName,
							project_name: projectName || t("common.untitledProject"),
							project_id: projectId || "",
							workspace_id: "",
							workspace_name: "",
							resource_type: ResourceType.Project,
							share_type: formState.shareType,
							resource_id: resourceId,
							has_password: Boolean(password),
							password,
							created_at: new Date().toISOString(),
							expire_at: undefined,
							extend: {
								file_count: submittedFileIds.length,
							},
						} satisfies ProjectShareItem)

			try {
				const shareMessageText = await buildShareClipboardText({
					share: createdShareForClipboard,
					projectName,
					t,
				})
				clipboard.writeText(shareMessageText)
			} catch (error) {
				console.error("Failed to copy share message after create:", error)
			}

			magicToast.success(t("share.createSuccessAndCopied"))
			refreshShareList()
			setLocalSelectedShare(createdShareForClipboard)
			setSelectedShareId(resourceId)
			setView("linkDetail")
			// Clear stack so the header close button dismisses the whole sheet instead of returning to create.
			setViewStack([])
		} catch (error) {
			console.error("Failed to create project share:", error)
			magicToast.error(t("share.createFailed"))
		} finally {
			setSaving(false)
		}
	})

	const openEditSelectedShare = useMemoizedFn(() => {
		if (!selectedShare?.resource_id) return
		setEditResourceId(selectedShare.resource_id)
	})

	const confirmCancelShare = useMemoizedFn(async () => {
		if (!selectedShare?.resource_id) return
		await projectShareList.cancelShare(selectedShare.resource_id)
		refreshShareList()
		setSelectedShareId(null)
		setLocalSelectedShare(null)
		setView("manage")
		setViewStack([])
	})

	const toggleShareFileId = useMemoizedFn((fileId: string) => {
		if (!isAudioRecordingScene) return

		setSelectedFileIds((current) =>
			current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId],
		)
	})

	return {
		open,
		mode: effectiveMode,
		projectMode,
		shareMode,
		view,
		viewStack,
		projectName,
		projectId,
		formState,
		filteredShareItems,
		selectedShare,
		loading: projectShareList.loading || fileShareList.loading,
		saving,
		isCheckingShare: effectiveMode === "project" ? shareProject.isCheckingShare : false,
		advancedOpen,
		defaultSelectedFileIds: effectiveSelectedFileIds,
		selectedFileIds,
		groupedShareItems: recordingShareSelection.groupedItems,
		enableInlineFileSelection: isAudioRecordingScene,
		selectedFileItems,
		selectedFileHierarchy,
		selectedFileCount,
		defaultOpenFileId: effectiveDefaultOpenFileId,
		defaultOpenFileItem,
		defaultOpenFileCandidates: defaultOpenFileScope.candidates,
		defaultOpenFileCandidateTree: defaultOpenFileScope.tree,
		defaultOpenFilePickerOpen,
		memberSelectorOpen,
		selectedMemberNodes,
		detailMemberNodes,
		detailMemberLoading,
		selectedShareMessageText,
		canNativeShare,
		setShareName: (value) => setFormValue("shareName", value),
		setShareType: (value) => setFormValue("shareType", value),
		setShareExpiry: (value) => setFormValue("shareExpiry", value),
		setPassword: (value) => setFormValue("password", value),
		resetPassword: () => setFormValue("password", generateSharePassword()),
		setShareRange: (value) => setFormValue("shareRange", value),
		setShareTargets: (value) => setFormValue("shareTargets", value),
		setAdvancedSettings: (value) => setFormValue("advancedSettings", value),
		setAdvancedOpen,
		setSelectedFileIds,
		toggleShareFileId,
		openMemberSelector: () => setMemberSelectorOpen(true),
		closeMemberSelector: () => setMemberSelectorOpen(false),
		setSelectedMemberNodes,
		confirmMemberSelector,
		goToManage: () => goTo("manage"),
		goToExpiry: () => goTo("expiry"),
		goToDeleteConfirm: () => goTo("deleteConfirm"),
		goToLinkDetail: (resourceId) => {
			setSelectedShareId(resourceId)
			setLocalSelectedShare(null)
			goTo("linkDetail")
		},
		goBack,
		close: onClose,
		refreshShareList,
		copySelectedShareUrl,
		copySelectedSharePassword,
		shareSelectedShareToSystem,
		openDefaultOpenFilePicker,
		closeDefaultOpenFilePicker,
		selectDefaultOpenFile,
		submitCreateShare,
		openEditSelectedShare,
		confirmCancelShare,
		editResourceId,
		closeEditModal: () => {
			setEditResourceId(undefined)
			refreshShareList()
		},
	}
}
