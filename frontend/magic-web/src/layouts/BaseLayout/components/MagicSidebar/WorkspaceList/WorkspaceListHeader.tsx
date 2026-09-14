import type { ReactNode } from "react"
import { Loader2, Plus, RefreshCw, Search, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SidebarRow } from "@/pages/superMagic/components/SidebarSection"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn-ui/input-group"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/utils/cn"

interface WorkspaceListHeaderProps {
	icon: ReactNode
	isExpanded: boolean
	isSearchMode: boolean
	searchValue: string
	isInitialWorkspaceListLoading: boolean
	isRefreshing: boolean
	onToggle: () => void
	onSearchValueChange: (value: string) => void
	searchWorkspaces: (value: string) => void
	handleSearchOpen: () => void
	handleSearchClose: () => void
	handleRefresh: () => Promise<void>
	handleStartCreateWorkspace: () => void
}

/** 标题使用共用分区行；原搜索、刷新、创建操作继续独立于栏目折叠。 */
export default function WorkspaceListHeader({
	icon,
	isExpanded,
	isSearchMode,
	searchValue,
	isInitialWorkspaceListLoading,
	isRefreshing,
	onToggle,
	onSearchValueChange,
	searchWorkspaces,
	handleSearchOpen,
	handleSearchClose,
	handleRefresh,
	handleStartCreateWorkspace,
}: WorkspaceListHeaderProps) {
	const { t } = useTranslation()
	return (
		<div className="shrink-0 bg-sidebar" data-testid="sidebar-workspace-list-sticky-header">
			{isSearchMode ? (
				<div className="flex h-9 items-center gap-1 px-2 pr-3 duration-200 animate-in fade-in">
					<InputGroup className="h-7 flex-1 rounded-md bg-sidebar duration-300 animate-in fade-in slide-in-from-left-4 [&:has([data-slot=input-group-control]:focus-visible)]:border-sidebar-border [&:has([data-slot=input-group-control]:focus-visible)]:ring-0">
						<InputGroupAddon align="inline-start">
							<Search size={16} />
						</InputGroupAddon>
						<InputGroupInput
							className="h-6"
							placeholder={t("super:workspace.searchWorkspace")}
							value={searchValue}
							onChange={(event) => onSearchValueChange(event.target.value)}
							onValueChangeAfterComposition={searchWorkspaces}
							autoFocus
							data-testid="sidebar-workspace-list-search-input"
						/>
					</InputGroup>
					<Button
						type="button"
						size="icon-sm"
						className="size-7 border bg-white text-foreground duration-300 animate-in fade-in hover:bg-accent"
						onClick={handleSearchClose}
						aria-label={t("common.cancel")}
						data-testid="sidebar-workspace-list-search-close"
					>
						<X className="size-4" />
					</Button>
				</div>
			) : (
				<SidebarRow
					label={t("super:projectNavigation.workspaces")}
					labelVariant="navigation"
					menuHover
					leading={icon}
					isExpanded={isExpanded}
					onClick={() => onToggle()}
					testId="sidebar-workspaces-toggle"
					className="h-8 shrink-0 px-2"
					trailing={
						<div
							className={cn(
								"flex items-center gap-0.5 text-muted-foreground",
								"group-data-[collapsible=icon]:hidden",
								isSearchMode && "hidden",
							)}
							data-testid="sidebar-workspace-list-actions"
						>
							<button
								type="button"
								aria-label={t("super:workspace.searchWorkspace")}
								data-testid="sidebar-workspace-list-search"
								className="outline-hidden relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md p-0 ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4"
								onClick={handleSearchOpen}
							>
								<Search className="h-4 w-4" />
							</button>
							{isInitialWorkspaceListLoading && (
								<Loader2
									className="h-4 w-4 shrink-0 animate-spin"
									aria-hidden
									data-testid="sidebar-workspace-list-loading"
								/>
							)}
							<button
								type="button"
								aria-label={t("sidebar:workspace.refresh")}
								data-testid="sidebar-workspace-list-refresh"
								disabled={isRefreshing}
								className={cn(
									"outline-hidden relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md p-0 ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4",
									"after:absolute after:-inset-2 md:after:hidden",
								)}
								onClick={() => void handleRefresh()}
							>
								<RefreshCw
									className={cn("h-4 w-4", isRefreshing && "animate-spin")}
								/>
							</button>
							<button
								type="button"
								aria-label={t("sidebar:workspace.add")}
								data-testid="sidebar-workspace-list-add"
								className={cn(
									"outline-hidden relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md p-0 ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4",
									"after:absolute after:-inset-2 md:after:hidden",
								)}
								onClick={handleStartCreateWorkspace}
							>
								<Plus className="h-4 w-4" />
							</button>
						</div>
					}
				/>
			)}
		</div>
	)
}
