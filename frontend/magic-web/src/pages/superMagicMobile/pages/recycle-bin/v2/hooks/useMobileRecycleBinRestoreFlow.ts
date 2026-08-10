import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { RecycleBinApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import { projectStore, workspaceStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import {
	buildRestoreCheckPlan,
	excludeRestoreResourceIds,
	extractSuccessResourceIds,
	getMoveProjectIds,
	getRestoreFailureMessage,
	getRestoreResourceIds,
	resolveNeedMove,
	resolvePendingRestore,
	shouldRestoreMicroAppWithoutMove,
	RESOURCE_TYPE,
	type DeleteTarget,
	type ResourceType,
	type RestoreTarget,
	type SelectPathTarget,
} from "@/pages/recycleBin/components/recycle-bin-domain"
import type { RecycleBinItemData } from "../components/RecycleBinItem"
import { mobileItemDataToDomain } from "./mobileRecycleBinMappers"
import { parseNonFileRestoreCheck } from "./mobileRecycleBinRestoreUtils"

function toResourceIds(list: Array<{ resource_id: string }>): string[] {
	return list.map((x) => String(x.resource_id))
}

type ConflictResolutions = Record<
	string,
	{
		parent_missing?: "restore_to_root"
		name_conflict?: "overwrite" | "skip"
	}
>

type ConflictType =
	"parent_missing" | "name_conflict" | "project_missing" | "duplicate_restore_target"
const MAX_CONFLICT_NAME_PREVIEW_COUNT = 5

function buildProjectMissingTip(params: {
	t: (key: string, options?: Record<string, unknown>) => string
	count: number
	fileNames: string[]
}) {
	const { t, count, fileNames } = params
	if (count <= 0) return ""
	const visibleFileNames = fileNames
		.slice(0, MAX_CONFLICT_NAME_PREVIEW_COUNT)
		.map((name) => `「${name}」`)
		.join("、")
	const resolvedFileNames =
		fileNames.length > MAX_CONFLICT_NAME_PREVIEW_COUNT
			? t("recycleBin.restoreCheck.fileNamesWithEtc", { names: visibleFileNames })
			: visibleFileNames
	if (resolvedFileNames) {
		return t("recycleBin.restoreCheck.projectMissingTipWithNames", {
			count,
			fileNames: resolvedFileNames,
		})
	}
	return t("recycleBin.restoreCheck.projectMissingTip", { count })
}

function buildFileRestoreConflictSummary(params: {
	t: (key: string, options?: Record<string, unknown>) => string
	parentMissingCount: number
	nameConflictNames: string[]
	projectMissingCount: number
	projectMissingFileNames: string[]
	duplicateRestoreTargetCount: number
}) {
	const {
		t,
		parentMissingCount,
		nameConflictNames,
		projectMissingCount,
		projectMissingFileNames,
		duplicateRestoreTargetCount,
	} = params

	const messages: string[] = []
	const skippedNameConflictCount = nameConflictNames.length
	const visibleConflictNames = nameConflictNames
		.slice(0, MAX_CONFLICT_NAME_PREVIEW_COUNT)
		.map((name) => `「${name}」`)
		.join("、")
	const conflictNames =
		nameConflictNames.length > MAX_CONFLICT_NAME_PREVIEW_COUNT
			? t("recycleBin.restoreCheck.conflictNamesWithEtc", { names: visibleConflictNames })
			: visibleConflictNames

	if (parentMissingCount > 0 && skippedNameConflictCount > 0) {
		messages.push(
			conflictNames
				? t("recycleBin.restoreCheck.fileConflictConfirmMessage", {
						parentMissingCount,
						nameConflictCount: skippedNameConflictCount,
						conflictNames,
					})
				: t("recycleBin.restoreCheck.fileConflictCountConfirmMessage", {
						parentMissingCount,
						nameConflictCount: skippedNameConflictCount,
					}),
		)
	} else if (skippedNameConflictCount > 0) {
		messages.push(
			conflictNames
				? t("recycleBin.restoreCheck.nameConflictConfirmMessage", {
						count: skippedNameConflictCount,
						conflictNames,
					})
				: t("recycleBin.restoreCheck.nameConflictCountConfirmMessage", {
						count: skippedNameConflictCount,
					}),
		)
	} else if (parentMissingCount > 0) {
		messages.push(
			t("recycleBin.restoreCheck.parentMissingConfirmMessage", { count: parentMissingCount }),
		)
	}

	if (projectMissingCount > 0) {
		messages.push(
			buildProjectMissingTip({
				t,
				count: projectMissingCount,
				fileNames: projectMissingFileNames,
			}),
		)
	}
	if (duplicateRestoreTargetCount > 0) {
		messages.push(
			t("recycleBin.restoreCheck.duplicateRestoreTargetTip", {
				count: duplicateRestoreTargetCount,
			}),
		)
	}
	return messages.filter(Boolean).join("\n")
}

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

type RestoreDirectResult = {
	ok: boolean
	successCount: number
	failedCount: number
}

function parseFileRestoreCheck(data: {
	items_need_move?: Array<{ resource_id: string }>
	items_no_need_move?: Array<{ resource_id: string }>
	items_with_conflict?: Array<{
		resource_id: string
		resource_name?: string
		conflict?: { type?: string }
	}>
	items_no_conflict?: Array<{ resource_id: string }>
}) {
	const oldNeedMove = Array.isArray(data?.items_need_move) ? data.items_need_move : []
	const oldNoNeedMove = Array.isArray(data?.items_no_need_move) ? data.items_no_need_move : []
	const withConflict = Array.isArray(data?.items_with_conflict) ? data.items_with_conflict : []
	const noConflict = Array.isArray(data?.items_no_conflict) ? data.items_no_conflict : []
	const conflictResolutions: ConflictResolutions = {}
	const skippedResourceIds: string[] = []
	const skippedNameConflictItems: PendingNameConflictItem[] = []
	const skippedNameConflictNames: string[] = []
	let projectMissingCount = 0
	const projectMissingFileNames: string[] = []
	let duplicateRestoreTargetCount = 0

	withConflict.forEach((item) => {
		const resourceId = String(item.resource_id)
		const conflictType = item.conflict?.type as ConflictType | undefined
		if (conflictType === "parent_missing") {
			conflictResolutions[resourceId] = { parent_missing: "restore_to_root" }
		}
		if (conflictType === "name_conflict") {
			skippedResourceIds.push(resourceId)
			const conflictFileName = item.resource_name?.trim()
			if (conflictFileName) skippedNameConflictNames.push(conflictFileName)
			skippedNameConflictItems.push({
				resourceId,
				fileName: conflictFileName || "",
			})
		}
		if (conflictType === "project_missing") {
			projectMissingCount += 1
			const resourceName = item.resource_name?.trim()
			if (resourceName) projectMissingFileNames.push(resourceName)
		}
		if (conflictType === "duplicate_restore_target") duplicateRestoreTargetCount += 1
	})

	const skippedSet = new Set(skippedResourceIds)
	oldNeedMove.forEach((item) => {
		const resourceId = String(item.resource_id)
		if (!skippedSet.has(resourceId)) {
			conflictResolutions[resourceId] = { parent_missing: "restore_to_root" }
		}
	})

	const noConflictResourceIds =
		oldNoNeedMove.length > 0 ? toResourceIds(oldNoNeedMove) : toResourceIds(noConflict)
	const resourceIds = excludeRestoreResourceIds(
		[...noConflictResourceIds, ...Object.keys(conflictResolutions)],
		skippedResourceIds,
	)

	return {
		directResourceIds: resourceIds,
		conflictResolutions,
		skippedNameConflictItems,
		skippedNameConflictNames,
		projectMissingCount,
		projectMissingFileNames,
		duplicateRestoreTargetCount,
	}
}

function isMovableResourceType(resourceType: ResourceType): boolean {
	return (
		resourceType === RESOURCE_TYPE.WORKSPACE ||
		resourceType === RESOURCE_TYPE.PROJECT ||
		resourceType === RESOURCE_TYPE.TOPIC
	)
}

function canUseMobileRestorePicker(resourceType: ResourceType, needMoveItemIds: string[]): boolean {
	if (needMoveItemIds.length !== 1) return false
	return resourceType === RESOURCE_TYPE.PROJECT || resourceType === RESOURCE_TYPE.TOPIC
}

export function useMobileRecycleBinRestoreFlow(props: {
	items: RecycleBinItemData[]
	setItems: React.Dispatch<React.SetStateAction<RecycleBinItemData[]>>
	selectedIds: string[]
	setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>
	queryParams: { keyword?: string; order: "desc" | "asc"; page: number; page_size: number }
	run: (params: typeof props.queryParams) => void
}) {
	const { items, setItems, selectedIds, setSelectedIds, queryParams, run } = props
	const { t } = useTranslation("super")

	const domainItems = useMemo(() => items.map(mobileItemDataToDomain), [items])

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

	const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false)
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

	const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
	const [restoreConfirmCount, setRestoreConfirmCount] = useState(0)
	const [restoreConfirmStatusMessage, setRestoreConfirmStatusMessage] = useState("")
	const restoreConfirmContextRef = useRef<{
		resourceType: ResourceType
		resourceIds: string[]
		conflictResolutions?: ConflictResolutions
		pendingNameConflictItems?: PendingNameConflictItem[]
	} | null>(null)
	const [pendingNameConflictRestore, setPendingNameConflictRestore] =
		useState<PendingNameConflictRestore | null>(null)
	const [isResolvingAllNameConflicts, setIsResolvingAllNameConflicts] = useState(false)

	const [restorePickerOpen, setRestorePickerOpen] = useState(false)
	const [restorePickerTarget, setRestorePickerTarget] = useState<RestoreTarget | null>(null)
	const [restorePickerResourceType, setRestorePickerResourceType] = useState<ResourceType>(
		RESOURCE_TYPE.PROJECT,
	)
	const [restorePickerWorkspaceId, setRestorePickerWorkspaceId] = useState("")

	const [orphanMixedOpen, setOrphanMixedOpen] = useState(false)
	const [orphanMixedNeedMoveIds, setOrphanMixedNeedMoveIds] = useState<string[]>([])
	const [orphanMixedRestorableCount, setOrphanMixedRestorableCount] = useState(0)
	const orphanMixedContextRef = useRef<{
		resourceType: ResourceType
		needMoveItemIds: string[]
		noNeedMoveResourceIds: string[]
	} | null>(null)

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

	const runPendingRestoreAfterMove = useCallback(async () => {
		const pending = pendingRestoreAfterMove
		setPendingRestoreAfterMove(null)
		if (!pending?.resourceIds.length) return
		try {
			const data = await RecycleBinApi.restoreRecycleBinResources({
				resource_ids: pending.resourceIds,
				resource_type: pending.resourceType,
			})
			const successIds = extractSuccessResourceIds(data.results)
				.map((rid) => items.find((i) => i.resourceId === rid)?.id)
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
	}, [pendingRestoreAfterMove, items, handleRestoreSuccess, t, setItems, setSelectedIds])

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
		[items, setItems, setSelectedIds],
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
		[items, setItems, setSelectedIds],
	)

	const buildMoveTarget = useCallback(
		(needMoveItemIds: string[], itemsSnapshot: RecycleBinItemData[]): RestoreTarget => {
			const singleItem =
				needMoveItemIds.length === 1
					? itemsSnapshot.find((i) => i.id === needMoveItemIds[0])
					: undefined
			if (singleItem != null) {
				return { kind: "item", item: mobileItemDataToDomain(singleItem) }
			}
			return { kind: "selection", itemIds: needMoveItemIds }
		},
		[],
	)

	const openRestorePicker = useCallback(
		(
			resourceType: ResourceType,
			moveTarget: RestoreTarget,
			noNeedMoveResourceIds: string[],
		) => {
			if (noNeedMoveResourceIds.length > 0 && isMovableResourceType(resourceType)) {
				setPendingRestoreAfterMove(
					resolvePendingRestore(resourceType, noNeedMoveResourceIds),
				)
			}
			setRestorePickerTarget(moveTarget)
			setRestorePickerResourceType(resourceType)
			setRestorePickerWorkspaceId("")
			setRestorePickerOpen(true)
		},
		[],
	)

	const openMoveAfterCheck = useCallback(
		(
			resourceType: ResourceType,
			needMoveItemIds: string[],
			noNeedMoveResourceIds: string[],
			itemsSnapshot: RecycleBinItemData[],
		) => {
			const moveTarget = buildMoveTarget(needMoveItemIds, itemsSnapshot)

			if (canUseMobileRestorePicker(resourceType, needMoveItemIds)) {
				openRestorePicker(resourceType, moveTarget, noNeedMoveResourceIds)
				return
			}

			if (noNeedMoveResourceIds.length > 0 && isMovableResourceType(resourceType)) {
				setPendingRestoreAfterMove(
					resolvePendingRestore(resourceType, noNeedMoveResourceIds),
				)
			}

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
			}
		},
		[buildMoveTarget, openRestorePicker],
	)

	const runRestoreDirect = useCallback(
		async (
			resourceType: ResourceType,
			resourceIds: string[],
			conflictResolutions?: ConflictResolutions,
			skippedNameConflictCount = 0,
		): Promise<RestoreDirectResult> => {
			if (resourceIds.length === 0) {
				return { ok: true, successCount: 0, failedCount: 0 }
			}
			try {
				const hasConflictResolutions =
					conflictResolutions && Object.keys(conflictResolutions).length > 0
				const data = await RecycleBinApi.restoreRecycleBinResources({
					resource_ids: resourceIds,
					resource_type: resourceType,
					...(hasConflictResolutions
						? { conflict_resolutions: conflictResolutions }
						: {}),
				})
				const successIds = extractSuccessResourceIds(data.results)
					.map((rid) => items.find((i) => i.resourceId === rid)?.id)
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
				if (skippedNameConflictCount > 0) {
					magicToast.info(
						t("recycleBin.restoreCheck.nameConflictSkipped", {
							count: skippedNameConflictCount,
						}),
					)
				}
				return {
					ok: true,
					successCount: data.success_count,
					failedCount: data.failed_count,
				}
			} catch {
				magicToast.error(t("operationFailed"))
				return {
					ok: false,
					successCount: 0,
					failedCount: resourceIds.length,
				}
			}
		},
		[items, handleRestoreSuccess, t, setItems, setSelectedIds],
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

	const resolveAllNameConflicts = useCallback(
		async (strategy: "overwrite" | "skip") => {
			if (!pendingNameConflictRestore || isResolvingAllNameConflicts) return
			const remainingItems = pendingNameConflictRestore.items.slice(
				pendingNameConflictRestore.currentIndex,
			)
			if (remainingItems.length === 0) return

			if (strategy === "skip") {
				setPendingNameConflictRestore(null)
				magicToast.info(
					t("recycleBin.restoreCheck.nameConflictSkipped", {
						count: remainingItems.length,
					}),
				)
				return
			}

			setIsResolvingAllNameConflicts(true)
			try {
				const { resourceType, conflictResolutions } = pendingNameConflictRestore
				const overwriteConflictResolutions = Object.fromEntries(
					remainingItems.map((item) => [
						item.resourceId,
						{
							...(conflictResolutions?.[item.resourceId] ?? {}),
							name_conflict: "overwrite" as const,
						},
					]),
				)
				await runRestoreDirect(
					resourceType,
					remainingItems.map((item) => item.resourceId),
					{
						...(conflictResolutions ?? {}),
						...overwriteConflictResolutions,
					},
				)
			} finally {
				setPendingNameConflictRestore(null)
				setIsResolvingAllNameConflicts(false)
			}
		},
		[pendingNameConflictRestore, isResolvingAllNameConflicts, runRestoreDirect, t],
	)

	const handleNameConflictChoice = useCallback(
		async (strategy: "overwrite" | "skip", applyToRemaining: boolean) => {
			if (applyToRemaining) {
				await resolveAllNameConflicts(strategy)
				return
			}

			const currentConflict = getCurrentPendingNameConflict()
			if (!currentConflict || !pendingNameConflictRestore) return

			if (strategy === "skip") {
				advancePendingNameConflictQueue()
				return
			}

			const { resourceType, conflictResolutions } = pendingNameConflictRestore
			const result = await runRestoreDirect(resourceType, [currentConflict.resourceId], {
				...(conflictResolutions ?? {}),
				[currentConflict.resourceId]: {
					...(conflictResolutions?.[currentConflict.resourceId] ?? {}),
					name_conflict: "overwrite",
				},
			})
			if (result.ok) advancePendingNameConflictQueue()
		},
		[
			resolveAllNameConflicts,
			getCurrentPendingNameConflict,
			pendingNameConflictRestore,
			runRestoreDirect,
			advancePendingNameConflictQueue,
		],
	)

	const applyCheckResult = useCallback(
		async (
			target: RestoreTarget,
			resourceType: ResourceType,
			needMoveItemIds: string[],
			noNeedMoveResourceIds: string[],
		) => {
			const hasNeedMove = needMoveItemIds.length > 0
			if (shouldRestoreMicroAppWithoutMove(resourceType, needMoveItemIds)) {
				const resourceIds = getRestoreResourceIds({ target, items: domainItems })
				restoreConfirmContextRef.current = { resourceType, resourceIds }
				setRestoreConfirmStatusMessage("")
				setRestoreConfirmCount(resourceIds.length)
				setRestoreConfirmOpen(true)
				return
			}

			if (
				hasNeedMove &&
				noNeedMoveResourceIds.length > 0 &&
				isMovableResourceType(resourceType)
			) {
				orphanMixedContextRef.current = {
					resourceType,
					needMoveItemIds,
					noNeedMoveResourceIds,
				}
				setOrphanMixedNeedMoveIds(needMoveItemIds)
				setOrphanMixedRestorableCount(noNeedMoveResourceIds.length)
				setOrphanMixedOpen(true)
				return
			}

			if (hasNeedMove) {
				openMoveAfterCheck(resourceType, needMoveItemIds, noNeedMoveResourceIds, items)
				return
			}

			if (noNeedMoveResourceIds.length === 0) return

			restoreConfirmContextRef.current = {
				resourceType,
				resourceIds: noNeedMoveResourceIds,
			}
			setRestoreConfirmStatusMessage("")
			setRestoreConfirmCount(noNeedMoveResourceIds.length)
			setRestoreConfirmOpen(true)
		},
		[domainItems, items, openMoveAfterCheck],
	)

	const runCheckAndBranch = useCallback(
		async (target: RestoreTarget) => {
			const plan = buildRestoreCheckPlan({ target, items: domainItems })
			if (plan.status === "invalid") {
				magicToast.error(t(plan.messageKey))
				return
			}

			try {
				const check = await RecycleBinApi.checkRecycleBinParent(plan.payload)
				const resourceType = plan.payload.resource_type
				if (resourceType === RESOURCE_TYPE.FILE) {
					const {
						directResourceIds,
						conflictResolutions,
						skippedNameConflictItems,
						skippedNameConflictNames,
						projectMissingCount,
						projectMissingFileNames,
						duplicateRestoreTargetCount,
					} = parseFileRestoreCheck(check)
					const restoreCheckSummary = buildFileRestoreConflictSummary({
						t,
						parentMissingCount: Object.keys(conflictResolutions).length,
						nameConflictNames: skippedNameConflictNames,
						projectMissingCount,
						projectMissingFileNames,
						duplicateRestoreTargetCount,
					})
					restoreConfirmContextRef.current = {
						resourceType,
						resourceIds: directResourceIds,
						conflictResolutions,
						pendingNameConflictItems: skippedNameConflictItems,
					}
					setRestoreConfirmStatusMessage(restoreCheckSummary)
					setRestoreConfirmCount(
						directResourceIds.length > 0
							? directResourceIds.length
							: skippedNameConflictItems.length,
					)
					setRestoreConfirmOpen(true)
					return
				}
				const { needMoveResourceIds, noNeedMoveResourceIds } =
					parseNonFileRestoreCheck(check)
				const { needMoveItemIds } = resolveNeedMove(needMoveResourceIds, domainItems)

				await applyCheckResult(target, resourceType, needMoveItemIds, noNeedMoveResourceIds)
			} catch {
				magicToast.error(t("operationFailed"))
			}
		},
		[domainItems, applyCheckResult, runRestoreDirect, t],
	)

	const requestRestoreSelection = useCallback(async () => {
		if (selectedIds.length === 0) return
		const selectedItems = domainItems.filter((item) => selectedIds.includes(item.id))
		if (selectedItems.length === 0) return
		const resourceType = selectedItems[0].resourceType
		const hasMixedTypes = selectedItems.some((item) => item.resourceType !== resourceType)
		if (hasMixedTypes) {
			magicToast.error(t("recycleBin.restoreCheck.mixedTypes"))
			return
		}
		const target: RestoreTarget = { kind: "selection", itemIds: selectedIds }
		await runCheckAndBranch(target)
	}, [domainItems, selectedIds, runCheckAndBranch, t])

	const requestRestoreSingle = useCallback(
		async (itemId: string) => {
			const row = domainItems.find((i) => i.id === itemId)
			if (!row) return
			const target: RestoreTarget = { kind: "item", item: row }
			await runCheckAndBranch(target)
		},
		[domainItems, runCheckAndBranch],
	)

	const confirmRestore = useCallback(async () => {
		const ctx = restoreConfirmContextRef.current
		setRestoreConfirmOpen(false)
		setRestoreConfirmCount(0)
		setRestoreConfirmStatusMessage("")
		restoreConfirmContextRef.current = null
		if (!ctx) return
		if (ctx.resourceIds.length > 0) {
			await runRestoreDirect(ctx.resourceType, ctx.resourceIds, ctx.conflictResolutions)
		}
		if (ctx.pendingNameConflictItems?.length) {
			setPendingNameConflictRestore({
				resourceType: ctx.resourceType,
				conflictResolutions: ctx.conflictResolutions,
				items: ctx.pendingNameConflictItems.map((item) => ({
					resourceId: item.resourceId,
					fileName: item.fileName || t("common.untitledFile"),
				})),
				currentIndex: 0,
			})
		}
	}, [runRestoreDirect, t])

	const handleOrphanRestoreDirectOnly = useCallback(async () => {
		const ctx = orphanMixedContextRef.current
		setOrphanMixedOpen(false)
		setOrphanMixedNeedMoveIds([])
		setOrphanMixedRestorableCount(0)
		orphanMixedContextRef.current = null
		if (!ctx) return
		const { resourceType, noNeedMoveResourceIds } = ctx
		await runRestoreDirect(resourceType, noNeedMoveResourceIds)
	}, [runRestoreDirect])

	const requestPermanentDelete = useCallback(() => {
		if (selectedIds.length === 0) return
		if (selectedIds.length === 1) {
			const only = domainItems.find((i) => i.id === selectedIds[0])
			if (only) setDeleteTarget({ kind: "item", item: only })
		} else {
			setDeleteTarget({ kind: "selection", itemIds: selectedIds })
		}
		setPurgeConfirmOpen(true)
	}, [selectedIds, domainItems])

	const requestPermanentDeleteSingle = useCallback(
		(itemId: string) => {
			const row = domainItems.find((i) => i.id === itemId)
			if (!row) return
			setDeleteTarget({ kind: "item", item: row })
			setPurgeConfirmOpen(true)
		},
		[domainItems],
	)

	const confirmPermanentDelete = useCallback(async () => {
		setPurgeConfirmOpen(false)
		if (!deleteTarget) return
		const ids = deleteTarget.kind === "item" ? [deleteTarget.item.id] : deleteTarget.itemIds
		if (ids.length === 0) {
			setDeleteTarget(null)
			return
		}
		try {
			const data = await RecycleBinApi.permanentDeleteRecycleBin({ ids })
			const failedSet = new Set(data.failed.map((f) => String(f.id)))
			const successIds = ids.filter((id) => !failedSet.has(id))
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
		} finally {
			setDeleteTarget(null)
		}
	}, [deleteTarget, queryParams, run, t, setItems, setSelectedIds])

	const handleMoveProject = useCallback(
		async (workspaceId: string) => {
			const target = moveProjectTarget ?? restorePickerTarget
			if (!target) return
			const projectIds = getMoveProjectIds({ target, items: domainItems })
			if (projectIds.length === 0) {
				setMoveProjectModalOpen(false)
				setMoveProjectTarget(null)
				setRestorePickerOpen(false)
				setRestorePickerTarget(null)
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
				setRestorePickerOpen(false)
				setRestorePickerTarget(null)
			} catch {
				magicToast.error(t("operationFailed"))
			} finally {
				setIsMoveProjectLoading(false)
			}
		},
		[
			moveProjectTarget,
			restorePickerTarget,
			domainItems,
			t,
			removeItemsByProjectIds,
			handleRestoreSuccess,
			runPendingRestoreAfterMove,
		],
	)

	const handleMoveTopic = useCallback(
		async (targetProjectId: string) => {
			const restoreTarget: RestoreTarget | null =
				selectPathTarget?.type === "topic" ? selectPathTarget.target : restorePickerTarget
			if (!restoreTarget) return
			const topicIds = getRestoreResourceIds({ target: restoreTarget, items: domainItems })
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
				setRestorePickerOpen(false)
				setRestorePickerTarget(null)
			} catch {
				magicToast.error(t("operationFailed"))
			}
		},
		[
			selectPathTarget,
			restorePickerTarget,
			domainItems,
			t,
			removeItemsByResourceIds,
			handleRestoreSuccess,
			runPendingRestoreAfterMove,
		],
	)

	const handleRestorePickerClose = useCallback(() => {
		setRestorePickerOpen(false)
		setRestorePickerTarget(null)
		setRestorePickerWorkspaceId("")
		setPendingRestoreAfterMove(null)
	}, [])

	const handleRestorePickerWorkspaceSelect = useCallback((workspaceId: string) => {
		setRestorePickerWorkspaceId(workspaceId)
		projectStore.loadProjectsForWorkspace(workspaceId).catch((error) => console.error(error))
	}, [])

	const handleRestorePickerConfirm = useCallback(
		async (payload: { workspaceId: string; projectId?: string }) => {
			if (!restorePickerTarget) return
			if (restorePickerResourceType === RESOURCE_TYPE.PROJECT) {
				await handleMoveProject(payload.workspaceId)
				return
			}
			if (restorePickerResourceType === RESOURCE_TYPE.TOPIC && payload.projectId) {
				setSelectPathTarget({ type: "topic", target: restorePickerTarget })
				await handleMoveTopic(payload.projectId)
			}
		},
		[restorePickerTarget, restorePickerResourceType, handleMoveProject, handleMoveTopic],
	)

	function handleSelectPathClose() {
		setSelectPathModalOpen(false)
		setSelectPathTarget(null)
		setSelectPathWorkspaceId("")
		setSelectPathProjectId("")
		setPendingRestoreAfterMove(null)
	}

	async function handleSelectPathSubmit(payload: { targetProjectId: string }) {
		if (selectPathTarget?.type === "topic") {
			await handleMoveTopic(payload.targetProjectId)
		}
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

	const restorePickerProjects = restorePickerWorkspaceId
		? projectStore.getProjectsByWorkspace(restorePickerWorkspaceId)
		: []

	const restorePickerItemTitle = useMemo(() => {
		if (!restorePickerTarget) return ""
		if (restorePickerTarget.kind === "item") return restorePickerTarget.item.title
		const firstId = restorePickerTarget.itemIds[0]
		const row = items.find((i) => i.id === firstId)
		return row?.title ?? ""
	}, [restorePickerTarget, items])

	/** Prototype: sheet title is always「还原」, count only in body. */
	const restoreConfirmTitle = useMemo(() => {
		if (!restoreConfirmOpen) return ""
		return t("mobile.recycleBin.restoreConfirm.title")
	}, [restoreConfirmOpen, t])

	const restoreConfirmMessage = useMemo(() => {
		if (!restoreConfirmOpen) return ""
		if (restoreConfirmStatusMessage) return restoreConfirmStatusMessage
		if (restoreConfirmCount <= 0) return ""
		return t("mobile.recycleBin.restoreConfirm.message", { count: restoreConfirmCount })
	}, [restoreConfirmOpen, restoreConfirmCount, restoreConfirmStatusMessage, t])

	const orphanMixedItems = useMemo(() => {
		if (orphanMixedNeedMoveIds.length === 0) return []
		const idSet = new Set(orphanMixedNeedMoveIds)
		return items.filter((i) => idSet.has(i.id))
	}, [orphanMixedNeedMoveIds, items])

	const purgeConfirmCount = useMemo(() => {
		if (!deleteTarget) return 0
		return deleteTarget.kind === "item" ? 1 : deleteTarget.itemIds.length
	}, [deleteTarget])

	/** Prototype: fixed title「彻底删除」+ count in body only. */
	const purgeConfirmTitle = useMemo(() => {
		if (!purgeConfirmOpen) return ""
		return t("mobile.recycleBin.purge.title")
	}, [purgeConfirmOpen, t])

	const purgeConfirmMessage = useMemo(() => {
		if (!purgeConfirmOpen || purgeConfirmCount <= 0) return ""
		return t("mobile.recycleBin.purge.message", { count: purgeConfirmCount })
	}, [purgeConfirmOpen, purgeConfirmCount, t])

	const closeOrphanMixed = useCallback(() => {
		orphanMixedContextRef.current = null
		setOrphanMixedNeedMoveIds([])
		setOrphanMixedRestorableCount(0)
		setOrphanMixedOpen(false)
	}, [])

	const closePurgeConfirm = useCallback(() => {
		setPurgeConfirmOpen(false)
		setDeleteTarget(null)
	}, [])

	const closeRestoreConfirm = useCallback(() => {
		setRestoreConfirmOpen(false)
		setRestoreConfirmCount(0)
		setRestoreConfirmStatusMessage("")
		restoreConfirmContextRef.current = null
	}, [])

	const closeNameConflictResolve = useCallback(() => {
		if (isResolvingAllNameConflicts) return
		setPendingNameConflictRestore(null)
	}, [isResolvingAllNameConflicts])

	const currentPendingNameConflict = getCurrentPendingNameConflict()
	const pendingNameConflictCount = pendingNameConflictRestore
		? pendingNameConflictRestore.items.length - pendingNameConflictRestore.currentIndex
		: 0

	return {
		moveProjectModalOpen,
		moveProjectTarget,
		isMoveProjectLoading,
		selectPathModalOpen,
		selectPathTarget,
		selectPathWorkspaceId,
		setSelectPathWorkspaceId,
		selectPathProjectId,
		setSelectPathProjectId,
		selectPathSelectedWorkspace,
		selectPathSelectedProject,
		restorePickerOpen,
		restorePickerWorkspaceId: restorePickerWorkspaceId,
		restorePickerItemTitle,
		restorePickerResourceType,
		restorePickerProjects,
		handleRestorePickerClose,
		handleRestorePickerWorkspaceSelect,
		handleRestorePickerConfirm,
		purgeConfirmOpen,
		deleteTarget,
		restoreConfirmOpen,
		restoreConfirmTitle,
		restoreConfirmMessage,
		pendingNameConflictResolveOpen: currentPendingNameConflict != null,
		pendingNameConflictFileName: currentPendingNameConflict?.fileName ?? "",
		pendingNameConflictCount,
		isResolvingAllNameConflicts,
		orphanMixedOpen,
		orphanMixedItems,
		orphanMixedRestorableCount,
		requestRestoreSelection,
		requestRestoreSingle,
		confirmRestore,
		requestPermanentDelete,
		requestPermanentDeleteSingle,
		confirmPermanentDelete,
		handleMoveProject,
		handleMoveProjectClose: () => {
			setMoveProjectModalOpen(false)
			setMoveProjectTarget(null)
			setPendingRestoreAfterMove(null)
		},
		handleSelectPathClose,
		handleSelectPathSubmit,
		purgeConfirmTitle,
		purgeConfirmMessage,
		handleOrphanRestoreDirectOnly,
		closeOrphanMixed,
		closePurgeConfirm,
		closeRestoreConfirm,
		closeNameConflictResolve,
		handleNameConflictSkip: (applyToRemaining: boolean) =>
			handleNameConflictChoice("skip", applyToRemaining),
		handleNameConflictReplace: (applyToRemaining: boolean) =>
			handleNameConflictChoice("overwrite", applyToRemaining),
	}
}
