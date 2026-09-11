import { useEffect, useMemo } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import userFilesStore from "@/stores/userFiles"
import { FileDirectoryView } from "../TopicFilesButton/components/FileDirectoryView"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import { MemoryTreeNodeIcon } from "../LongTremMemory/components/MemoryTreeNodeIcon"
import { toUserAttachment } from "./services/userSpaceFileService"
import { useUserSpaceFileActions } from "./hooks/useUserSpaceFileActions"
import { UserFileActionDialogs } from "./UserFileActionDialogs"

export interface UserSpaceFilesViewProps {
	directoryId?: string
	onDirectoryChange: (id?: string) => void
	onFileClick?: (file: AttachmentItem) => void
	activeFileId?: string | null
	topicId?: string | null
	compact?: boolean
	search?: string
}

export default observer(function UserSpaceFilesView({
	directoryId,
	onDirectoryChange,
	onFileClick,
	activeFileId,
	topicId,
	compact = true,
	search,
}: UserSpaceFilesViewProps) {
	const { t } = useTranslation("super")
	const identity = userFilesStore.currentIdentityKey
	const rootId = userFilesStore.rootId
	const parentId = directoryId ?? rootId ?? undefined
	const state = userFilesStore.getDirectory(parentId)
	const path = parentId ? userFilesStore.getPath(parentId) : []
	const children = userFilesStore.getChildren(parentId)
	const pathPrefix = path.map((file) => file.name).join("/")
	const items = useMemo(
		() =>
			parentId
				? children.map((file) =>
						toUserAttachment(file, [pathPrefix, file.name].filter(Boolean).join("/")),
					)
				: [],
		[children, parentId, pathPrefix],
	)
	useEffect(() => {
		void userFilesStore
			.getRoot()
			.then((root) =>
				identity === userFilesStore.currentIdentityKey
					? userFilesStore.loadDirectory(directoryId ?? root.id)
					: undefined,
			)
			.catch(() => undefined)
	}, [identity, directoryId, rootId])
	const parent = async () => {
		const root = await userFilesStore.getRoot()
		const file = userFilesStore.files.get(directoryId ?? root.id)
		if (!file) throw new Error("Directory is unavailable")
		return file
	}
	const actions = useUserSpaceFileActions({
		items,
		resolveParent: parent,
		viewKey: directoryId ?? "root",
		onOpen: onFileClick,
		onNavigate: onDirectoryChange,
		topicId,
	})
	return (
		<>
			<FileDirectoryView
				itemIcon={(file, size) => (
					<MemoryTreeNodeIcon
						size={size}
						item={file}
						pathSegments={(
							file.file_reference?.space_relative_path ??
							file.relative_file_path ??
							""
						).split("/")}
					/>
				)}
				items={items}
				path={path.map((file) => ({ id: file.id, name: file.name }))}
				rootName={t("userSpace.title")}
				onDownload={actions.downloadSelected}
				onNavigate={onDirectoryChange}
				onOpen={actions.open}
				activeFileId={activeFileId}
				compact={compact}
				search={search}
				selectedIds={actions.selection}
				onSelectionChange={actions.setSelection}
				isSelectable={actions.isSelectable}
				createMenuItems={actions.createMenuItems}
				onUpload={() => actions.uploadFiles()}
				onMove={(files) => void actions.startMove(files)}
				onDelete={actions.remove}
				loading={state.loading || !parentId}
				error={Boolean(state.error)}
				onRetry={() => {
					void userFilesStore.loadDirectory(parentId, true).catch(() => undefined)
				}}
				getMenuItems={actions.getMenuItems}
			/>
			<UserFileActionDialogs actions={actions} />
		</>
	)
})
