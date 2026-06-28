import { memo, useState, useMemo, useCallback, useEffect } from "react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { CheckLine } from "lucide-react"
import { useMemoizedFn, useRequest } from "ahooks"
import { Separator } from "@/components/shadcn-ui/separator"
import { Button } from "@/components/shadcn-ui/button"
import { Spinner } from "@/components/shadcn-ui/spinner"
import { RecycleBinApi } from "@/apis"
import type { RecycleBin } from "@/apis/modules/recycle-bin"
import magicToast from "@/components/base/MagicToaster/utils"
import {
	createRecycleBinTabCounts,
	RECYCLE_BIN_RESOURCE_TYPE_TO_TAB_ID,
} from "@/pages/recycleBin/tab-config"
import ActionSheet from "@/pages/superMagicMobile/components/ActionSheet"
import CrossProjectFileOperationModal from "@/pages/superMagic/components/SelectPathModal/components/CrossProjectFileOperationModal"
import MoveProjectModal from "@/pages/superMagic/components/EmptyWorkspacePanel/components/MoveProjectModal"
import { projectStore, workspaceStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import {
	excludeRestoreResourceIds,
	getRestoreFailureMessage,
} from "@/pages/recycleBin/components/recycle-bin-domain"
import RecycleBinItem, { type RecycleBinItemData } from "./RecycleBinItem"
import BulkActions from "./BulkActions"
import emptyStateIcon from "../assets/svg/empty-state-icon.svg"

const RESOURCE_TYPE = {
	WORKSPACE: 1,
	PROJECT: 2,
	TOPIC: 3,
	FILE: 4,
} as const

type ResourceType = (typeof RESOURCE_TYPE)[keyof typeof RESOURCE_TYPE]

interface ItemTarget {
	kind: "item"
	item: RecycleBinItemData
}

interface SelectionTarget {
	kind: "selection"
	itemIds: string[]
}

type ActionTarget = ItemTarget | SelectionTarget

type RestoreTarget = ActionTarget

type SelectPathTarget = { type: "topic"; target: RestoreTarget }

interface SelectPathSubmitPayload {
	targetProjectId: string
	targetPath: AttachmentItem[]
	targetAttachments: AttachmentItem[]
	sourceAttachments: AttachmentItem[]
}

type ConflictType =
	| "parent_missing"
	| "name_conflict"
	| "project_missing"
	| "duplicate_restore_target"

type ConflictResolution = {
	parent_missing?: "restore_to_root"
	name_conflict?: "overwrite" | "skip"
}

type ConflictResolutions = Record<string, ConflictResolution>
const MAX_CONFLICT_NAME_PREVIEW_COUNT = 5

type PendingNameConflictItem = {
	resourceId: string
	fileName: string
}

type PendingNameConflictRestore = {
	resourceType: ResourceType
	conflictResolutions?: ConflictResolutions
	items: PendingNameConflictItem[]
	currentIndex: number
}

interface ParsedCheckResult {
	needMoveResourceIds: string[]
	noNeedMoveResourceIds: string[]
	directResourceIds: string[]
	conflictResolutions: ConflictResolutions
	pendingNameConflictItems: PendingNameConflictItem[]
	skippedNameConflictCount: number
	skippedNameConflictResourceIds: string[]
	skippedNameConflictNames: string[]
	projectMissingCount: number
	projectMissingFileNames: string[]
	duplicateRestoreTargetCount: number
}

function parseCheckResult(data: {
	items_need_move?: Array<{ resource_id: string }>
	items_no_need_move?: Array<{ resource_id: string }>
	items_with_conflict?: Array<{
		resource_id: string
		resource_name?: string
		conflict?: {
			type?: string
		}
	}>
	items_no_conflict?: Array<{ resource_id: string }>
}): ParsedCheckResult {
	const fromOldNeedMove = Array.isArray(data?.items_need_move) ? data.items_need_move : []
	const fromOldNoNeedMove = Array.isArray(data?.items_no_need_move) ? data.items_no_need_move : []
	const fromNewWithConflict = Array.isArray(data?.items_with_conflict)
		? data.items_with_conflict
		: []
	const fromNewNoConflict = Array.isArray(data?.items_no_conflict) ? data.items_no_conflict : []

	const conflictResolutions: ConflictResolutions = {}
	const needMoveFromConflicts = fromNewWithConflict
		.filter((item) => item?.conflict?.type === "parent_missing")
		.map((item) => String(item.resource_id))
	const directResourceIds: string[] = []

	let skippedNameConflictCount = 0
	const skippedNameConflictResourceIds: string[] = []
	const skippedNameConflictNames: string[] = []
	const pendingNameConflictItems: PendingNameConflictItem[] = []
	let projectMissingCount = 0
	const projectMissingFileNames: string[] = []
	let duplicateRestoreTargetCount = 0

	fromNewWithConflict.forEach((item) => {
		const resourceId = String(item.resource_id)
		const conflictType = item?.conflict?.type as ConflictType | undefined
		if (conflictType === "parent_missing") {
			// 父级不存在：直接恢复到根目录
			conflictResolutions[resourceId] = {
				parent_missing: "restore_to_root",
			}
			directResourceIds.push(resourceId)
		}
		if (conflictType === "name_conflict") {
			skippedNameConflictCount += 1
			skippedNameConflictResourceIds.push(resourceId)
			const resourceName = item.resource_name?.trim()
			if (resourceName) skippedNameConflictNames.push(resourceName)
			pendingNameConflictItems.push({
				resourceId,
				fileName: resourceName || "",
			})
		}
		if (conflictType === "project_missing") {
			projectMissingCount += 1
			const resourceName = item.resource_name?.trim()
			if (resourceName) projectMissingFileNames.push(resourceName)
		}
		if (conflictType === "duplicate_restore_target") duplicateRestoreTargetCount += 1
	})

	// 兼容老版 check 结构：items_need_move 也视为 parent_missing
	const skippedNameConflictResourceIdSet = new Set(skippedNameConflictResourceIds)
	fromOldNeedMove.forEach((item) => {
		const resourceId = String(item.resource_id)
		if (skippedNameConflictResourceIdSet.has(resourceId)) return
		conflictResolutions[resourceId] = {
			...(conflictResolutions[resourceId] ?? {}),
			parent_missing: "restore_to_root",
		}
		directResourceIds.push(resourceId)
	})

	const noConflictResourceIds =
		fromOldNoNeedMove.length > 0 ? toResourceIds(fromOldNoNeedMove) : toResourceIds(fromNewNoConflict)
	directResourceIds.push(...noConflictResourceIds)

	const needMoveResourceIds =
		fromOldNeedMove.length > 0
			? excludeRestoreResourceIds(
					toResourceIds(fromOldNeedMove),
					skippedNameConflictResourceIds,
				)
			: excludeRestoreResourceIds(needMoveFromConflicts, skippedNameConflictResourceIds)
	const noNeedMoveResourceIds =
		fromOldNoNeedMove.length > 0
			? excludeRestoreResourceIds(
					toResourceIds(fromOldNoNeedMove),
					skippedNameConflictResourceIds,
				)
			: excludeRestoreResourceIds(
					toResourceIds(fromNewNoConflict),
					skippedNameConflictResourceIds,
				)

	return {
		needMoveResourceIds,
		noNeedMoveResourceIds,
		directResourceIds: Array.from(new Set(directResourceIds)),
		conflictResolutions,
		pendingNameConflictItems,
		skippedNameConflictCount,
		skippedNameConflictResourceIds,
		skippedNameConflictNames,
		projectMissingCount,
		projectMissingFileNames,
		duplicateRestoreTargetCount,
	}
}

function getRestoreResourceIds(target: RestoreTarget, items: RecycleBinItemData[]): string[] {
	if (target.kind === "item") return [target.item.resourceId]
	return Array.from(
		new Set(items.filter((i) => target.itemIds.includes(i.id)).map((i) => i.resourceId)),
	)
}

function getMoveProjectIds(target: RestoreTarget, items: RecycleBinItemData[]): string[] {
	return getRestoreResourceIds(target, items)
}

/** 从 check 接口返回的 CheckItem[] 提取 resource_id 列表 */
function toResourceIds(list: Array<{ resource_id: string }>): string[] {
	return list.map((x) => String(x.resource_id))
}

/** 从需移动的 resource_id 列表解析出本地 item.id 列表（用于弹窗只操作需移动项） */
function resolveNeedMoveItemIds(
	needMoveResourceIds: string[],
	items: RecycleBinItemData[],
): string[] {
	if (needMoveResourceIds.length === 0) return []
	const set = new Set(needMoveResourceIds)
	return items.filter((i) => set.has(i.resourceId)).map((i) => i.id)
}

const RESOURCE_TYPE_TO_TAB: Record<ResourceType, string> = {
	[RESOURCE_TYPE.WORKSPACE]: "workspaces",
	[RESOURCE_TYPE.PROJECT]: "projects",
	[RESOURCE_TYPE.TOPIC]: "topics",
	[RESOURCE_TYPE.FILE]: "files",
}

const TAB_TO_RESOURCE_TYPE: Record<string, ResourceType> = {
	workspaces: RESOURCE_TYPE.WORKSPACE,
	projects: RESOURCE_TYPE.PROJECT,
	topics: RESOURCE_TYPE.TOPIC,
	files: RESOURCE_TYPE.FILE,
}

const TAB_KEY_TO_TYPE: Record<string, RecycleBinItemData["type"]> = {
	workspaces: "workspace",
	projects: "project",
	topics: "topic",
	files: "file",
}

function getRecycleBinItemTitle(props: {
	resourceName?: string
	resourceType?: ResourceType
	t: TFunction
}) {
	const { resourceName, resourceType, t } = props
	const trimmedName = resourceName?.trim() ?? ""
	if (trimmedName) return trimmedName
	if (resourceType === RESOURCE_TYPE.WORKSPACE) return t("common.unNamedWorkspace")
	if (resourceType === RESOURCE_TYPE.PROJECT) return t("common.untitledProject")
	if (resourceType === RESOURCE_TYPE.TOPIC) return t("common.untitledTopic")
	if (resourceType === RESOURCE_TYPE.FILE) return t("common.untitledFile")
	return trimmedName
}

function mapListItemToItemData(item: RecycleBin.ListItem, t: TFunction): RecycleBinItemData {
	const resourceType = item.resource_type as ResourceType
	const tabKey = RESOURCE_TYPE_TO_TAB[resourceType] ?? "files"
	const type =
		resourceType === RESOURCE_TYPE.FILE
			? item.extra_data?.is_directory
				? "folder"
				: "file"
			: (TAB_KEY_TO_TYPE[tabKey] ?? "file")
	const deletedBy =
		item.deleted_by_user?.nickname ?? item.deleted_by_name ?? item.deleted_by ?? ""
	const deletedByUser = item.deleted_by_user
		? {
				nickname: item.deleted_by_user.nickname,
				avatar: item.deleted_by_user.avatar || item.deleted_by_user.avatar_url || "",
			}
		: undefined
	return {
		id: item.id,
		type,
		title: getRecycleBinItemTitle({
			resourceName: item.resource_name,
			resourceType,
			t,
		}),
		deletedBy,
		deletedByUser,
		validDays: item.remaining_days ?? 0,
		resourceId: item.resource_id,
		resourceType,
		selected: false,
	}
}

interface RecycleBinContentProps {
	activeTab?: string
	searchValue?: string
	onTabCountChange?: (tabId: string, count: number) => void
}

function RecycleBinContent(props: RecycleBinContentProps) {
	const { activeTab = "all", searchValue = "", onTabCountChange } = props
	const { t } = useTranslation("super")

	const [items, setItems] = useState<RecycleBinItemData[]>([])
	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [hasError, setHasError] = useState(false)
	const [moreItemId, setMoreItemId] = useState<string | null>(null)
	const [moveProjectModalOpen, setMoveProjectModalOpen] = useState(false)
	const [moveProjectTarget, setMoveProjectTarget] = useState<RestoreTarget | null>(null)
	const [isMoveProjectLoading, setIsMoveProjectLoading] = useState(false)
	const [selectPathModalOpen, setSelectPathModalOpen] = useState(false)
	const [selectPathTarget, setSelectPathTarget] = useState<SelectPathTarget | null>(null)
	const [selectPathWorkspaceId, setSelectPathWorkspaceId] = useState("")
	const [selectPathProjectId, setSelectPathProjectId] = useState("")
	const [pendingRestoreAfterMove, setPendingRestoreAfterMove] = useState<{
		resourceIds: string[]
		resourceType: ResourceType
	} | null>(null)
	const [pendingNameConflictRestore, setPendingNameConflictRestore] =
		useState<PendingNameConflictRestore | null>(null)
	const [isResolvingNameConflict, setIsResolvingNameConflict] = useState(false)

	const trimmedSearchValue = searchValue.trim()
	const refreshTabCounts = useMemoizedFn(async () => {
		if (!onTabCountChange) return
		const data = await RecycleBinApi.getRecycleBinCounts({
			keyword: trimmedSearchValue || undefined,
		})
		const nextCounts = createRecycleBinTabCounts()
		data.forEach((item) => {
			const tabId = RECYCLE_BIN_RESOURCE_TYPE_TO_TAB_ID[item.resource_type]
			if (tabId) nextCounts[tabId] = item.count ?? 0
		})
		nextCounts.all = data.reduce((sum, item) => sum + (item.count ?? 0), 0)
		Object.entries(nextCounts).forEach(([tabId, count]) => {
			onTabCountChange(tabId, count)
		})
	})

	const queryParams = useMemo(
		() => ({
			...(activeTab !== "all" ? { resource_type: TAB_TO_RESOURCE_TYPE[activeTab] } : {}),
			keyword: trimmedSearchValue || undefined,
			order: "desc" as const,
			page: 1,
			page_size: 20,
		}),
		[activeTab, trimmedSearchValue],
	)

	const { run, loading } = useRequest(RecycleBinApi.getRecycleBinList, {
		manual: true,
		onBefore: () => setHasError(false),
		onSuccess: (data) => {
			const nextItems = data.list.map((item) => mapListItemToItemData(item, t))
			setItems(nextItems)
			setSelectedIds((prev) => prev.filter((id) => nextItems.some((item) => item.id === id)))
			refreshTabCounts().catch((error) => console.error(error))
		},
		onError: () => setHasError(true),
	})

	useEffect(() => {
		run(queryParams)
	}, [queryParams, run])

	useEffect(() => {
		refreshTabCounts().catch((error) => console.error(error))
	}, [refreshTabCounts, trimmedSearchValue])

	// 打开选择路径/移动项目弹窗时拉取工作区列表（与 PC 一致）
	useEffect(() => {
		if (!selectPathModalOpen && !moveProjectModalOpen) return
		SuperMagicService.workspace
			.fetchWorkspaces({
				page: 1,
				isAutoSelect: false,
				isSelectLast: false,
			})
			.catch((error) => console.error(error))
	}, [selectPathModalOpen, moveProjectModalOpen])

	useEffect(() => {
		if (selectPathTarget?.type !== "topic" || !selectPathWorkspaceId) return
		projectStore
			.loadProjectsForWorkspace(selectPathWorkspaceId)
			.catch((error) => console.error(error))
	}, [selectPathTarget?.type, selectPathWorkspaceId])

	const filteredItems = useMemo(() => {
		if (activeTab === "all") return items
		const targetType = TAB_TO_RESOURCE_TYPE[activeTab]
		if (!targetType) return items
		return items.filter((item) => item.resourceType === targetType)
	}, [items, activeTab])

	const selectedCount = selectedIds.length
	const hasItems = filteredItems.length > 0

	const handleSelectionChange = useCallback((id: string, selected: boolean) => {
		setSelectedIds((prev) =>
			selected ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id),
		)
	}, [])

	const handleSelectAll = useCallback(() => {
		setSelectedIds(filteredItems.map((item) => item.id))
	}, [filteredItems])

	const handleDeselectAll = useCallback(() => {
		setSelectedIds([])
	}, [])

	const handleMoreClick = useCallback((id: string) => {
		setMoreItemId(id)
	}, [])

	/** 恢复成功后的统一刷新：回收站列表 + 工作区列表（与 PC 端一致，保证弹窗/侧边栏工作区列表为最新） */
	const handleRestoreSuccess = useCallback(
		(count: number, showToast = true) => {
			if (count <= 0) return
			if (showToast) magicToast.success(t("recycleBin.restoreSuccess.content", { count }))
			run(queryParams)
			SuperMagicService.workspace
				.fetchWorkspaces({
					page: 1,
					isAutoSelect: false,
					isSelectLast: false,
				})
				.catch((error) => console.error(error))
		},
		[t, queryParams, run],
	)

	const runRestoreWithPayload = useCallback(
		async ({
			resourceType,
			resourceIds,
			conflictResolutions,
			skippedNameConflictCount = 0,
		}: {
			resourceType: ResourceType
			resourceIds: string[]
			conflictResolutions?: ConflictResolutions
			skippedNameConflictCount?: number
		}) => {
			if (resourceIds.length === 0) {
				if (skippedNameConflictCount > 0)
					magicToast.info(
						t("recycleBin.restoreCheck.nameConflictSkipped", {
							count: skippedNameConflictCount,
						}),
					)
				return
			}
			const hasConflictResolutions =
				conflictResolutions && Object.keys(conflictResolutions).length > 0
			const data = await RecycleBinApi.restoreRecycleBinResources({
				resource_ids: resourceIds,
				resource_type: resourceType,
				...(hasConflictResolutions ? { conflict_resolutions: conflictResolutions } : {}),
			})
			const successIds = data.results
				.filter((r) => r.success)
				.map((r) => items.find((i) => i.resourceId === r.resource_id)?.id)
				.filter(Boolean) as string[]
			setItems((prev) => prev.filter((item) => !successIds.includes(item.id)))
			setSelectedIds((prev) => prev.filter((id) => !successIds.includes(id)))
			if (data.success_count > 0)
				handleRestoreSuccess(data.success_count, data.failed_count === 0)
			if (data.failed_count > 0) {
				const message = getRestoreFailureMessage(data, t)
				if (data.success_count > 0) magicToast.warning(message)
				else magicToast.error(message)
			}
			if (skippedNameConflictCount > 0)
				magicToast.info(
					t("recycleBin.restoreCheck.nameConflictSkipped", {
						count: skippedNameConflictCount,
					}),
				)
		},
		[handleRestoreSuccess, items, t],
	)

	const getCurrentPendingNameConflict = useCallback(() => {
		if (!pendingNameConflictRestore) return null
		return pendingNameConflictRestore.items[pendingNameConflictRestore.currentIndex] ?? null
	}, [pendingNameConflictRestore])

	const advancePendingNameConflictQueue = useCallback(() => {
		setPendingNameConflictRestore((prev) => {
			if (!prev) return null
			const nextIndex = prev.currentIndex + 1
			if (nextIndex >= prev.items.length) return null
			return {
				...prev,
				currentIndex: nextIndex,
			}
		})
	}, [])

	const handlePendingNameConflictChoice = useCallback(
		async (strategy: "overwrite" | "skip") => {
			const currentConflict = getCurrentPendingNameConflict()
			if (!currentConflict || isResolvingNameConflict) return

			if (strategy === "skip") {
				advancePendingNameConflictQueue()
				return
			}
			if (!pendingNameConflictRestore) return

			setIsResolvingNameConflict(true)
			try {
				const { resourceType, conflictResolutions } = pendingNameConflictRestore
				await runRestoreWithPayload({
					resourceType,
					resourceIds: [currentConflict.resourceId],
					conflictResolutions: {
						...(conflictResolutions ?? {}),
						[currentConflict.resourceId]: {
							...(conflictResolutions?.[currentConflict.resourceId] ?? {}),
							name_conflict: "overwrite",
						},
					},
				})
				advancePendingNameConflictQueue()
			} finally {
				setIsResolvingNameConflict(false)
			}
		},
		[
			advancePendingNameConflictQueue,
			getCurrentPendingNameConflict,
			isResolvingNameConflict,
			pendingNameConflictRestore,
			runRestoreWithPayload,
		],
	)

	/** 选择路径确认后：恢复「无需移动」的项（与 PC 端一致） */
	const runPendingRestoreAfterMove = useCallback(async () => {
		const pending = pendingRestoreAfterMove
		setPendingRestoreAfterMove(null)
		if (!pending?.resourceIds.length) return
		try {
			const data = await RecycleBinApi.restoreRecycleBinResources({
				resource_ids: pending.resourceIds,
				resource_type: pending.resourceType,
			})
			const successIds = data.results
				.filter((r) => r.success)
				.map((r) => items.find((i) => i.resourceId === r.resource_id)?.id)
				.filter(Boolean) as string[]
			setItems((prev) => prev.filter((item) => !successIds.includes(item.id)))
			setSelectedIds((prev) => prev.filter((id) => !successIds.includes(id)))
			if (data.success_count > 0)
				handleRestoreSuccess(data.success_count, data.failed_count === 0)
			if (data.failed_count > 0) {
				const message = getRestoreFailureMessage(data, t)
				if (data.success_count > 0) magicToast.warning(message)
				else magicToast.error(message)
			}
		} catch {
			magicToast.error(t("operationFailed"))
		}
	}, [pendingRestoreAfterMove, items, handleRestoreSuccess, t])

	const handleRestore = useCallback(async () => {
		if (selectedIds.length === 0) return
		const selectedItems = items.filter((item) => selectedIds.includes(item.id))
		if (selectedItems.length === 0) return
		const resourceType = selectedItems[0].resourceType
		const hasMixed = selectedItems.some((item) => item.resourceType !== resourceType)
		if (hasMixed) {
			magicToast.error(t("recycleBin.restoreCheck.mixedTypes"))
			return
		}
		try {
			const check = await RecycleBinApi.checkRecycleBinParent({
				resource_ids: selectedItems.map((i) => i.resourceId),
				resource_type: resourceType,
			})
			const {
				needMoveResourceIds,
				noNeedMoveResourceIds,
				directResourceIds,
				conflictResolutions,
				pendingNameConflictItems,
				skippedNameConflictCount,
				projectMissingCount,
				projectMissingFileNames,
				duplicateRestoreTargetCount,
			} = parseCheckResult(check)
			if (projectMissingCount > 0) {
				const visibleFileNames = projectMissingFileNames
					.slice(0, MAX_CONFLICT_NAME_PREVIEW_COUNT)
					.map((name) => `「${name}」`)
					.join("、")
				const fileNames =
					projectMissingFileNames.length > MAX_CONFLICT_NAME_PREVIEW_COUNT
						? t("recycleBin.restoreCheck.fileNamesWithEtc", {
								names: visibleFileNames,
						  })
						: visibleFileNames
				magicToast.info(
					fileNames
						? t("recycleBin.restoreCheck.projectMissingTipWithNames", {
								count: projectMissingCount,
								fileNames,
						  })
						: t("recycleBin.restoreCheck.projectMissingTip", {
								count: projectMissingCount,
						  }),
				)
			}
			if (duplicateRestoreTargetCount > 0) {
				magicToast.info(
					t("recycleBin.restoreCheck.duplicateRestoreTargetTip", {
						count: duplicateRestoreTargetCount,
					}),
				)
			}

			if (resourceType === RESOURCE_TYPE.FILE) {
				if (directResourceIds.length === 0 && skippedNameConflictCount === 0) {
					magicToast.info(t("recycleBin.restoreCheck.noResourcesFound"))
					return
				}
				if (directResourceIds.length > 0) {
					await runRestoreWithPayload({
						resourceType,
						resourceIds: directResourceIds,
						conflictResolutions,
					})
				}
				if (pendingNameConflictItems.length > 0) {
					setPendingNameConflictRestore({
						resourceType,
						conflictResolutions,
						items: pendingNameConflictItems.map((item) => ({
							resourceId: item.resourceId,
							fileName: item.fileName || t("common.untitledFile"),
						})),
						currentIndex: 0,
					})
				}
				return
			}
			const needMoveItemIds = resolveNeedMoveItemIds(needMoveResourceIds, items)
			const hasNeedMove = needMoveItemIds.length > 0

			if (hasNeedMove) {
				if (
					noNeedMoveResourceIds.length > 0 &&
					(resourceType === RESOURCE_TYPE.WORKSPACE ||
						resourceType === RESOURCE_TYPE.PROJECT ||
						resourceType === RESOURCE_TYPE.TOPIC)
				) {
					setPendingRestoreAfterMove({
						resourceIds: noNeedMoveResourceIds,
						resourceType,
					})
				}
				const singleItem =
					needMoveItemIds.length === 1
						? items.find((i) => i.id === needMoveItemIds[0])
						: undefined
				const moveTarget: RestoreTarget =
					singleItem != null
						? { kind: "item", item: singleItem }
						: { kind: "selection", itemIds: needMoveItemIds }
				if (resourceType === RESOURCE_TYPE.PROJECT) {
					setMoveProjectTarget(moveTarget)
					setMoveProjectModalOpen(true)
					return
				}
				if (resourceType === RESOURCE_TYPE.TOPIC) {
					setSelectPathTarget({ type: "topic", target: moveTarget })
					setSelectPathWorkspaceId("")
					setSelectPathProjectId("")
					setSelectPathModalOpen(true)
					return
				}
				return
			}
			if (noNeedMoveResourceIds.length === 0) return
			await runRestoreWithPayload({
				resourceType: resourceType as ResourceType,
				resourceIds: noNeedMoveResourceIds,
			})
		} catch {
			magicToast.error(t("operationFailed"))
		}
	}, [selectedIds, items, runRestoreWithPayload, t])

	const handlePermanentDelete = useCallback(async () => {
		if (selectedIds.length === 0) return
		try {
			const data = await RecycleBinApi.permanentDeleteRecycleBin({ ids: selectedIds })
			const failedSet = new Set(data.failed.map((f) => String(f.id)))
			const successIds = selectedIds.filter((id) => !failedSet.has(id))
			setItems((prev) => prev.filter((item) => !successIds.includes(item.id)))
			setSelectedIds((prev) => prev.filter((id) => !successIds.includes(id)))
			if (successIds.length > 0) {
				magicToast.success(
					t("recycleBin.deleteSuccess.content", { count: successIds.length }),
				)
				run(queryParams)
			}
			if (data.failed.length > 0) magicToast.error(t("operationFailed"))
		} catch {
			magicToast.error(t("operationFailed"))
		}
	}, [selectedIds, queryParams, run, t])

	const handleRestoreSingle = useCallback(
		async (itemId: string) => {
			const selectedItems = items.filter((item) => item.id === itemId)
			if (selectedItems.length === 0) return
			const item = selectedItems[0]
			try {
				const check = await RecycleBinApi.checkRecycleBinParent({
					resource_ids: [item.resourceId],
					resource_type: item.resourceType,
				})
				const {
					needMoveResourceIds,
					noNeedMoveResourceIds,
					directResourceIds,
					conflictResolutions,
					pendingNameConflictItems,
					skippedNameConflictCount,
					projectMissingCount,
					projectMissingFileNames,
					duplicateRestoreTargetCount,
				} = parseCheckResult(check)
				if (projectMissingCount > 0) {
					const visibleFileNames = projectMissingFileNames
						.slice(0, MAX_CONFLICT_NAME_PREVIEW_COUNT)
						.map((name) => `「${name}」`)
						.join("、")
					const fileNames =
						projectMissingFileNames.length > MAX_CONFLICT_NAME_PREVIEW_COUNT
							? t("recycleBin.restoreCheck.fileNamesWithEtc", {
									names: visibleFileNames,
							  })
							: visibleFileNames
					magicToast.info(
						fileNames
							? t("recycleBin.restoreCheck.projectMissingTipWithNames", {
									count: projectMissingCount,
									fileNames,
							  })
							: t("recycleBin.restoreCheck.projectMissingTip", {
									count: projectMissingCount,
							  }),
					)
				}
				if (duplicateRestoreTargetCount > 0) {
					magicToast.info(
						t("recycleBin.restoreCheck.duplicateRestoreTargetTip", {
							count: duplicateRestoreTargetCount,
						}),
					)
				}

				if (item.resourceType === RESOURCE_TYPE.FILE) {
					if (directResourceIds.length === 0 && skippedNameConflictCount === 0) {
						magicToast.info(t("recycleBin.restoreCheck.noResourcesFound"))
						return
					}
					if (directResourceIds.length > 0) {
						await runRestoreWithPayload({
							resourceType: item.resourceType,
							resourceIds: directResourceIds,
							conflictResolutions,
						})
					}
					if (pendingNameConflictItems.length > 0) {
						setPendingNameConflictRestore({
							resourceType: item.resourceType,
							conflictResolutions,
							items: pendingNameConflictItems.map((conflictItem) => ({
								resourceId: conflictItem.resourceId,
								fileName: conflictItem.fileName || t("common.untitledFile"),
							})),
							currentIndex: 0,
						})
					}
					return
				}
				const needMove = needMoveResourceIds.includes(item.resourceId)
				if (needMove) {
					const restoreTarget: RestoreTarget = { kind: "item", item }
					if (item.resourceType === RESOURCE_TYPE.PROJECT) {
						setMoveProjectTarget(restoreTarget)
						setMoveProjectModalOpen(true)
						return
					}
					if (item.resourceType === RESOURCE_TYPE.TOPIC) {
						setSelectPathTarget({ type: "topic", target: restoreTarget })
						setSelectPathWorkspaceId("")
						setSelectPathProjectId("")
						setSelectPathModalOpen(true)
						return
					}
					return
				}
				if (noNeedMoveResourceIds.length === 0) return
				await runRestoreWithPayload({
					resourceType: item.resourceType as ResourceType,
					resourceIds: noNeedMoveResourceIds,
				})
			} catch {
				magicToast.error(t("operationFailed"))
			}
		},
		[items, runRestoreWithPayload, t],
	)

	const handlePermanentDeleteSingle = useCallback(
		async (itemId: string) => {
			try {
				const data = await RecycleBinApi.permanentDeleteRecycleBin({ ids: [itemId] })
				const failedSet = new Set(data.failed.map((f) => String(f.id)))
				if (!failedSet.has(itemId)) {
					setItems((prev) => prev.filter((item) => item.id !== itemId))
					setSelectedIds((prev) => prev.filter((id) => id !== itemId))
					magicToast.success(t("recycleBin.deleteSuccess.content", { count: 1 }))
					run(queryParams)
				} else magicToast.error(t("operationFailed"))
			} catch {
				magicToast.error(t("operationFailed"))
			}
		},
		[queryParams, run, t],
	)

	const removeItemsByProjectIds = useCallback(
		(projectIds: string[]) => {
			if (projectIds.length === 0) return
			setItems((prev) => prev.filter((item) => !projectIds.includes(item.resourceId)))
			setSelectedIds((prev) =>
				prev.filter((id) => {
					const item = items.find((i) => i.id === id)
					return !item || !projectIds.includes(item.resourceId)
				}),
			)
		},
		[items],
	)

	const removeItemsByResourceIds = useCallback(
		(resourceIds: string[]) => {
			if (resourceIds.length === 0) return
			setItems((prev) => prev.filter((item) => !resourceIds.includes(item.resourceId)))
			setSelectedIds((prev) =>
				prev.filter((id) => {
					const item = items.find((i) => i.id === id)
					return !item || !resourceIds.includes(item.resourceId)
				}),
			)
		},
		[items],
	)

	const handleMoveProject = useCallback(
		async (workspaceId: string) => {
			if (!moveProjectTarget) return
			const projectIds = getMoveProjectIds(moveProjectTarget, items)
			if (projectIds.length === 0) {
				setMoveProjectModalOpen(false)
				setMoveProjectTarget(null)
				return
			}
			try {
				setIsMoveProjectLoading(true)
				if (projectIds.length === 1) {
					const data = await RecycleBinApi.moveRecycleBinProject({
						source_project_id: projectIds[0],
						target_workspace_id: workspaceId,
					})
					if (!data?.success) {
						magicToast.error(t("operationFailed"))
						return
					}
					removeItemsByProjectIds(projectIds)
					handleRestoreSuccess(projectIds.length)
				} else {
					const data = await RecycleBinApi.batchMoveRecycleBinProject({
						project_ids: projectIds,
						target_workspace_id: workspaceId,
					})
					const successProjectIds = (data.results || [])
						.filter((r) => r.success)
						.map((r) => r.project_id)
					removeItemsByProjectIds(successProjectIds)
					handleRestoreSuccess(successProjectIds.length)
					if ((data.failed ?? 0) > 0) magicToast.error(t("operationFailed"))
				}
				await runPendingRestoreAfterMove()
				setMoveProjectModalOpen(false)
				setMoveProjectTarget(null)
			} catch {
				magicToast.error(t("operationFailed"))
			} finally {
				setIsMoveProjectLoading(false)
			}
		},
		[
			moveProjectTarget,
			items,
			t,
			removeItemsByProjectIds,
			handleRestoreSuccess,
			runPendingRestoreAfterMove,
		],
	)

	const handleMoveTopic = useCallback(
		async (targetProjectId: string) => {
			if (!selectPathTarget || selectPathTarget.type !== "topic") return
			const topicIds = getRestoreResourceIds(selectPathTarget.target, items)
			if (topicIds.length === 0) return
			try {
				if (topicIds.length === 1) {
					const data = await RecycleBinApi.moveRecycleBinTopic({
						source_topic_id: topicIds[0],
						target_project_id: targetProjectId,
					})
					if (!data?.success) {
						magicToast.error(t("operationFailed"))
						return
					}
					removeItemsByResourceIds([data.topic_id])
					handleRestoreSuccess(1)
				} else {
					const data = await RecycleBinApi.batchMoveRecycleBinTopic({
						topic_ids: topicIds,
						target_project_id: targetProjectId,
					})
					const successTopicIds = (data.results || [])
						.filter((r) => r.success)
						.map((r) => r.topic_id)
					removeItemsByResourceIds(successTopicIds)
					handleRestoreSuccess(successTopicIds.length)
					if ((data.failed ?? 0) > 0) magicToast.error(t("operationFailed"))
				}
				await runPendingRestoreAfterMove()
				setSelectPathModalOpen(false)
				setSelectPathTarget(null)
				setSelectPathWorkspaceId("")
				setSelectPathProjectId("")
			} catch {
				magicToast.error(t("operationFailed"))
			}
		},
		[
			selectPathTarget,
			items,
			t,
			removeItemsByResourceIds,
			handleRestoreSuccess,
			runPendingRestoreAfterMove,
		],
	)

	function handleSelectPathClose() {
		setSelectPathModalOpen(false)
		setSelectPathTarget(null)
		setSelectPathWorkspaceId("")
		setSelectPathProjectId("")
		setPendingRestoreAfterMove(null)
	}

	function handleSelectPathSubmit(data: SelectPathSubmitPayload) {
		if (selectPathTarget?.type === "topic") {
			handleMoveTopic(data.targetProjectId)
		}
		handleSelectPathClose()
	}

	const selectPathSelectedWorkspace: Workspace | undefined = selectPathWorkspaceId
		? workspaceStore.workspaces.find((w) => w.id === selectPathWorkspaceId)
		: undefined
	const selectPathSelectedProject: ProjectListItem | undefined =
		selectPathWorkspaceId && selectPathProjectId
			? projectStore
					.getProjectsByWorkspace(selectPathWorkspaceId)
					.find((p) => p.id === selectPathProjectId)
			: undefined
	const currentPendingNameConflict = getCurrentPendingNameConflict()
	const pendingNameConflictCount = pendingNameConflictRestore
		? pendingNameConflictRestore.items.length - pendingNameConflictRestore.currentIndex
		: 0

	// 加载中
	if (loading && items.length === 0) {
		return (
			<div
				className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-2 py-6"
				data-testid="mobile-recycle-bin-content"
			>
				<Spinner className="text-muted-foreground" />
				<span className="text-sm text-[#737373]">{t("common.loading")}</span>
			</div>
		)
	}

	// 加载失败
	if (hasError && items.length === 0) {
		return (
			<div
				className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-2 py-6"
				data-testid="mobile-recycle-bin-content"
			>
				<div className="text-sm text-[#737373]">{t("recycleBin.error.loadFailed")}</div>
				<Button variant="outline" size="sm" onClick={() => run(queryParams)}>
					{t("recycleBin.error.retry")}
				</Button>
			</div>
		)
	}

	// 空状态
	if (!hasItems) {
		return (
			<div
				className="flex min-h-0 flex-1 flex-col gap-2.5 px-2 pb-0 pt-2"
				data-testid="mobile-recycle-bin-content"
			>
				<div
					className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 rounded-[10px] bg-background p-6 text-center"
					data-testid="mobile-recycle-bin-empty"
				>
					<img
						className="empty-state-icon h-12 w-12"
						alt=""
						aria-hidden
						src={emptyStateIcon}
						data-testid="recycle-bin-content-image"
					/>
					<div className="flex w-full flex-col items-center gap-2">
						<div className="text-lg font-medium leading-7 text-foreground">
							{t("mobile.recycleBin.empty.title")}
						</div>
						<div className="text-sm font-normal leading-5 text-[#737373]">
							{t("mobile.recycleBin.empty.description")}
						</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div
			className="flex min-h-0 flex-1 flex-col bg-muted/60"
			data-testid="mobile-recycle-bin-content"
		>
			<div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-0 pt-2">
				<div className="flex min-h-0 flex-1 flex-col gap-2 rounded-[10px]">
					{filteredItems.map((item, index) => (
						<div key={item.id}>
							<RecycleBinItem
								item={{
									...item,
									selected: selectedIds.includes(item.id),
								}}
								onSelectionChange={handleSelectionChange}
								onMoreClick={handleMoreClick}
							/>
							{index < filteredItems.length - 1 && (
								<div className="px-2.5">
									<Separator className="bg-[#E5E5E5]" />
								</div>
							)}
						</div>
					))}

					<div
						className="flex items-center justify-center gap-1 py-4 opacity-30"
						data-testid="mobile-recycle-bin-loader"
					>
						<CheckLine className="size-4 text-foreground" />
						<span className="text-xs font-normal leading-4 text-foreground">
							{t("mobile.recycleBin.loader.noMoreData")}
						</span>
					</div>
				</div>
			</div>

			<BulkActions
				selectedCount={selectedCount}
				totalCount={filteredItems.length}
				onSelectAll={handleSelectAll}
				onDeselectAll={handleDeselectAll}
				onRestore={handleRestore}
				onPermanentDelete={handlePermanentDelete}
			/>

			<ActionSheet
				visible={moreItemId !== null}
				title={t("recycleBin.item.more")}
				actionGroups={[
					{
						actions: [
							{
								key: "restore",
								label: t("recycleBin.bulkActions.restore"),
								onClick: () => {
									if (moreItemId) {
										setMoreItemId(null)
										handleRestoreSingle(moreItemId)
									}
								},
							},
							{
								key: "permanentDelete",
								label: t("recycleBin.bulkActions.permanentDelete"),
								variant: "danger",
								onClick: () => {
									if (moreItemId) {
										setMoreItemId(null)
										handlePermanentDeleteSingle(moreItemId)
									}
								},
							},
						],
					},
				]}
				showCancel
				cancelText={t("common.cancel")}
				onClose={() => setMoreItemId(null)}
			/>

			<ActionSheet
				visible={currentPendingNameConflict !== null}
				title={
					currentPendingNameConflict
						? `${t("recycleBin.restoreCheck.nameConflictDialogTitle", {
								fileName: currentPendingNameConflict.fileName,
						  })}\n${t("topicFiles.duplicateFile.message", {
								fileName: currentPendingNameConflict.fileName,
						  })}`
						: ""
				}
				actionGroups={[
					{
						actions: [
							{
								key: "skipNameConflict",
								label: t("recycleBin.restoreCheck.skipNameConflict"),
								onClick: () => void handlePendingNameConflictChoice("skip"),
								disabled: isResolvingNameConflict,
							},
							{
								key: "replaceNameConflict",
								label: isResolvingNameConflict
									? t("recycleBin.restoreCheck.processingAllNameConflicts")
									: t("topicFiles.duplicateFile.replace"),
								onClick: () => void handlePendingNameConflictChoice("overwrite"),
								disabled: isResolvingNameConflict,
							},
						],
					},
				]}
				showCancel
				cancelText={
					pendingNameConflictCount > 1
						? t("recycleBin.restoreCheck.skipNameConflict")
						: t("common.cancel")
				}
				onClose={() => {
					if (isResolvingNameConflict) return
					setPendingNameConflictRestore(null)
					if (pendingNameConflictCount > 0) {
						magicToast.info(
							t("recycleBin.restoreCheck.nameConflictSkipped", {
								count: pendingNameConflictCount,
							}),
						)
					}
				}}
			/>

			<MoveProjectModal
				workspaces={workspaceStore.workspaces}
				selectedWorkspace={workspaceStore.selectedWorkspace ?? undefined}
				isMoveProjectLoading={isMoveProjectLoading}
				fetchWorkspaces={(params) => SuperMagicService.workspace.fetchWorkspaces(params)}
				open={moveProjectModalOpen}
				onClose={() => {
					setMoveProjectModalOpen(false)
					setMoveProjectTarget(null)
					setPendingRestoreAfterMove(null)
				}}
				onConfirm={handleMoveProject}
			/>

			{selectPathTarget && (
				<CrossProjectFileOperationModal
					visible={selectPathModalOpen}
					title={t("recycleBin.selectPath.title")}
					operationType="move"
					selectedWorkspace={selectPathSelectedWorkspace}
					selectedProject={selectPathSelectedProject}
					workspaces={workspaceStore.workspaces}
					fileIds={[]}
					sourceAttachments={[]}
					selectProjectOnly={selectPathTarget.type === "topic"}
					onClose={handleSelectPathClose}
					onSubmit={handleSelectPathSubmit}
				/>
			)}
		</div>
	)
}

export default memo(RecycleBinContent)
