import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type Dispatch,
	type SetStateAction,
} from "react"
import { useSingleDocumentStaticDependencies } from "@/pages/superMagic/hooks/useSingleDocumentStaticDependencies"
import {
	mergeStaticDependencyFileIds,
	type StaticDependencyAttachment,
} from "@/pages/superMagic/utils/staticDependencies"

interface UseFileShareDocumentDependenciesParams {
	selectedFileIds: string[]
	setSelectedFileIds: Dispatch<SetStateAction<string[]>>
	attachments: StaticDependencyAttachment[]
	shareProject: boolean
}

/**
 * Keeps user-selected files separate from dependencies selected automatically for one document.
 * The file tree, dependency option, and final share payload all consume this single state owner.
 */
export function useFileShareDocumentDependencies({
	selectedFileIds,
	setSelectedFileIds,
	attachments,
	shareProject,
}: UseFileShareDocumentDependenciesParams) {
	const [includeDocumentDependencies, setIncludeDocumentDependencies] = useState(true)
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
		(!includeDocumentDependencies || !isDependencyOwnerSelected || shareProject)
	const analysisFileId =
		!shareProject && !needsAutoSelectionCleanup
			? isDependencyOwnerSelected
				? dependencyOwnerFileId
				: manuallySelectedFileIds.length === 1
					? manuallySelectedFileIds[0]
					: ""
			: ""
	const staticDependencies = useSingleDocumentStaticDependencies({
		active: Boolean(analysisFileId),
		fileIds: analysisFileId ? [analysisFileId] : [],
		attachments,
	})
	const hasCurrentAnalysisResult = staticDependencies.fileId === analysisFileId
	const hasResolvedDependencies =
		hasCurrentAnalysisResult &&
		staticDependencies.fileType !== null &&
		staticDependencies.dependencyFileIds.length > 0
	const isPendingDependencyOwner = dependencyOwnerFileId === null && Boolean(analysisFileId)
	const shouldIncludeDependencies =
		(isDependencyOwnerSelected || isPendingDependencyOwner) &&
		includeDocumentDependencies &&
		(autoSelectedFileIds.length > 0 || hasResolvedDependencies)

	useEffect(() => {
		if (!includeDocumentDependencies || !hasResolvedDependencies || !analysisFileId) return

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
		includeDocumentDependencies,
		selectedFileIds,
		setSelectedFileIds,
		staticDependencies.dependencyFileIds,
	])

	useEffect(() => {
		if (!dependencyOwnerFileId || isDependencyOwnerSelected) return

		setDependencyOwnerFileId(null)
		setIncludeDocumentDependencies(true)
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

			// Removing an automatically selected dependency opts out. Unrelated tree changes keep
			// the current document bundle intact.
			if (removedAutoDependency) setIncludeDocumentDependencies(false)
			if (dependencyOwnerFileId && !nextSelectedFileIdSet.has(dependencyOwnerFileId)) {
				setDependencyOwnerFileId(null)
				setIncludeDocumentDependencies(true)
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
			mergeStaticDependencyFileIds(
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
		dependencyFileType: staticDependencies.fileType,
		fileIdsForSubmission,
		handleFileIdsChange,
		includeDocumentDependencies,
		isAnalyzing: Boolean(analysisFileId) && staticDependencies.isLoading,
		showDependencyOption: Boolean(analysisFileId) && hasResolvedDependencies,
		setIncludeDocumentDependencies,
	}
}
