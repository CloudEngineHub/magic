import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Brain, Folder, Folders, FolderOpen, FilePlus2, RefreshCw } from "lucide-react"
import { SidebarExpandableItem, type SidebarSectionOptions } from "../SidebarSection"
import MagicTooltip from "@/components/base/MagicTooltip"
import type { MagicFSFile } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import magicToast from "@/components/base/MagicToaster/utils"
import userFilesStore from "@/stores/userFiles"
import { cn } from "@/utils/cn"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import {
	getUserMemoryPath,
	USER_MEMORY_ENTRY,
	USER_MEMORY_NOTES,
} from "../LongTremMemory/components/memoryTreeNodeUtils"
import { toUserAttachment, userSpaceFileService } from "./services/userSpaceFileService"
import { useUserMemoryProjects } from "./hooks/useUserMemoryProjects"
import { useFileManagerConfirmation } from "../TopicFilesButton/hooks/useFileManagerConfirmation"
import { FileManagerConfirmationDialog } from "../TopicFilesButton/components/FileManager/FileManagerConfirmationDialog"
import { buildAttachmentIndex } from "../TopicFilesButton/utils/attachmentIndex"
import UserSpaceFilesView from "./UserSpaceFilesView"

interface MemoryGroupProps {
	manager?: boolean
	active?: boolean
	projectId?: string | null
	projectName?: string
	onFileClick?: (file: AttachmentItem) => void
	title?: string
	defaultExpanded?: boolean
	activeFileId?: string | null
	topicId?: string | null
	compact?: boolean
	onBrowseDirectory?: (id: string) => void
	scrollElementRef?: React.RefObject<HTMLElement>
}
const emptyIndex = buildAttachmentIndex([])

export const MemoryGroup = observer(function MemoryGroup({
	manager = false,
	active = true,
	projectId,
	projectName,
	onFileClick,
	title: titleOverride,
	labelVariant = "section",
	defaultExpanded = true,
	activeFileId,
	topicId,
	compact = true,
	onBrowseDirectory,
	scrollElementRef,
}: MemoryGroupProps & { labelVariant?: "section" | "item" }) {
	const { t } = useTranslation("super")
	const [expanded, setExpanded] = useState(defaultExpanded)
	const [visited, setVisited] = useState(defaultExpanded)
	const identity = userFilesStore.currentIdentityKey
	const mutationVersion = userFilesStore.mutationVersion
	const [rootSnapshot, setRootSnapshot] = useState<{
		identity: string | null
		file: MagicFSFile | null
	}>()
	const root = rootSnapshot?.identity === identity ? rootSnapshot.file : null
	const setRoot = useCallback(
		(file: MagicFSFile | null) => setRootSnapshot({ identity, file }),
		[identity],
	)
	const [directoryId, setDirectoryId] = useState<string>()
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [creating, setCreating] = useState(false)
	const [retry, setRetry] = useState(0)
	const segments = useMemo(() => getUserMemoryPath(projectId), [projectId])
	const scopePath = segments.join("/")
	const confirmation = useFileManagerConfirmation({
		scopeKey: `${identity}:${scopePath}`,
		isActive: manager && active,
		rootName:
			projectName || t(projectId ? "userSpace.projectMemory" : "userSpace.globalMemory"),
		index: emptyIndex,
		attachments: [],
	})
	useEffect(() => {
		setRoot(null)
		setDirectoryId(undefined)
		setLoading(true)
	}, [identity, scopePath, setRoot])
	useEffect(() => {
		if (!visited || !active) return
		let cancelled = false
		void userFilesStore
			.findPath(segments)
			.then(async (file) => {
				if (file) await userFilesStore.loadTree(file.id)
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
	}, [identity, segments, mutationVersion, retry, visited, active, setRoot])
	const entryExists =
		root &&
		userFilesStore
			.getChildren(root.id)
			.some((file) => file.name === USER_MEMORY_ENTRY && !file.is_directory)
	const destination = () => userFilesStore.ensureDirectory([...segments, USER_MEMORY_NOTES])
	const createEntry = async () => {
		if (creating || confirmation.state) return
		setCreating(true)
		try {
			if (
				manager &&
				!(await confirmation.confirm({
					operation: "create",
					names: [USER_MEMORY_ENTRY],
					targetPath: scopePath,
				}))
			)
				return
			if (identity !== userFilesStore.currentIdentityKey) return
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
				onFileClick?.(toUserAttachment(file, `${scopePath}/${USER_MEMORY_ENTRY}`))
		} catch {
			if (identity === userFilesStore.currentIdentityKey)
				magicToast.error(t("userSpace.operationFailed"))
		} finally {
			setCreating(false)
		}
	}
	const title =
		titleOverride ?? (projectId ? t("userSpace.projectMemory") : t("userSpace.globalMemory"))
	const section: SidebarSectionOptions = {
		labelVariant,
		wrapLabel: true,
		isExpanded: expanded,
		onClick: () => {
			setExpanded(!expanded)
			setVisited(true)
		},
		leading: projectId ? <Folder size={16} /> : <Brain size={16} />,
		description:
			projectId && projectName && !titleOverride ? (
				<p className="break-words px-4 pb-2 text-xs font-normal text-muted-foreground [overflow-wrap:anywhere]">
					{projectName}
				</p>
			) : undefined,
	}
	const browseAction =
		root && onBrowseDirectory ? (
			<MagicTooltip title={t("fileManager.browseFolder")}>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					aria-label={t("fileManager.browseFolder")}
					onClick={() => onBrowseDirectory(root.id)}
				>
					<FolderOpen size={16} />
				</Button>
			</MagicTooltip>
		) : undefined
	const emptyState = !entryExists && (
		<div className="flex shrink-0 items-center justify-between px-4 py-2 text-xs text-muted-foreground">
			<span>{t("userSpace.noMemory")}</span>
			<Button
				variant="ghost"
				size="sm"
				disabled={creating}
				onClick={() => void createEntry()}
			>
				<FilePlus2 size={16} />
				{t("userSpace.createMemory")}
			</Button>
		</div>
	)
	if (manager)
		return (
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				{root && !error ? (
					<UserSpaceFilesView
						rootId={root.id}
						rootName={projectName || title}
						resolveParent={destination}
						defaultWritePath={`${scopePath}/${USER_MEMORY_NOTES}`}
						hidePlaces
						defaultView="list"
						directoryId={directoryId}
						onDirectoryChange={setDirectoryId}
						onFileClick={onFileClick}
						activeFileId={activeFileId}
						topicId={topicId}
						compact={false}
						active={active}
						contentBefore={emptyState}
					/>
				) : (
					<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
						<Brain size={32} className="text-muted-foreground/50" />
						<p className="text-sm font-medium">{projectName || title}</p>
						{loading ? (
							<p className="text-xs text-muted-foreground">
								{t("userSpace.loading")}
							</p>
						) : error ? (
							<Button
								variant="outline"
								onClick={() => setRetry((value) => value + 1)}
							>
								{t("userSpace.retry")}
							</Button>
						) : (
							emptyState
						)}
					</div>
				)}
				<FileManagerConfirmationDialog controller={confirmation} />
			</div>
		)

	return (
		<section
			className={cn(
				"flex min-h-0 shrink-0 flex-col",
				labelVariant === "item" ? "pl-2" : "border-b last:border-0",
			)}
		>
			{root && !error ? (
				<UserSpaceFilesView
					rootId={root.id}
					rootName={title}
					resolveParent={destination}
					directoryId={directoryId}
					onDirectoryChange={setDirectoryId}
					onFileClick={onFileClick}
					activeFileId={activeFileId}
					topicId={topicId}
					compact={compact}
					scrollElementRef={scrollElementRef}
					section={section}
					headerTrailingAction={browseAction}
					contentBefore={emptyState}
				/>
			) : (
				<SidebarExpandableItem label={title} {...section} testId="memory-empty-section">
					{section.description}
					{loading ? (
						<p className="p-3 text-xs text-muted-foreground">
							{t("userSpace.loading")}
						</p>
					) : error ? (
						<Button variant="ghost" onClick={() => setRetry((value) => value + 1)}>
							{t("userSpace.retry")}
						</Button>
					) : (
						emptyState
					)}
				</SidebarExpandableItem>
			)}
		</section>
	)
})
const OtherProjectMemories = observer(function OtherProjectMemories(props: MemoryGroupProps) {
	const { t } = useTranslation("super")
	const [expanded, setExpanded] = useState(false)
	const [visited, setVisited] = useState(false)
	const { projects, loading, error, loaded, refresh } = useUserMemoryProjects(
		props.projectId,
		visited,
	)
	return (
		<SidebarExpandableItem
			label={t("userSpace.otherProjectMemories")}
			labelVariant="section"
			wrapLabel
			isExpanded={expanded}
			onClick={() => {
				setExpanded(!expanded)
				setVisited(true)
			}}
			leading={<Folders size={16} />}
			testId="other-project-memories"
			trailing={
				loaded && (
					<MagicTooltip title={t("topicFiles.refreshList")}>
						<Button
							variant="ghost"
							size="icon"
							className="size-6 shrink-0"
							disabled={loading}
							aria-label={t("topicFiles.refreshList")}
							onClick={() => refresh()}
						>
							<RefreshCw size={16} />
						</Button>
					</MagicTooltip>
				)
			}
		>
			{error ? (
				<div role="alert" className="p-3 text-xs">
					{t("userSpace.projectNamesLoadFailed")}
					<Button variant="ghost" size="sm" onClick={() => refresh()}>
						{t("userSpace.retry")}
					</Button>
				</div>
			) : (
				<>
					{loading && (
						<p className="p-3 text-xs text-muted-foreground">
							{t("userSpace.loading")}
						</p>
					)}
					{loaded &&
						(projects.length ? (
							projects.map(({ id, fileId }) => (
								<MemoryGroup
									key={fileId}
									{...props}
									projectId={id}
									projectName={undefined}
									title={
										userFilesStore.projectNames.get(id) ??
										t("userSpace.projectNameUnavailable")
									}
									defaultExpanded={false}
									labelVariant="item"
								/>
							))
						) : (
							<p className="p-3 text-xs text-muted-foreground">
								{t("userSpace.noOtherProjectMemories")}
							</p>
						))}
				</>
			)}
		</SidebarExpandableItem>
	)
})

export default observer(function UserSpaceMemoryView(props: MemoryGroupProps) {
	const scrollElementRef = useRef<HTMLDivElement>(null)
	const { t } = useTranslation("super")
	const identity = userFilesStore.currentIdentityKey
	return (
		<div ref={scrollElementRef} className="h-full min-h-0 overflow-auto">
			<div key={identity} className="flex flex-col">
				<MemoryGroup {...props} scrollElementRef={scrollElementRef} projectId={undefined} />
				{props.projectId ? (
					<MemoryGroup
						key={props.projectId}
						{...props}
						scrollElementRef={scrollElementRef}
					/>
				) : (
					<div className="p-4 text-xs text-muted-foreground">
						{t("userSpace.enterProject")}
					</div>
				)}
				<OtherProjectMemories {...props} scrollElementRef={scrollElementRef} />
			</div>
		</div>
	)
})
