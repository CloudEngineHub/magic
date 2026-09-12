import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Brain, Folder, Folders, FilePlus2, RefreshCw } from "lucide-react"
import { SidebarExpandableItem, type SidebarSectionOptions } from "../SidebarSection"
import MagicTooltip from "@/components/base/MagicTooltip"
import type { MagicFSFile } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import magicToast from "@/components/base/MagicToaster/utils"
import userFilesStore from "@/stores/userFiles"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import {
	getUserMemoryPath,
	USER_PROJECT_MEMORIES_PATH,
	getMemoryProjectId,
	USER_MEMORY_ENTRY,
	USER_MEMORY_NOTES,
} from "../LongTremMemory/components/memoryTreeNodeUtils"
import { toUserAttachment, userSpaceFileService } from "./services/userSpaceFileService"
import UserSpaceFilesView from "./UserSpaceFilesView"

interface MemoryGroupProps {
	projectId?: string | null
	projectName?: string
	onFileClick?: (file: AttachmentItem) => void
	title?: string
	defaultExpanded?: boolean
	activeFileId?: string | null
	topicId?: string | null
	compact?: boolean
	scrollElementRef?: React.RefObject<HTMLElement>
}
const MemoryGroup = observer(function MemoryGroup({
	projectId,
	projectName,
	onFileClick,
	title: titleOverride,
	defaultExpanded = true,
	activeFileId,
	topicId,
	compact = true,
	scrollElementRef,
}: MemoryGroupProps) {
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
	useEffect(() => {
		setRoot(null)
		setDirectoryId(undefined)
		setLoading(true)
	}, [identity, scopePath, setRoot])
	useEffect(() => {
		if (!visited) return
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
	}, [identity, segments, mutationVersion, retry, visited, setRoot])
	const entryExists =
		root &&
		userFilesStore
			.getChildren(root.id)
			.some((file) => file.name === USER_MEMORY_ENTRY && !file.is_directory)
	const destination = () => userFilesStore.ensureDirectory([...segments, USER_MEMORY_NOTES])
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
		wrapLabel: true,
		isExpanded: expanded,
		onClick: () => {
			setExpanded(!expanded)
			setVisited(true)
		},
		leading: projectId ? <Folder size={16} /> : <Brain size={16} />,
		description:
			projectId && projectName && !titleOverride ? (
				<p className="break-words px-4 pb-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
					{projectName}
				</p>
			) : undefined,
	}
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
	return (
		<section className="flex min-h-0 shrink-0 flex-col border-b last:border-0">
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
	const identity = userFilesStore.currentIdentityKey
	const mutationVersion = userFilesStore.mutationVersion
	const [expanded, setExpanded] = useState(false)
	const [visited, setVisited] = useState(false)
	const [rootId, setRootId] = useState<string>()
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(false)
	const [loaded, setLoaded] = useState(false)
	const [refreshVersion, setRefreshVersion] = useState(0)
	const appliedRefresh = useRef(0)
	useEffect(() => {
		// 收起样式本身不阻止请求；首次展开以前不读取名单，也不调用名称接口。
		if (!visited) return
		let cancelled = false
		const force = refreshVersion !== appliedRefresh.current
		setLoading(true)
		setError(false)
		void (async () => {
			const root = await userFilesStore.findPath(USER_PROJECT_MEMORIES_PATH)
			if (cancelled || identity !== userFilesStore.currentIdentityKey) return
			const files = root ? await userFilesStore.loadDirectory(root.id, force) : []
			if (cancelled || identity !== userFilesStore.currentIdentityKey) return
			const ids = files.flatMap((file) => {
				const id = file.is_directory ? getMemoryProjectId(file.name) : null
				return id && id !== props.projectId ? [id] : []
			})
			await userFilesStore.loadProjectNames(ids, force)
			if (!cancelled && identity === userFilesStore.currentIdentityKey) {
				setRootId(root?.id)
				setLoaded(true)
				appliedRefresh.current = refreshVersion
			}
		})()
			.catch(() => {
				if (!cancelled) setError(true)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [identity, props.projectId, mutationVersion, visited, refreshVersion])
	const projects = rootId
		? userFilesStore.getChildren(rootId).flatMap((file) => {
				const id = file.is_directory ? getMemoryProjectId(file.name) : null
				return id && id !== props.projectId ? [{ id, fileId: file.id }] : []
			})
		: []
	return (
		<SidebarExpandableItem
			label={t("userSpace.otherProjectMemories")}
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
							onClick={() => setRefreshVersion((value) => value + 1)}
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
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setRefreshVersion((value) => value + 1)}
					>
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
