import { useTranslation } from "react-i18next"
import { ArrowLeft, Boxes, ChevronRight, RefreshCw } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { useMicroAppsPage } from "./hooks/useMicroAppsPage"

function formatProjectTime(value?: string): string {
	if (!value) return ""
	return new Date(value).toLocaleDateString()
}

function MicroAppProjectRow({
	project,
	onOpen,
}: {
	project: ProjectListItem
	onOpen: (project: ProjectListItem) => void
}) {
	return (
		<button
			type="button"
			className="flex h-16 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-muted/60"
			onClick={() => onOpen(project)}
			data-testid={`micro-apps-project-${project.id}`}
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
				<Boxes size={18} />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-foreground">
					{project.project_name}
				</p>
				<p className="mt-0.5 truncate text-xs text-muted-foreground">
					{project.workspace_name}
					{project.updated_at ? ` · ${formatProjectTime(project.updated_at)}` : ""}
				</p>
			</div>
			<ChevronRight size={16} className="shrink-0 text-muted-foreground" />
		</button>
	)
}

function MicroAppsLoading() {
	return (
		<div className="space-y-2 px-3 py-2" data-testid="micro-apps-loading">
			{[1, 2, 3, 4].map((item) => (
				<Skeleton key={item} className="h-16 w-full rounded-lg" />
			))}
		</div>
	)
}

export default function MicroAppsPage() {
	const { t } = useTranslation("super")
	const navigate = useNavigate()
	const { workspace, projects, loading, error, refresh } = useMicroAppsPage()

	const handleOpenProject = (project: ProjectListItem) => {
		navigate({
			name: RouteName.MicroApp,
			params: { projectId: project.id },
		})
	}

	const handleBack = () => {
		navigate({ name: RouteName.Super })
	}

	return (
		<div
			className="flex h-full w-full flex-col overflow-hidden bg-background"
			data-testid="micro-apps-page"
		>
			<header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8"
					onClick={handleBack}
				>
					<ArrowLeft size={16} />
				</Button>
				<div className="min-w-0 flex-1">
					<p className="truncate text-base font-medium text-foreground">
						{workspace?.name || t("microAppsPage.title")}
					</p>
					<p className="truncate text-xs text-muted-foreground">
						{t("microAppsPage.subtitle")}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="gap-2"
					onClick={refresh}
					disabled={loading}
				>
					<RefreshCw size={14} />
					{t("microAppsPage.refresh")}
				</Button>
			</header>

			<main className="min-h-0 flex-1 overflow-auto p-4">
				<div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
					{loading ? <MicroAppsLoading /> : null}

					{!loading && error ? (
						<div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-border text-center">
							<p className="text-sm font-medium text-foreground">
								{t("microAppsPage.errorTitle")}
							</p>
							<p className="text-sm text-muted-foreground">
								{t("microAppsPage.errorDescription")}
							</p>
							<Button
								type="button"
								variant="outline"
								className="gap-2"
								onClick={refresh}
							>
								<RefreshCw size={14} />
								{t("microAppsPage.refresh")}
							</Button>
						</div>
					) : null}

					{!loading && !error && projects.length === 0 ? (
						<div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-border text-center">
							<div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
								<Boxes size={22} />
							</div>
							<div className="space-y-1">
								<p className="text-sm font-medium text-foreground">
									{t("microAppsPage.emptyTitle")}
								</p>
								<p className="text-sm text-muted-foreground">
									{t("microAppsPage.emptyDescription")}
								</p>
							</div>
						</div>
					) : null}

					{!loading && !error && projects.length > 0 ? (
						<div
							className="rounded-lg border border-border bg-card p-2"
							data-testid="micro-apps-list"
						>
							{projects.map((project) => (
								<MicroAppProjectRow
									key={project.id}
									project={project}
									onOpen={handleOpenProject}
								/>
							))}
						</div>
					) : null}
				</div>
			</main>
		</div>
	)
}
