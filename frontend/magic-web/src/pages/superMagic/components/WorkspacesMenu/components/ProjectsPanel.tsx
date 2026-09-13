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

const gridClassName = cn(
	"grid gap-2.5",
	"[grid-template-columns:repeat(6,minmax(0,1fr))]",
	"max-[1750px]:[grid-template-columns:repeat(5,minmax(0,1fr))]",
	"max-[1500px]:[grid-template-columns:repeat(4,minmax(0,1fr))]",
	"max-[1250px]:[grid-template-columns:repeat(3,minmax(0,1fr))]",
	"max-[1000px]:[grid-template-columns:repeat(2,minmax(0,1fr))]",
)

const contentClassName = cn(
	"h-[70vh] overflow-y-auto overflow-x-hidden rounded-b-[12px] bg-gray-50 px-5 pb-5 dark:bg-white/5",
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
}

export function ProjectsPanel({
	open,
	title,
	description,
	searchValue,
	onSearchValueChange,
	onClose,
	children,
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
					className="!w-[80vw] !max-w-[2000px] gap-0 overflow-hidden p-0"
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
						className="flex items-center justify-between gap-2.5 px-5 pb-0 pt-5"
						data-testid="shared-workspace-dialog-header"
					>
						<div className="flex min-w-0 flex-col gap-1">
							<div
								className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold leading-[22px] text-foreground/80"
								data-testid="shared-workspace-dialog-title"
							>
								{title}
							</div>
							<div
								className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-normal leading-4 text-foreground/35"
								data-testid="shared-workspace-dialog-description"
							>
								{description}
							</div>
						</div>
						<div
							className="flex items-center gap-2.5"
							data-testid="shared-workspace-dialog-actions"
						>
							<div
								className="relative w-[220px]"
								data-testid="shared-workspace-dialog-search"
							>
								<IconSearch
									size={16}
									className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									className="bg-fill pl-9"
									placeholder={t("project.searchProject")}
									onChange={onSearchValueChange}
									value={searchValue}
									data-testid="shared-workspace-dialog-search-input"
								/>
							</div>
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
								<MagicIcon component={IconX} size={24} />
							</button>
						</div>
					</div>

					{children}
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
}: ProjectsPanelListProps<T>) {
	const { t } = useTranslation("super")
	return (
		<MagicSpin section spinning={loading}>
			<div data-testid="shared-workspace-dialog-project-list" data-tab-type={tabType}>
				{/* Control bar */}
				<div className="bg-gray-50 px-5 pb-2.5 pt-5 dark:bg-white/5">
					<div className="flex min-w-0 flex-wrap items-center justify-between gap-2.5">
						<div className="shrink-0 text-sm font-semibold leading-5 text-foreground/80 opacity-80">
							{t("workspace.projects")} · {projects.length}
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
						className={gridClassName}
						data-testid="shared-workspace-dialog-project-list-layout"
						data-view-mode={viewMode}
					>
						{projects.map((item, index) => (
							<div
								key={[
									item.id,
									item.updated_at,
									item.last_active_at || "",
									item.is_pinned ? "1" : "0",
									item.bind_workspace_id || "",
									viewMode,
								].join("-")}
								data-testid="shared-workspace-dialog-project-item"
								data-tab-type={tabType}
								data-project-id={item.id}
								aria-current={selectedProjectId === item.id ? true : undefined}
								className={cn(
									selectedProjectId === item.id &&
										"rounded-lg ring-1 ring-primary",
								)}
								data-project-name={item.project_name || t("project.unnamedProject")}
							>
								<ProjectItem<T>
									{...itemProps}
									project={item}
									index={index}
									viewMode={viewMode}
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
					{footer}
				</div>
			</div>
		</MagicSpin>
	)
}
