import { useCallback, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { Boxes, RefreshCw, Rocket } from "lucide-react"
import { SuperMagicApi } from "@/apis"
import type { PublishedMicroAppProjectItem } from "@/apis/modules/superMagic"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { RoutePath } from "@/constants/routes"
import { MobileShellSidebarToggleButton } from "@/pages/superMagicMobile/components/MobileShell"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import MicroAppCard from "./components/MicroAppCard"
import MicroAppCreatePrompt from "./components/MicroAppCreatePrompt"
import MicroAppFloatingBackdrop from "./components/MicroAppFloatingBackdrop"
import MicroAppHeroTitle from "./components/MicroAppHeroTitle"
import { useMicroAppsPage } from "./hooks/useMicroAppsPage"

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

function MobileGridLoading() {
	return (
		<div className="grid grid-cols-2 gap-3" data-testid="micro-apps-mobile-loading">
			{[1, 2, 3, 4].map((item) => (
				<div key={item} className="overflow-hidden rounded-2xl border border-border/60">
					<div className="aspect-[16/10] animate-pulse bg-muted/50" />
					<div className="space-y-2 p-3">
						<div className="h-3.5 w-3/4 animate-pulse rounded bg-muted/60" />
						<div className="h-3 w-1/2 animate-pulse rounded bg-muted/40" />
					</div>
				</div>
			))}
		</div>
	)
}

export default function MicroAppsPageMobile() {
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
				navigate({
					name: RouteName.MicroApp,
					params: { appId: app.app_id },
					viewTransition: false,
				})
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

	const visibleItems = activeTab === "projects" ? projects : publishedProjects
	const isEmpty = !loading && !error && visibleItems.length === 0

	return (
		<div
			ref={scrollContainerRef}
			className="absolute inset-0 h-full min-h-0 w-full overflow-auto bg-mobile-background"
			data-testid="micro-apps-page-mobile"
		>
			<section
				ref={heroRef}
				className="relative flex min-h-[70%] flex-col overflow-hidden border-b border-border/50"
				data-testid="micro-apps-mobile-hero"
			>
				<MicroAppFloatingBackdrop
					scrollContainerRef={scrollContainerRef}
					heroRef={heroRef}
					active={promptFocused}
					mobile
				/>
				<header
					className="mobile-page-header relative z-20"
					data-testid="micro-apps-mobile-header"
				>
					<MobileShellSidebarToggleButton />
					<div className="min-w-0 flex-1 px-2 text-center">
						<p className="truncate text-[17px] font-medium leading-6 text-foreground">
							{workspace?.name || t("microAppsPage.title")}
						</p>
					</div>
					<div className="mobile-page-header-btn" aria-hidden />
				</header>

				<div className="relative z-10 flex flex-1 flex-col justify-center px-4 py-9">
					<MicroAppHeroTitle active={promptFocused} mobile />
					<motion.p
						className="mx-auto mt-5 max-w-[350px] text-center text-sm leading-6 text-[#172037]/60 dark:text-white/55"
						initial={reduceMotion ? false : { opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
					>
						{t("microAppsPage.heroDescriptionMobile")}
					</motion.p>
					<motion.div
						className="mt-6 w-full text-left"
						initial={reduceMotion ? false : { opacity: 0, y: 14 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.65, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
					>
						<MicroAppCreatePrompt
							workspace={workspace}
							onCreated={handleOpenProject}
							onFocusChange={setPromptFocused}
							mobile
						/>
					</motion.div>
				</div>
			</section>

			<main className="px-3 pb-7 pt-6">
				<div className="mb-4 flex items-center justify-between gap-3 px-1">
					<h2 className="text-lg font-semibold text-foreground">
						{t("microAppsPage.galleryTitle")}
					</h2>
					<Tabs
						value={activeTab}
						onValueChange={(value) => setActiveTab(value as MicroAppsTab)}
					>
						<TabsList className="grid h-9 w-[188px] grid-cols-2 rounded-xl">
							<TabsTrigger
								value="projects"
								data-testid="micro-apps-mobile-tab-projects"
							>
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
				</div>

				{loading ? <MobileGridLoading /> : null}

				{!loading && error ? (
					<div className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-2xl border border-border px-6 text-center">
						<p className="text-base font-medium text-foreground">
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

				{isEmpty ? (
					<div className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 text-center">
						<div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
							{activeTab === "projects" ? (
								<Boxes className="size-4" aria-hidden />
							) : (
								<Rocket className="size-4" aria-hidden />
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

				{!loading && !error && activeTab === "projects" ? (
					<div className="grid grid-cols-2 gap-3" data-testid="micro-apps-mobile-list">
						{projects.map((project) => (
							<MicroAppCard
								key={project.id}
								id={project.id}
								title={project.project_name || t("project.unnamedProject")}
								meta={
									project.updated_at
										? formatProjectTime(project.updated_at)
										: t("microAppsPage.draftBadge")
								}
								onClick={() => handleOpenProject(project.id)}
								testId={`micro-apps-mobile-project-${project.id}`}
							/>
						))}
					</div>
				) : null}

				{!loading && !error && activeTab === "published" ? (
					<div
						className="grid grid-cols-2 gap-3"
						data-testid="micro-apps-mobile-published-list"
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
									testId={`micro-apps-mobile-published-${itemId}`}
								/>
							)
						})}
					</div>
				) : null}
			</main>
		</div>
	)
}
