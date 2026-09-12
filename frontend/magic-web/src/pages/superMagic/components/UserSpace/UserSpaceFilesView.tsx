import { useEffect, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import type { MagicFSFile } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import userFilesStore from "@/stores/userFiles"
import TopicFilesPanel from "../TopicFilesButton/TopicFilesPanel"
import TopicFilesCore from "../TopicFilesButton/TopicFilesCore"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import { MemoryTreeNodeIcon } from "../LongTremMemory/components/MemoryTreeNodeIcon"
import { toUserAttachment } from "./services/userSpaceFileService"
import { useUserSpaceFileActions } from "./hooks/useUserSpaceFileActions"

export interface UserSpaceFilesViewProps {
	directoryId?: string
	onDirectoryChange: (id?: string) => void
	onFileClick?: (file: AttachmentItem) => void
	activeFileId?: string | null
	topicId?: string | null
	compact?: boolean
	rootId?: string
	rootName?: string
	resolveParent?: () => Promise<MagicFSFile>
	headerTrailingAction?: ReactNode
	scrollElementRef?: React.RefObject<HTMLElement>
}

export default observer(function UserSpaceFilesView({
	directoryId,
	onDirectoryChange,
	onFileClick,
	activeFileId,
	topicId,
	compact = true,
	rootId: scopeRootId,
	rootName,
	resolveParent,
	headerTrailingAction,
	scrollElementRef,
}: UserSpaceFilesViewProps) {
	const { t } = useTranslation("super")
	const identity = userFilesStore.currentIdentityKey
	const rootId = scopeRootId ?? userFilesStore.rootId ?? undefined
	const parentId = compact ? rootId : (directoryId ?? rootId)
	const state = userFilesStore.getDirectory(parentId)
	const rootState = userFilesStore.getDirectory()
	const path = parentId ? userFilesStore.getPath(parentId) : []
	const items = parentId ? userFilesStore.getTree(parentId) : []
	useEffect(() => {
		void userFilesStore
			.getRoot()
			.then((root) => {
				if (identity !== userFilesStore.currentIdentityKey) return
				return userFilesStore.loadDirectory(parentId ?? scopeRootId ?? root.id)
			})
			.catch(() => undefined)
	}, [identity, parentId, scopeRootId])
	const parent = async () => {
		if (resolveParent && (!directoryId || directoryId === scopeRootId)) return resolveParent()
		const root = await userFilesStore.getRoot()
		const file = userFilesStore.files.get(parentId ?? root.id)
		if (!file?.is_directory) throw new Error("Directory is unavailable")
		return file
	}
	const { spaceConfig, isSelectable, filterMenuItems } = useUserSpaceFileActions({
		rootId: parentId,
		resolveParent: parent,
		viewKey: parentId ?? "root",
		locateFileId: compact ? directoryId : undefined,
		topicId,
	})
	const refresh = async () => {
		await userFilesStore.loadDirectory(parentId, true)
	}
	if (state.error || rootState.error)
		return (
			<div role="alert" className="p-3 text-xs">
				{t("userSpace.loadFailed")}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => void refresh().catch(() => undefined)}
				>
					{t("userSpace.retry")}
				</Button>
			</div>
		)
	if (!parentId || !spaceConfig.directorySource)
		return <p className="p-3 text-xs text-muted-foreground">{t("userSpace.loading")}</p>
	const file = userFilesStore.files.get(parentId)
	const operationRoot = file
		? toUserAttachment(file, path.map((node) => node.name).join("/"))
		: undefined
	const commonProps = {
		attachments: items,
		onFileClick,
		activeFileId,
		spaceConfig,
		operationRoot,
		isItemSelectable: isSelectable,
		filterMenuItems,
		filterBatchDownloadLayerMenuItems: filterMenuItems,
		resolveTopicFileRowDecoration: ({ item }: { item: AttachmentItem }) => ({
			icon: (
				<MemoryTreeNodeIcon
					item={item}
					size={16}
					pathSegments={(item.relative_file_path ?? "").split("/")}
				/>
			),
			tag:
				item.directoryLoadState === "error" ? (
					<span className="text-xs text-destructive">{t("userSpace.retry")}</span>
				) : undefined,
		}),
	}
	if (compact)
		return (
			<TopicFilesPanel
				key={`${identity}:${parentId}`}
				{...commonProps}
				title={rootName ?? t("userSpace.allFiles")}
				loading={state.loading || !state.loaded}
				fitContent={Boolean(scopeRootId)}
				scrollElementRef={scrollElementRef}
				refreshAttachments={refresh}
				headerTrailingAction={headerTrailingAction}
			/>
		)
	const scopeDepth = scopeRootId ? userFilesStore.getPath(scopeRootId).length : 0
	return (
		<TopicFilesCore
			key={`${identity}:${parentId}`}
			{...commonProps}
			refreshLoading={state.loading}
			fitContent={Boolean(scopeRootId)}
			scrollElementRef={scrollElementRef}
			onUpdateAttachments={() => void refresh().catch(() => undefined)}
			directoryView={{
				directory: operationRoot,
				items,
				rootName: rootName ?? t("userSpace.title"),
				path: path.slice(scopeDepth).map((node) => ({ id: node.id, name: node.name })),
				onNavigate: onDirectoryChange,
			}}
		/>
	)
})
