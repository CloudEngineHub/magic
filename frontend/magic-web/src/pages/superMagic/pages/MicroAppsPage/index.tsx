import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
	ArrowLeft,
	Boxes,
	ChevronRight,
	Globe2,
	LoaderCircle,
	LockKeyhole,
	Plus,
	RefreshCw,
	Rocket,
	Users,
} from "lucide-react"
import { SuperMagicApi } from "@/apis"
import type { PublishedMicroAppProjectItem } from "@/apis/modules/superMagic"
import { Button } from "@/components/shadcn-ui/button"
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import magicToast from "@/components/base/MagicToaster/utils"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import { RoutePath } from "@/constants/routes"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { useMicroAppsPage } from "./hooks/useMicroAppsPage"

type MicroAppsTab = "projects" | "published"

function formatProjectTime(value?: string): string {
	if (!value) return ""
	return new Date(value).toLocaleDateString()
}

function getPublishedAppUrl(item: PublishedMicroAppProjectItem): string {
	if (item.access_url) return item.access_url
	if (!item.resource_id) return ""
	return `${window.location.origin}${RoutePath.MicroAppShare.replace(
		":resourceId",
		item.resource_id,
	)}`
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

function PublishedMicroAppRow({
	item,
	onOpen,
}: {
	item: PublishedMicroAppProjectItem
	onOpen: (item: PublishedMicroAppProjectItem) => void
}) {
	const { t } = useTranslation("super")
	const shareTypeIcon =
		item.share_type === ShareType.Public ? (
			<Globe2 size={18} />
		) : item.share_type === ShareType.PasswordProtected ? (
			<LockKeyhole size={18} />
		) : (
			<Users size={18} />
		)
	const shareTypeLabel =
		item.share_type === ShareType.Public
			? t("microAppsPage.shareType.public")
			: item.share_type === ShareType.PasswordProtected
				? t("microAppsPage.shareType.password")
				: t("microAppsPage.shareType.organization")

	return (
		<button
			type="button"
			className="flex h-16 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-muted/60"
			onClick={() => onOpen(item)}
			data-testid={`micro-apps-published-${item.resource_id || item.project_id}`}
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
				{shareTypeIcon}
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-foreground">
					{item.project_name || t("project.unnamedProject")}
				</p>
				<p className="mt-0.5 truncate text-xs text-muted-foreground">
					{shareTypeLabel}
					{item.published_at ? ` · ${formatProjectTime(item.published_at)}` : ""}
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
	const { workspace, projects, publishedProjects, loading, error, refresh } = useMicroAppsPage()
	const [creating, setCreating] = useState(false)
	const [activeTab, setActiveTab] = useState<MicroAppsTab>("projects")

	const handleOpenProject = (project: ProjectListItem) => {
		navigate({
			name: RouteName.MicroApp,
			params: { projectId: project.id },
		})
	}

	const handleOpenPublishedProject = (item: PublishedMicroAppProjectItem) => {
		const accessUrl = getPublishedAppUrl(item)
		if (accessUrl) {
			window.open(accessUrl, "_blank", "noopener,noreferrer")
		}
	}

	const handleBack = () => {
		navigate({ name: RouteName.Super })
	}

	const handleCreateProject = async () => {
		if (!workspace?.id || creating) return

		setCreating(true)
		try {
			const result = await SuperMagicApi.createProject({
				workspace_id: workspace.id,
				project_name: "",
				project_description: "",
				project_mode: TopicMode.MicroApp,
			})

			navigate({
				name: RouteName.MicroApp,
				params: { projectId: result.project.id },
			})
		} catch (createError) {
			console.error("创建微应用项目失败：", createError)
			magicToast.error(t("microAppsPage.createProjectFailed"))
		} finally {
			setCreating(false)
		}
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
					disabled={loading || creating}
				>
					<RefreshCw size={14} />
					{t("microAppsPage.refresh")}
				</Button>
				<Button
					type="button"
					size="sm"
					className="gap-2"
					onClick={handleCreateProject}
					disabled={!workspace?.id || loading || creating}
				>
					{creating ? (
						<LoaderCircle size={14} className="animate-spin" />
					) : (
						<Plus size={14} />
					)}
					{t("microAppsPage.createProject")}
				</Button>
			</header>

			<main className="min-h-0 flex-1 overflow-auto p-4">
				<div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
					<Tabs
						value={activeTab}
						onValueChange={(value) => setActiveTab(value as MicroAppsTab)}
						data-testid="micro-apps-tabs"
					>
						<TabsList className="grid w-full max-w-sm grid-cols-2">
							<TabsTrigger value="projects" data-testid="micro-apps-tab-projects">
								{t("microAppsPage.tabProjects")}
							</TabsTrigger>
							<TabsTrigger value="published" data-testid="micro-apps-tab-published">
								{t("microAppsPage.tabPublished")}
							</TabsTrigger>
						</TabsList>
					</Tabs>

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

					{!loading && !error && activeTab === "projects" && projects.length === 0 ? (
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

					{!loading &&
					!error &&
					activeTab === "published" &&
					publishedProjects.length === 0 ? (
						<div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-border text-center">
							<div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
								<Rocket size={22} />
							</div>
							<div className="space-y-1">
								<p className="text-sm font-medium text-foreground">
									{t("microAppsPage.publishedEmptyTitle")}
								</p>
								<p className="text-sm text-muted-foreground">
									{t("microAppsPage.publishedEmptyDescription")}
								</p>
							</div>
						</div>
					) : null}

					{!loading && !error && activeTab === "projects" && projects.length > 0 ? (
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

					{!loading &&
					!error &&
					activeTab === "published" &&
					publishedProjects.length > 0 ? (
						<div
							className="rounded-lg border border-border bg-card p-2"
							data-testid="micro-apps-published-list"
						>
							{publishedProjects.map((item) => (
								<PublishedMicroAppRow
									key={item.resource_id || item.project_id}
									item={item}
									onOpen={handleOpenPublishedProject}
								/>
							))}
						</div>
					) : null}
				</div>
			</main>
		</div>
	)
}
