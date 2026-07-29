import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type Dispatch,
	type SetStateAction,
} from "react"
import { useSingleHtmlStaticDependencies } from "@/pages/superMagic/hooks/useSingleHtmlStaticDependencies"
import {
	mergeHtmlStaticDependencyFileIds,
	type HtmlStaticDependencyAttachment,
} from "@/pages/superMagic/utils/htmlStaticDependencies"

interface UseFileShareHtmlDependenciesParams {
	selectedFileIds: string[]
	setSelectedFileIds: Dispatch<SetStateAction<string[]>>
	attachments: HtmlStaticDependencyAttachment[]
	shareProject: boolean
}

/**
 * Owns the distinction between a user's file choices and dependencies automatically selected for
 * one HTML file. Keeping this state outside FileShareModal makes the tree, checkbox, and submit
 * payload follow one source of truth.
 */
export function useFileShareHtmlDependencies({
	selectedFileIds,
	setSelectedFileIds,
	attachments,
	shareProject,
}: UseFileShareHtmlDependenciesParams) {
	const [includeHtmlDependencies, setIncludeHtmlDependencies] = useState(true)
	const [autoSelectedFileIds, setAutoSelectedFileIds] = useState<string[]>([])
	const [dependencyOwnerFileId, setDependencyOwnerFileId] = useState<string | null>(null)

	const autoSelectedFileIdSet = useMemo(() => new Set(autoSelectedFileIds), [autoSelectedFileIds])
	const manuallySelectedFileIds = useMemo(
		() => selectedFileIds.filter((fileId) => !autoSelectedFileIdSet.has(fileId)),
		[selectedFileIds, autoSelectedFileIdSet],
	)
	const selectedFileIdSet = useMemo(() => new Set(selectedFileIds), [selectedFileIds])
	const isDependencyOwnerSelected =
		dependencyOwnerFileId !== null && selectedFileIdSet.has(dependencyOwnerFileId)
	const needsAutoSelectionCleanup =
		autoSelectedFileIds.length > 0 &&
		(!includeHtmlDependencies || !isDependencyOwnerSelected || shareProject)
	const analysisFileId =
		!shareProject && !needsAutoSelectionCleanup
			? isDependencyOwnerSelected
				? dependencyOwnerFileId
				: manuallySelectedFileIds.length === 1
					? manuallySelectedFileIds[0]
					: ""
			: ""
	const staticDependencies = useSingleHtmlStaticDependencies({
		active: Boolean(analysisFileId),
		fileIds: analysisFileId ? [analysisFileId] : [],
		attachments,
	})
	const hasCurrentAnalysisResult = staticDependencies.fileId === analysisFileId
	const hasResolvedDependencies =
		hasCurrentAnalysisResult &&
		staticDependencies.isHtml &&
		staticDependencies.dependencyFileIds.length > 0
	const isPendingDependencyOwner = dependencyOwnerFileId === null && Boolean(analysisFileId)
	const shouldIncludeDependencies =
		(isDependencyOwnerSelected || isPendingDependencyOwner) &&
		includeHtmlDependencies &&
		(autoSelectedFileIds.length > 0 || hasResolvedDependencies)

	useEffect(() => {
		if (!includeHtmlDependencies || !hasResolvedDependencies || !analysisFileId) return

		const newlyAutoSelectedIds = staticDependencies.dependencyFileIds.filter(
			(fileId) => !selectedFileIds.includes(fileId) && !autoSelectedFileIdSet.has(fileId),
		)
		if (newlyAutoSelectedIds.length === 0) return

		setSelectedFileIds((previousFileIds) => [
			...new Set([...previousFileIds, ...newlyAutoSelectedIds]),
		])
		setAutoSelectedFileIds((previousFileIds) => [
			...new Set([...previousFileIds, ...newlyAutoSelectedIds]),
		])
		setDependencyOwnerFileId((previousFileId) => previousFileId ?? analysisFileId)
	}, [
		analysisFileId,
		autoSelectedFileIdSet,
		hasResolvedDependencies,
		includeHtmlDependencies,
		selectedFileIds,
		setSelectedFileIds,
		staticDependencies.dependencyFileIds,
	])

	useEffect(() => {
		if (!dependencyOwnerFileId || isDependencyOwnerSelected) return

		setDependencyOwnerFileId(null)
		setIncludeHtmlDependencies(true)
	}, [dependencyOwnerFileId, isDependencyOwnerSelected])

	useEffect(() => {
		if (!needsAutoSelectionCleanup) return

		const autoSelectedSet = new Set(autoSelectedFileIds)
		setSelectedFileIds((previousFileIds) =>
			previousFileIds.filter((fileId) => !autoSelectedSet.has(fileId)),
		)
		setAutoSelectedFileIds([])
	}, [autoSelectedFileIds, needsAutoSelectionCleanup, setSelectedFileIds])

	const handleFileIdsChange = useCallback(
		(fileIds: string[]) => {
			const nextSelectedFileIdSet = new Set(fileIds)
			const removedAutoDependency = autoSelectedFileIds.some(
				(fileId) => !nextSelectedFileIdSet.has(fileId),
			)

			// Only removing an automatically selected dependency opts out. Changes to unrelated files
			// must keep the existing HTML bundle intact.
			if (removedAutoDependency) setIncludeHtmlDependencies(false)
			if (dependencyOwnerFileId && !nextSelectedFileIdSet.has(dependencyOwnerFileId)) {
				setDependencyOwnerFileId(null)
				setIncludeHtmlDependencies(true)
			}
			setSelectedFileIds(fileIds)
		},
		[autoSelectedFileIds, dependencyOwnerFileId, setSelectedFileIds],
	)

	const selectedFileIdsForSubmission = shouldIncludeDependencies
		? selectedFileIds
		: selectedFileIds.filter((fileId) => !autoSelectedFileIdSet.has(fileId))
	const fileIdsForSubmission = useMemo(
		() =>
			mergeHtmlStaticDependencyFileIds(
				selectedFileIdsForSubmission,
				staticDependencies.dependencyFileIds,
				shouldIncludeDependencies,
			),
		[
			selectedFileIdsForSubmission,
			shouldIncludeDependencies,
			staticDependencies.dependencyFileIds,
		],
	)

	return {
		analysisError: analysisFileId && hasCurrentAnalysisResult ? staticDependencies.error : null,
		dependencyFileCount: staticDependencies.dependencyFileIds.length,
		fileIdsForSubmission,
		handleFileIdsChange,
		includeHtmlDependencies,
		isAnalyzing: Boolean(analysisFileId) && staticDependencies.isLoading,
		showDependencyOption: Boolean(analysisFileId) && hasResolvedDependencies,
		setIncludeHtmlDependencies,
	}
}
