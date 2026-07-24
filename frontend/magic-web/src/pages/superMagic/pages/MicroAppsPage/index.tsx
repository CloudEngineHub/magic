import { lazy, Suspense, useCallback, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { Boxes, Loader2, RefreshCw, Rocket } from "lucide-react"
import { SuperMagicApi } from "@/apis"
import type { PublishedMicroAppProjectItem } from "@/apis/modules/superMagic"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { RoutePath } from "@/constants/routes"
import { useIsMobile } from "@/hooks/useIsMobile"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import MicroAppCard from "./components/MicroAppCard"
import MicroAppCreatePrompt from "./components/MicroAppCreatePrompt"
import MicroAppFloatingBackdrop from "./components/MicroAppFloatingBackdrop"
import MicroAppHeroTitle from "./components/MicroAppHeroTitle"
import { useMicroAppsPage } from "./hooks/useMicroAppsPage"

const MicroAppsPageMobile = lazy(() => import("./index.mobile"))

type MicroAppsTab = "projects" | "published"

function formatProjectTime(value?: string): string {
	if (!value) return ""
	return new Date(value).toLocaleDateString()
}

function getPublishedAppUrl(item: PublishedMicroAppProjectItem): string {
	if (item.app_id) {
		return `${window.location.origin}${RoutePath.MicroAppShare.replace(":appId", item.app_id)}`
	}
	return item.access_url || ""
}

function MicroAppsGridLoading() {
	return (
		<div
			className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
			data-testid="micro-apps-loading"
		>
			{[1, 2, 3, 4, 5, 6].map((item) => (
				<div key={item} className="overflow-hidden rounded-2xl border border-border/70">
					<Skeleton className="aspect-[16/10] w-full rounded-none" />
					<div className="space-y-2 p-4">
						<Skeleton className="h-4 w-3/5" />
						<Skeleton className="h-3 w-2/5" />
					</div>
				</div>
			))}
		</div>
	)
}

function EmptyState({
	icon,
	title,
	description,
}: {
	icon: ReactNode
	title: string
	description: string
}) {
	return (
		<div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-6 text-center">
			<div className="flex size-12 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm">
				{icon}
			</div>
			<div className="space-y-1">
				<p className="text-sm font-semibold text-foreground">{title}</p>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
		</div>
	)
}

function MicroAppsPageDesktop() {
	const { t } = useTranslation("super")
	const navigate = useNavigate()
	const { workspace, projects, publishedProjects, loading, error, refresh } = useMicroAppsPage()
	const [activeTab, setActiveTab] = useState<MicroAppsTab>("projects")
	const [promptFocused, setPromptFocused] = useState(false)
	const reduceMotion = Boolean(useReducedMotion())
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const heroRef = useRef<HTMLElement>(null)

	const handleOpenProject = useCallback(
		async (projectId: string) => {
			try {
				const app = await SuperMagicApi.getMicroAppProjectByProjectId(projectId)
				navigate({ name: RouteName.MicroApp, params: { appId: app.app_id } })
			} catch (openError) {
				console.error("打开微应用项目失败：", openError)
				magicToast.error(t("microAppsPage.errorTitle"))
			}
		},
		[navigate, t],
	)

	const handleOpenPublishedProject = (item: PublishedMicroAppProjectItem) => {
		const accessUrl = getPublishedAppUrl(item)
		if (accessUrl) window.open(accessUrl, "_blank", "noopener,noreferrer")
	}

	return (
		<div
			ref={scrollContainerRef}
			className="m-2 h-[calc(100%_-_16px)] w-[calc(100%_-_16px)] overflow-auto rounded-2xl border border-border/70 bg-background shadow-sm"
			data-testid="micro-apps-page"
		>
			<section
				ref={heroRef}
				className="relative flex min-h-[70%] overflow-hidden border-b border-border/60"
				data-testid="micro-apps-hero"
			>
				<MicroAppFloatingBackdrop
					scrollContainerRef={scrollContainerRef}
					heroRef={heroRef}
					active={promptFocused}
				/>
				<div className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-1 flex-col justify-center px-12 py-14">
					<MicroAppHeroTitle active={promptFocused} />
					<motion.p
						className="text-[#172037]/62 mx-auto mt-6 max-w-3xl text-pretty text-center text-[17px] leading-7 dark:text-white/55"
						initial={reduceMotion ? false : { opacity: 0, y: 14 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
					>
						{t("microAppsPage.heroDescription")}
					</motion.p>
					<motion.div
						className="mx-auto mt-7 w-full max-w-4xl text-left"
						initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
					>
						<MicroAppCreatePrompt
							workspace={workspace}
							onCreated={handleOpenProject}
							onFocusChange={setPromptFocused}
						/>
					</motion.div>
				</div>
			</section>

			<main className="mx-auto w-full max-w-[1320px] px-6 py-10">
				<div className="mb-6 flex items-end justify-between gap-4">
					<div>
						<h2 className="text-xl font-semibold tracking-tight text-foreground">
							{t("microAppsPage.galleryTitle")}
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("microAppsPage.galleryDescription")}
						</p>
					</div>
					<Tabs
						value={activeTab}
						onValueChange={(value) => setActiveTab(value as MicroAppsTab)}
					>
						<TabsList className="grid w-[280px] grid-cols-2 rounded-xl">
							<TabsTrigger value="projects" data-testid="micro-apps-tab-projects">
								{t("microAppsPage.tabProjects")}
							</TabsTrigger>
							<TabsTrigger value="published" data-testid="micro-apps-tab-published">
								{t("microAppsPage.tabPublished")}
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				{loading ? <MicroAppsGridLoading /> : null}

				{!loading && error ? (
					<div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-border text-center">
						<p className="text-sm font-semibold text-foreground">
							{t("microAppsPage.errorTitle")}
						</p>
						<p className="text-sm text-muted-foreground">
							{t("microAppsPage.errorDescription")}
						</p>
						<Button type="button" variant="outline" className="gap-2" onClick={refresh}>
							<RefreshCw className="size-4" aria-hidden />
							{t("microAppsPage.refresh")}
						</Button>
					</div>
				) : null}

				{!loading && !error && activeTab === "projects" && projects.length === 0 ? (
					<EmptyState
						icon={<Boxes className="size-4" aria-hidden />}
						title={t("microAppsPage.emptyTitle")}
						description={t("microAppsPage.emptyDescription")}
					/>
				) : null}

				{!loading &&
				!error &&
				activeTab === "published" &&
				publishedProjects.length === 0 ? (
					<EmptyState
						icon={<Rocket className="size-4" aria-hidden />}
						title={t("microAppsPage.publishedEmptyTitle")}
						description={t("microAppsPage.publishedEmptyDescription")}
					/>
				) : null}

				{!loading && !error && activeTab === "projects" && projects.length > 0 ? (
					<div
						className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
						data-testid="micro-apps-list"
					>
						{projects.map((project: ProjectListItem) => (
							<MicroAppCard
								key={project.id}
								id={project.id}
								title={project.project_name || t("project.unnamedProject")}
								meta={
									project.updated_at
										? t("microAppsPage.updatedAt", {
												date: formatProjectTime(project.updated_at),
											})
										: project.workspace_name || t("microAppsPage.draftBadge")
								}
								onClick={() => handleOpenProject(project.id)}
								testId={`micro-apps-project-${project.id}`}
							/>
						))}
					</div>
				) : null}

				{!loading && !error && activeTab === "published" && publishedProjects.length > 0 ? (
					<div
						className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
						data-testid="micro-apps-published-list"
					>
						{publishedProjects.map((item) => {
							const isPublic = item.share_type === ShareType.Public
							const isPassword = item.share_type === ShareType.PasswordProtected
							const shareTypeLabel = isPublic
								? t("microAppsPage.shareType.public")
								: isPassword
									? t("microAppsPage.shareType.password")
									: t("microAppsPage.shareType.organization")
							const itemId = item.app_id || item.project_id

							return (
								<MicroAppCard
									key={itemId}
									id={String(itemId)}
									title={item.project_name || t("project.unnamedProject")}
									meta={
										item.published_at
											? `${shareTypeLabel} · ${formatProjectTime(item.published_at)}`
											: shareTypeLabel
									}
									external
									onClick={() => handleOpenPublishedProject(item)}
									testId={`micro-apps-published-${itemId}`}
								/>
							)
						})}
					</div>
				) : null}
			</main>
		</div>
	)
}

export default function MicroAppsPage() {
	const isMobile = useIsMobile()

	if (isMobile) {
		return (
			<Suspense
				fallback={
					<div className="flex h-full w-full items-center justify-center bg-mobile-background">
						<Loader2 className="size-8 animate-spin text-muted-foreground" />
					</div>
				}
			>
				<MicroAppsPageMobile />
			</Suspense>
		)
	}

	return <MicroAppsPageDesktop />
}
