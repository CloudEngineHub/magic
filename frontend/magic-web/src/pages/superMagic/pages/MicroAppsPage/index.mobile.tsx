import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
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
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import magicToast from "@/components/base/MagicToaster/utils"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import { RoutePath } from "@/constants/routes"
import { MobileShellSidebarToggleButton } from "@/pages/superMagicMobile/components/MobileShell"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"

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

function MicroAppMobileRow({
	title,
	subtitle,
	icon,
	onClick,
	testId,
}: {
	title: string
	subtitle: string
	icon: ReactNode
	onClick: () => void
	testId: string
}) {
	return (
		<button
			type="button"
			className="flex h-16 w-full items-center gap-3 rounded-lg px-3 text-left transition-opacity active:opacity-70"
			onClick={onClick}
			data-testid={testId}
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-base font-medium leading-6 text-foreground">{title}</p>
				<p className="truncate text-xs leading-5 text-muted-foreground">{subtitle}</p>
			</div>
			<ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
		</button>
	)
}

function MicroAppsMobileLoading() {
	return (
		<div className="flex flex-col gap-1" data-testid="micro-apps-mobile-loading">
			{[1, 2, 3, 4].map((item) => (
				<div key={item} className="h-16 animate-pulse rounded-lg bg-muted/40" />
			))}
		</div>
	)
}

export default function MicroAppsPageMobile() {
	const { t } = useTranslation("super")
	const navigate = useNavigate()
	const { workspace, projects, publishedProjects, loading, error, refresh } = useMicroAppsPage()
	const [creating, setCreating] = useState(false)
	const [activeTab, setActiveTab] = useState<MicroAppsTab>("projects")

	const handleOpenProject = (project: ProjectListItem) => {
		navigate({
			name: RouteName.MicroApp,
			params: { projectId: project.id },
			viewTransition: false,
		})
	}

	const handleOpenPublishedProject = (item: PublishedMicroAppProjectItem) => {
		const accessUrl = getPublishedAppUrl(item)
		if (accessUrl) window.open(accessUrl, "_blank", "noopener,noreferrer")
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
				viewTransition: false,
			})
		} catch (createError) {
			console.error("创建微应用项目失败：", createError)
			magicToast.error(t("microAppsPage.createProjectFailed"))
		} finally {
			setCreating(false)
		}
	}

	const visibleItems = activeTab === "projects" ? projects : publishedProjects
	const isEmpty = !loading && !error && visibleItems.length === 0

	return (
		<div
			className="absolute inset-0 flex h-full min-h-0 w-full flex-col overflow-hidden bg-mobile-background"
			data-testid="micro-apps-page-mobile"
		>
			<header className="mobile-page-header shrink-0" data-testid="micro-apps-mobile-header">
				<MobileShellSidebarToggleButton />
				<div className="min-w-0 flex-1 px-2 text-center">
					<p className="truncate text-[18px] font-medium leading-6 text-foreground">
						{workspace?.name || t("microAppsPage.title")}
					</p>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="mobile-page-header-btn"
					onClick={() => void handleCreateProject()}
					disabled={!workspace?.id || loading || creating}
					aria-label={t("microAppsPage.createProject")}
					data-testid="micro-apps-mobile-create"
				>
					{creating ? (
						<LoaderCircle className="size-5 animate-spin" aria-hidden />
					) : (
						<Plus className="size-[22px]" aria-hidden />
					)}
				</Button>
			</header>

			<div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
				<Tabs
					value={activeTab}
					onValueChange={(value) => setActiveTab(value as MicroAppsTab)}
					className="min-w-0 flex-1"
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="projects" data-testid="micro-apps-mobile-tab-projects">
							{t("microAppsPage.tabProjects")}
						</TabsTrigger>
						<TabsTrigger
							value="published"
							data-testid="micro-apps-mobile-tab-published"
						>
							{t("microAppsPage.tabPublished")}
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-9 shrink-0"
					onClick={refresh}
					disabled={loading || creating}
					aria-label={t("microAppsPage.refresh")}
					data-testid="micro-apps-mobile-refresh"
				>
					<RefreshCw className="size-4" aria-hidden />
				</Button>
			</div>

			<ScrollEdgeFadeContainer
				fadeColor="mobile-background"
				className="min-h-0 flex-1"
				scrollClassName="no-scrollbar flex flex-col px-3 pb-5 pt-2"
				contentDeps={[activeTab, projects.length, publishedProjects.length, loading, error]}
			>
				{loading ? <MicroAppsMobileLoading /> : null}

				{!loading && error ? (
					<div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
						<div className="space-y-1">
							<p className="text-base font-medium text-foreground">
								{t("microAppsPage.errorTitle")}
							</p>
							<p className="text-sm text-muted-foreground">
								{t("microAppsPage.errorDescription")}
							</p>
						</div>
						<Button type="button" variant="outline" className="gap-2" onClick={refresh}>
							<RefreshCw className="size-4" aria-hidden />
							{t("microAppsPage.refresh")}
						</Button>
					</div>
				) : null}

				{isEmpty ? (
					<div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
						<div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
							{activeTab === "projects" ? (
								<Boxes className="size-[22px]" aria-hidden />
							) : (
								<Rocket className="size-[22px]" aria-hidden />
							)}
						</div>
						<div className="space-y-1">
							<p className="text-base font-medium text-foreground">
								{activeTab === "projects"
									? t("microAppsPage.emptyTitle")
									: t("microAppsPage.publishedEmptyTitle")}
							</p>
							<p className="text-sm text-muted-foreground">
								{activeTab === "projects"
									? t("microAppsPage.emptyDescription")
									: t("microAppsPage.publishedEmptyDescription")}
							</p>
						</div>
					</div>
				) : null}

				{!loading && !error && activeTab === "projects"
					? projects.map((project) => (
							<MicroAppMobileRow
								key={project.id}
								title={project.project_name || t("project.unnamedProject")}
								subtitle={`${project.workspace_name || ""}${
									project.updated_at
										? ` · ${formatProjectTime(project.updated_at)}`
										: ""
								}`}
								icon={<Boxes className="size-[18px]" aria-hidden />}
								onClick={() => handleOpenProject(project)}
								testId={`micro-apps-mobile-project-${project.id}`}
							/>
						))
					: null}

				{!loading && !error && activeTab === "published"
					? publishedProjects.map((item) => {
							const isPublic = item.share_type === ShareType.Public
							const isPassword = item.share_type === ShareType.PasswordProtected
							const shareTypeLabel = isPublic
								? t("microAppsPage.shareType.public")
								: isPassword
									? t("microAppsPage.shareType.password")
									: t("microAppsPage.shareType.organization")
							const Icon = isPublic ? Globe2 : isPassword ? LockKeyhole : Users
							const itemId = item.resource_id || item.project_id

							return (
								<MicroAppMobileRow
									key={itemId}
									title={item.project_name || t("project.unnamedProject")}
									subtitle={`${shareTypeLabel}${
										item.published_at
											? ` · ${formatProjectTime(item.published_at)}`
											: ""
									}`}
									icon={<Icon className="size-[18px]" aria-hidden />}
									onClick={() => handleOpenPublishedProject(item)}
									testId={`micro-apps-mobile-published-${itemId}`}
								/>
							)
						})
					: null}
			</ScrollEdgeFadeContainer>
		</div>
	)
}
