import { useEffect, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import type { MagicFSFile } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import userFilesStore from "@/stores/userFiles"
import TopicFilesPanel from "../TopicFilesButton/TopicFilesPanel"
import TopicFilesCore from "../TopicFilesButton/TopicFilesCore"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import UserSpaceFileIcon, { UserSpaceFileTag } from "./UserSpaceFileIcon"
import { getUserResourceKind } from "./userSpaceFilePresentation"
import { toUserAttachment } from "./services/userSpaceFileService"
import { useUserSpaceFileActions } from "./hooks/useUserSpaceFileActions"
import { SidebarExpandableItem, type SidebarSectionOptions } from "../SidebarSection"

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
	section?: SidebarSectionOptions
	contentBefore?: ReactNode
	active?: boolean
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
	section,
	contentBefore,
	active = true,
	scrollElementRef,
}: UserSpaceFilesViewProps) {
	const { t } = useTranslation("super")
	const identity = userFilesStore.currentIdentityKey
	const mutationVersion = userFilesStore.mutationVersion
	const rootId = scopeRootId ?? userFilesStore.rootId ?? undefined
	const parentId = compact ? rootId : (directoryId ?? rootId)
	const state = userFilesStore.getDirectory(parentId)
	const rootState = userFilesStore.getDirectory()
	const path = parentId ? userFilesStore.getPath(parentId) : []
	const items = parentId ? userFilesStore.getTree(parentId) : []
	useEffect(() => {
		if (!active) return
		void userFilesStore
			.getRoot()
			.then((root) => {
				if (identity !== userFilesStore.currentIdentityKey) return
				return userFilesStore.loadTree(parentId ?? scopeRootId ?? root.id)
			})
			.catch(() => undefined)
	}, [identity, parentId, scopeRootId, active, mutationVersion])
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
		const root = await userFilesStore.getRoot()
		if (identity !== userFilesStore.currentIdentityKey) return
		await userFilesStore.loadTree(parentId ?? root.id, true)
	}
	const renderSection = (content: ReactNode) =>
		section ? (
			<SidebarExpandableItem
				wrapLabel
				label={rootName ?? t("userSpace.title")}
				{...section}
				testId="memory-manager-section"
			>
				{section.description}
				{content}
			</SidebarExpandableItem>
		) : compact ? (
			<>
				<h3 className="shrink-0 break-words px-3 py-2 text-sm font-semibold [overflow-wrap:anywhere]">
					{rootName ?? t("userSpace.allFiles")}
				</h3>
				{content}
			</>
		) : (
			content
		)
	if (state.error || rootState.error)
		return renderSection(
			<div role="alert" className="p-3 text-xs">
				{t("userSpace.loadFailed")}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => void refresh().catch(() => undefined)}
				>
					{t("userSpace.retry")}
				</Button>
			</div>,
		)
	if (!parentId || !spaceConfig.directorySource)
		return renderSection(
			<p className="p-3 text-xs text-muted-foreground">{t("userSpace.loading")}</p>,
		)
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
		resolveTopicFileRowDecoration: ({
			item,
			isVirtual,
		}: {
			item: AttachmentItem
			isVirtual: boolean
		}) =>
			isVirtual
				? undefined
				: {
						icon: <UserSpaceFileIcon item={item} size={16} resourceTree={items} />,
						tag:
							getUserResourceKind(item) || item.directoryLoadState === "error" ? (
								<>
									<UserSpaceFileTag item={item} />
									{item.directoryLoadState === "error" ? (
										<span className="text-xs text-destructive">
											{t("userSpace.retry")}
										</span>
									) : null}
								</>
							) : undefined,
					},
	}
	if (compact)
		return (
			<TopicFilesPanel
				headerLayout="adaptive"
				key={`${identity}:${parentId}`}
				{...commonProps}
				title={rootName ?? t("userSpace.allFiles")}
				loading={state.loading || !state.loaded}
				fitContent={Boolean(scopeRootId)}
				scrollElementRef={scrollElementRef}
				refreshAttachments={refresh}
				headerTrailingAction={headerTrailingAction}
				section={section}
				contentBefore={contentBefore}
			/>
		)
	const scopeDepth = scopeRootId ? userFilesStore.getPath(scopeRootId).length : 0
	const content = (
		<TopicFilesCore
			key={`${identity}:${parentId}`}
			{...commonProps}
			refreshLoading={state.loading}
			fitContent={Boolean(scopeRootId)}
			scrollElementRef={scrollElementRef}
			onUpdateAttachments={() => void refresh().catch(() => undefined)}
			directoryView={{
				renderFileTag: (item) => <UserSpaceFileTag item={item} />,
				renderFileIcon: (item, size) => (
					<UserSpaceFileIcon item={item} resourceTree={items} size={size} />
				),
				directory: operationRoot,
				items,
				rootName: rootName ?? t("userSpace.title"),
				path: path.slice(scopeDepth).map((node) => ({ id: node.id, name: node.name })),
				onNavigate: onDirectoryChange,
			}}
		/>
	)
	return renderSection(
		<>
			{contentBefore}
			{content}
		</>,
	)
})
