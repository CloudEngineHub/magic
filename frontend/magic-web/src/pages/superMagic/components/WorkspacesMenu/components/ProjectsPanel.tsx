import { useRef, type ChangeEventHandler, type ComponentProps, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { IconSearch, IconX } from "@tabler/icons-react"
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
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import ProjectItem, { ViewMode } from "../../EmptyWorkspacePanel/components/ProjectItem"

const contentClassName = cn(
	"h-[min(55vh,520px)] overflow-y-auto overflow-x-hidden bg-muted/20 p-3",
	"[&::-webkit-scrollbar]:w-[6px]",
	"[&::-webkit-scrollbar-thumb]:rounded-[4px] [&::-webkit-scrollbar-thumb]:bg-border",
	"[&::-webkit-scrollbar-track]:bg-transparent",
)

interface ProjectsPanelProps {
	open?: boolean
	title: string
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
		<Dialog open={open}>
			{open && (
				<DialogContent
					showCloseButton={false}
					className="!w-[min(960px,calc(100vw_-_32px))] !max-w-none gap-0 overflow-hidden p-0"
					onInteractOutside={(event) => event.preventDefault()}
					onEscapeKeyDown={onClose}
					onCloseAutoFocus={(event) => {
						event.preventDefault()
						const target = returnFocusRef.current
						if (target?.isConnected && !target.closest("[inert]")) target.focus()
					}}
					data-testid="shared-workspace-dialog"
				>
					<DialogTitle className="sr-only">{title}</DialogTitle>
					<DialogDescription className="sr-only">
						{description || title}
					</DialogDescription>
					{/* Dialog header */}
					<div
						className="flex items-center justify-between gap-3 border-b border-border px-5 py-4"
						data-testid="shared-workspace-dialog-header"
					>
						<div className="flex min-w-0 flex-col gap-1">
							<div
								className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold leading-[22px] text-foreground/80"
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
								className="flex cursor-pointer items-center justify-center rounded-[6px] p-1.5 hover:bg-fill active:bg-fill-secondary"
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

					<div className="flex min-h-0 min-w-0">
						{sidebar}
						<div className="min-w-0 flex-1">
							<div className="border-b border-border px-4 py-3">
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
	tabType?: string
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
	tabType,
	error,
	footer,
	emptyContent,
	selectedProjectId,
	total,
}: ProjectsPanelListProps<T>) {
	const { t } = useTranslation("super")
	return (
		<MagicSpin section spinning={loading}>
			<div data-testid="shared-workspace-dialog-project-list" data-tab-type={tabType}>
				{/* Control bar */}
				<div className="border-b border-border px-4 py-3">
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
				<div className={contentClassName}>
					{error}
					<div
						className={cn(
							"grid gap-2",
							viewMode === ViewMode.LIST
								? "grid-cols-1"
								: "[grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]",
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
										"rounded-lg [&_[data-testid=project-item]]:border-primary [&_[data-testid=project-item]]:bg-primary/5",
								)}
								data-project-name={item.project_name || t("project.unnamedProject")}
							>
								<ProjectItem<T>
									{...itemProps}
									project={item}
									index={index}
									viewMode={viewMode}
									variant="compact"
								/>
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
