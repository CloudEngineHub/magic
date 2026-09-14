import {
	useRef,
	type ChangeEventHandler,
	type ComponentProps,
	type CSSProperties,
	type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import { IconSearch, IconX } from "@tabler/icons-react"
import type { DialogWindowOptions } from "@/hooks/use-dialog-window"
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import MagicIcon from "@/components/base/MagicIcon"
import MagicSpin from "@/components/base/MagicSpin"
import MagicEmpty from "@/components/base/MagicEmpty"
import { cn } from "@/utils/cn"
import {
	CollaborationProjectType,
	type ProjectListItem,
} from "@/pages/superMagic/pages/Workspace/types"
import ProjectItem, { SortType, ViewMode } from "../../EmptyWorkspacePanel/components/ProjectItem"

const contentClassName = cn(
	"min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/20 p-3",
	"[&::-webkit-scrollbar]:w-[6px]",
	"[&::-webkit-scrollbar-thumb]:rounded-[4px] [&::-webkit-scrollbar-thumb]:bg-border",
	"[&::-webkit-scrollbar-track]:bg-transparent",
)

interface ProjectsPanelProps {
	open?: boolean
	title: string
	titleIcon?: ReactNode
	location?: ReactNode
	windowOptions?: DialogWindowOptions
	description?: string
	searchValue: string
	onSearchValueChange: ChangeEventHandler<HTMLInputElement>
	onClose: () => void
	children: ReactNode
	sidebar?: ReactNode
}

export function ProjectsPanel({
	open,
	title,
	titleIcon,
	location,
	windowOptions,
	description,
	searchValue,
	onSearchValueChange,
	onClose,
	children,
	sidebar,
}: ProjectsPanelProps) {
	const { t } = useTranslation("super")
	const wasOpenRef = useRef(false)
	const returnFocusRef = useRef<HTMLElement | null>(null)
	if (open && !wasOpenRef.current)
		returnFocusRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null
	wasOpenRef.current = !!open
	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) onClose()
			}}
		>
			{open && (
				<DialogContent
					showCloseButton={false}
					windowOptions={windowOptions}
					className={cn(
						"flex flex-col gap-0 rounded-xl p-0",
						windowOptions ? "overflow-visible" : "overflow-hidden",
						!windowOptions &&
							"h-[min(680px,calc(100dvh_-_32px))] !w-[min(960px,calc(100vw_-_32px))] !max-w-none",
					)}
					onInteractOutside={(event) => event.preventDefault()}
					onCloseAutoFocus={(event) => {
						event.preventDefault()
						const target = returnFocusRef.current
						if (target?.isConnected && !target.closest("[inert]"))
							target.focus({ preventScroll: true })
					}}
					data-testid="shared-workspace-dialog"
				>
					<DialogTitle className="sr-only">{title}</DialogTitle>
					<DialogDescription className="sr-only">
						{description || title}
					</DialogDescription>
					{/* Dialog header */}
					<div
						className={cn(
							"flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5",
							windowOptions?.draggable &&
								"cursor-grab touch-none select-none active:cursor-grabbing",
						)}
						data-dialog-drag-handle
						data-testid="shared-workspace-dialog-header"
					>
						{titleIcon && (
							<div
								className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
								aria-hidden="true"
							>
								{titleIcon}
							</div>
						)}
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<div
								className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-5 text-foreground"
								data-testid="shared-workspace-dialog-title"
							>
								{title}
							</div>
							{description && (
								<div
									className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-normal leading-4 text-foreground/35"
									data-testid="shared-workspace-dialog-description"
								>
									{description}
								</div>
							)}
						</div>
						<div
							className="flex items-center gap-2.5"
							data-testid="shared-workspace-dialog-actions"
						>
							<button
								type="button"
								aria-label={t("button.close", { ns: "interface" })}
								className="flex cursor-pointer items-center justify-center rounded-[6px] p-1.5 outline-none hover:bg-fill focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-fill-secondary"
								data-testid="shared-workspace-dialog-close-button"
								onClick={(e) => {
									e.stopPropagation()
									onClose()
								}}
							>
								<MagicIcon component={IconX} size={16} />
							</button>
						</div>
					</div>

					{/* 高度从窗口逐层传到滚动区；缩放时标题、搜索和工具栏仍保持可见。 */}
					<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-b-xl">
						{sidebar}
						<div className="flex min-h-0 min-w-0 flex-1 flex-col">
							{location && (
								<div className="flex shrink-0 items-center gap-2 px-4 pt-3 text-sm font-medium [&_svg]:shrink-0">
									{location}
								</div>
							)}
							<div className="shrink-0 border-b border-border px-4 py-3">
								<div
									className="relative"
									data-testid="shared-workspace-dialog-search"
								>
									<IconSearch
										size={16}
										className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
									/>
									<Input
										className="h-8 bg-fill pl-9"
										placeholder={t("project.searchProject")}
										onChange={onSearchValueChange}
										value={searchValue}
										data-testid="shared-workspace-dialog-search-input"
									/>
								</div>
							</div>
							{children}
						</div>
					</div>
					{windowOptions?.resizable && (
						<span
							aria-hidden="true"
							className="pointer-events-none absolute bottom-1 right-1 size-3 text-muted-foreground/60"
						>
							<span className="absolute bottom-1 right-0 h-px w-3 -rotate-45 bg-current" />
							<span className="absolute bottom-0.5 right-0 h-px w-1.5 -rotate-45 bg-current" />
						</span>
					)}
				</DialogContent>
			)}
		</Dialog>
	)
}

interface ProjectsPanelListProps<T extends ProjectListItem> {
	projects: T[]
	loading: boolean
	viewMode: ViewMode
	toolbar: ReactNode
	itemProps: Omit<ComponentProps<typeof ProjectItem<T>>, "project" | "index" | "viewMode">
	renderItem?: (props: ComponentProps<typeof ProjectItem<T>>) => ReactNode
	tabType?: CollaborationProjectType
	error?: ReactNode
	footer?: ReactNode
	emptyContent?: ReactNode
	selectedProjectId?: string
	total?: number
}

export function ProjectsPanelList<T extends ProjectListItem>({
	projects,
	loading,
	viewMode,
	toolbar,
	itemProps,
	renderItem,
	tabType,
	error,
	footer,
	emptyContent,
	selectedProjectId,
	total,
}: ProjectsPanelListProps<T>) {
	const { t } = useTranslation("super")
	const isList = viewMode === ViewMode.LIST
	const isShared = !!itemProps.inCollaborationPanel
	const showCreator = isShared && tabType === CollaborationProjectType.Received
	// 表头与条目共用列宽；800px 可容纳最完整的人员列和至少 120px 名称，窄容器改为多行。
	const listStyle: CSSProperties & { "--project-list-columns": string } = {
		"--project-list-columns": showCreator
			? "16px minmax(120px,1fr) [creator] 144px [members] 128px [time] 176px [actions] 32px"
			: isShared
				? "16px minmax(120px,1fr) [members] 128px [time] 176px [actions] 128px"
				: "16px minmax(120px,1fr) [time] 176px [actions] 32px",
	}
	const timeHeading =
		itemProps.sortType === SortType.MY_LAST_ACTIVE_TIME
			? t("sidebarPanels.lastActiveTime")
			: itemProps.sortType === SortType.PROJECT_CREATE_TIME
				? t("sidebarPanels.createdTime")
				: t("sidebarPanels.updatedTime")
	return (
		<MagicSpin
			section
			spinning={loading}
			className="flex min-h-0 flex-1 flex-col"
			innerClassName="flex min-h-0 flex-1 flex-col"
		>
			<div
				className="flex min-h-0 flex-1 flex-col"
				data-testid="shared-workspace-dialog-project-list"
				data-tab-type={tabType}
			>
				{/* Control bar */}
				<div className="shrink-0 border-b border-border px-4 py-3">
					<div className="flex min-w-0 flex-wrap items-center justify-between gap-2.5">
						<div className="shrink-0 text-sm font-semibold leading-5 text-foreground/80 opacity-80">
							{t("workspace.projects")} · {total ?? projects.length}
						</div>
						<div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5">
							{toolbar}
						</div>
					</div>
				</div>
				{/* Project list */}
				<div
					className={cn(contentClassName, isList && "[container-type:inline-size]")}
					style={isList ? listStyle : undefined}
				>
					{error}
					{isList && projects.length > 0 && (
						<div className="hidden items-center gap-x-3 border-b border-border px-3 py-2 text-xs text-muted-foreground [grid-template-columns:var(--project-list-columns)] [@container_(min-width:800px)]:grid">
							<span className="col-span-2">{t("sidebarPanels.projectName")}</span>
							{showCreator && <span>{t("collaborators.creator")}</span>}
							{isShared && <span>{t("collaborators.collaborator")}</span>}
							<span>{timeHeading}</span>
							<span className="sr-only">{t("common.moreActions")}</span>
						</div>
					)}
					<div
						className={cn(
							"grid",
							viewMode === ViewMode.LIST
								? "grid-cols-1"
								: "gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]",
						)}
						data-testid="shared-workspace-dialog-project-list-layout"
						data-view-mode={viewMode}
					>
						{projects.map((item, index) => (
							<div
								key={item.id}
								data-testid="shared-workspace-dialog-project-item"
								data-tab-type={tabType}
								data-project-id={item.id}
								aria-current={selectedProjectId === item.id ? true : undefined}
								className={cn(
									selectedProjectId === item.id &&
										(isList
											? "[&_[data-testid=project-item]]:bg-primary/5"
											: "rounded-lg [&_[data-testid=project-item]]:border-primary [&_[data-testid=project-item]]:bg-primary/5"),
								)}
								data-project-name={item.project_name || t("project.unnamedProject")}
							>
								{renderItem ? (
									renderItem({
										...itemProps,
										project: item,
										index,
										viewMode,
										variant: "compact",
										collaborationType: tabType,
									})
								) : (
									<ProjectItem<T>
										{...itemProps}
										project={item}
										index={index}
										viewMode={viewMode}
										variant="compact"
										collaborationType={tabType}
									/>
								)}
							</div>
						))}
					</div>
					{!error && !loading && projects.length === 0 && (
						<div
							data-testid="shared-workspace-dialog-project-empty"
							data-tab-type={tabType}
						>
							{emptyContent || <MagicEmpty description={t("project.noProjects")} />}
						</div>
					)}
					{total !== undefined && projects.length > 0 && (
						<div className="pt-3 text-center text-xs text-muted-foreground">
							{t("sidebarPanels.loadedProjects", { count: projects.length, total })}
						</div>
					)}
					{footer}
				</div>
			</div>
		</MagicSpin>
	)
}
