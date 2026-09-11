import { useEffect, useMemo, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, FilePlus2 } from "lucide-react"
import type { MagicFSFile } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import magicToast from "@/components/base/MagicToaster/utils"
import userFilesStore from "@/stores/userFiles"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import { FileDirectoryView } from "../TopicFilesButton/components/FileDirectoryView"
import { getDirectoryFileMenu } from "../TopicFilesButton/utils/directory-menu"
import {
	getUserMemoryPath,
	USER_MEMORY_ROOT,
	USER_MEMORY_ENTRY,
	USER_MEMORY_NOTES,
} from "../LongTremMemory/components/memoryTreeNodeUtils"
import { MemoryTreeNodeIcon } from "../LongTremMemory/components/MemoryTreeNodeIcon"
import { toUserAttachment, userSpaceFileService } from "./services/userSpaceFileService"
import { useUserSpaceFileActions } from "./hooks/useUserSpaceFileActions"
import { useUserSpaceUpload } from "./hooks/useUserSpaceUpload"
import { UserFileActionDialogs } from "./UserFileActionDialogs"

interface MemoryGroupProps {
	projectId?: string | null
	projectName?: string
	onFileClick?: (file: AttachmentItem) => void
	onLocate: (id?: string) => void
	activeFileId?: string | null
	topicId?: string | null
	search?: string
	compact?: boolean
}

const MemoryGroup = observer(function MemoryGroup({
	projectId,
	projectName,
	onFileClick,
	onLocate,
	activeFileId,
	topicId,
	search,
	compact = true,
}: MemoryGroupProps) {
	const { t } = useTranslation("super")
	const identity = userFilesStore.currentIdentityKey
	const cacheVersion = userFilesStore.changeVersion
	const [root, setRoot] = useState<MagicFSFile | null>(null)
	const [directoryId, setDirectoryId] = useState<string>()
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [creating, setCreating] = useState(false)
	const [retry, setRetry] = useState(0)
	const segments = useMemo(() => getUserMemoryPath(projectId), [projectId])
	const scopePath = segments.join("/")
	const actions = useUserSpaceFileActions({ onOpen: onFileClick, topicId })
	const upload = useUserSpaceUpload()
	useEffect(() => {
		setRoot(null)
		setDirectoryId(undefined)
	}, [identity, scopePath])
	useEffect(() => {
		let cancelled = false
		setLoading(true)
		void userFilesStore
			.findPath(segments)
			.then(async (file) => {
				if (file) await userFilesStore.loadDirectory(directoryId ?? file.id)
				if (!cancelled) {
					setRoot(file)
					setError(false)
				}
			})
			.catch(() => {
				if (!cancelled) setError(true)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [identity, segments, directoryId, cacheVersion, retry])
	const parentId = directoryId ?? root?.id
	const parentPath = parentId ? userFilesStore.getPath(parentId) : []
	const visiblePath = parentPath.slice(segments.length)
	const prefix = parentPath.map((file) => file.name).join("/")
	const items = parentId
		? userFilesStore
				.getChildren(parentId)
				.map((file) => toUserAttachment(file, `${prefix}/${file.name}`))
		: []
	const entryExists =
		root &&
		userFilesStore
			.getChildren(root.id)
			.some((file) => file.name === USER_MEMORY_ENTRY && !file.is_directory)
	const destination = async () => {
		if (!directoryId) return userFilesStore.ensureDirectory([...segments, USER_MEMORY_NOTES])
		const file = userFilesStore.files.get(directoryId)
		if (!file) throw new Error("Directory is unavailable")
		return file
	}
	const createEntry = async () => {
		if (creating) return
		setCreating(true)
		try {
			const directory = await userFilesStore.ensureDirectory(segments)
			if (identity !== userFilesStore.currentIdentityKey) return
			const children = await userFilesStore.loadDirectory(directory.id, true)
			if (identity !== userFilesStore.currentIdentityKey) return
			let file = children.find(
				(item) => item.name === USER_MEMORY_ENTRY && !item.is_directory,
			)
			if (!file) {
				try {
					file = await userSpaceFileService.createNode({
						name: USER_MEMORY_ENTRY,
						parentId: directory.id,
						isDirectory: false,
					})
				} catch (error) {
					if (identity !== userFilesStore.currentIdentityKey) return
					file = (await userFilesStore.loadDirectory(directory.id, true)).find(
						(item) => item.name === USER_MEMORY_ENTRY && !item.is_directory,
					)
					if (!file) throw error
				}
			}
			if (identity !== userFilesStore.currentIdentityKey) return
			userFilesStore.notifyMutation()
			await userFilesStore.loadDirectory(directory.id, true)
			if (identity === userFilesStore.currentIdentityKey)
				actions.open(toUserAttachment(file, `${scopePath}/${USER_MEMORY_ENTRY}`))
		} catch {
			if (identity === userFilesStore.currentIdentityKey)
				magicToast.error(t("userSpace.operationFailed"))
		} finally {
			setCreating(false)
		}
	}
	const title = projectId ? t("userSpace.projectMemory") : t("userSpace.globalMemory")
	return (
		<section className="flex min-h-0 flex-1 flex-col border-b last:border-0">
			<div className="flex shrink-0 items-center justify-between gap-1 px-3 py-2">
				<div className="min-w-0">
					<h3 className="truncate text-xs font-semibold">{title}</h3>
					{projectId && (
						<p className="truncate text-xs text-muted-foreground">
							{projectName ?? t("userSpace.projectNameUnavailable")}
						</p>
					)}
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 shrink-0"
					aria-label={t("userSpace.locateAllFiles")}
					onClick={() => onLocate(parentId)}
				>
					<ArrowUpRight size={14} />
				</Button>
			</div>
			{!loading && !error && !entryExists && (
				<div className="flex shrink-0 items-center justify-between gap-1 px-3 pb-2 text-xs text-muted-foreground">
					<span>{t("userSpace.noMemory")}</span>
					<Button
						variant="ghost"
						size="sm"
						disabled={creating}
						onClick={() => void createEntry()}
					>
						<FilePlus2 size={14} />
						{t("userSpace.createMemory")}
					</Button>
				</div>
			)}
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
				path={visiblePath.map((file) => ({ id: file.id, name: file.name }))}
				rootName={title}
				footer={
					<div
						className="truncate py-1"
						title={t("userSpace.destination", {
							path:
								"~/" + (directoryId ? prefix : scopePath + "/" + USER_MEMORY_NOTES),
						})}
					>
						{t("userSpace.destination", {
							path:
								"~/" + (directoryId ? prefix : scopePath + "/" + USER_MEMORY_NOTES),
						})}
					</div>
				}
				onDownload={actions.downloadSelected}
				onNavigate={setDirectoryId}
				onOpen={actions.open}
				activeFileId={activeFileId}
				compact={compact}
				search={search}
				selectedIds={actions.selection}
				onSelectionChange={actions.setSelection}
				isSelectable={actions.isSelectable}
				onCreate={(directory) => actions.create(directory, destination)}
				onUpload={() => upload.upload(destination)}
				onMove={(files) => void actions.startMove(files)}
				onDelete={actions.remove}
				loading={loading}
				error={error}
				onRetry={() => {
					if (parentId)
						void userFilesStore.loadDirectory(parentId, true).catch(() => undefined)
					setRetry((value) => value + 1)
				}}
				itemLabel={(file) =>
					file.parent_id === root?.id &&
					file.file_name === USER_MEMORY_ENTRY &&
					!file.is_directory ? (
						<span className="flex flex-col truncate">
							<span>{t("userSpace.memoryContent")}</span>
							<span className="text-[10px] text-muted-foreground">
								{USER_MEMORY_ENTRY}
							</span>
						</span>
					) : file.parent_id === root?.id &&
					  file.is_directory &&
					  file.file_name === USER_MEMORY_NOTES ? (
						t("userSpace.relatedFiles")
					) : (
						file.file_name
					)
				}
				getMenuItems={(file) =>
					getDirectoryFileMenu(
						file,
						{
							open: (item) =>
								item.is_directory
									? setDirectoryId(item.file_id)
									: actions.open(item),
							addToChat: (item) => void actions.addToChat(item),
							download: (item) => void actions.download(item),
							info: actions.setInfo,
							...(actions.isSelectable(file)
								? {
										rename: actions.rename,
										move: (item: AttachmentItem) =>
											void actions.startMove([item]),
										remove: (item: AttachmentItem) => actions.remove([item]),
									}
								: {}),
						},
						t,
						actions.busy,
					)
				}
			/>
			<UserFileActionDialogs actions={actions} upload={upload} />
		</section>
	)
})

export default function UserSpaceMemoryView(props: MemoryGroupProps) {
	const { t } = useTranslation("super")
	const locateOtherProjects = async () => {
		const identity = userFilesStore.currentIdentityKey
		try {
			const directory = await userFilesStore.findPath([...USER_MEMORY_ROOT, "projects"])
			if (identity === userFilesStore.currentIdentityKey) props.onLocate(directory?.id)
		} catch {
			if (identity === userFilesStore.currentIdentityKey)
				magicToast.error(t("userSpace.loadFailed"))
		}
	}
	return (
		<div className="flex h-full min-h-0 flex-col">
			<MemoryGroup {...props} projectId={undefined} />
			{props.projectId ? (
				<MemoryGroup key={props.projectId} {...props} />
			) : (
				<div className="p-4 text-xs text-muted-foreground">
					{t("userSpace.enterProject")}
				</div>
			)}
			<Button
				variant="ghost"
				size="sm"
				className="shrink-0"
				onClick={() => void locateOtherProjects()}
			>
				{t("userSpace.otherProjectMemories")}
			</Button>
		</div>
	)
}
