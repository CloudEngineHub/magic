import { useCallback, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { Loader2, Search } from "lucide-react"
import type { MicroAppListScope } from "@/apis/modules/superMagic"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import {
	MicroAppEmptyIllustration,
	MicroAppSearchEmptyIllustration,
} from "@/pages/superMagic/components/MicroAppStateIllustration"
import { MobileShellSidebarToggleButton } from "@/pages/superMagicMobile/components/MobileShell"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import MicroAppCard from "./components/MicroAppCard"
import MicroAppCreatePrompt from "./components/MicroAppCreatePrompt"
import MicroAppFloatingBackdrop from "./components/MicroAppFloatingBackdrop"
import MicroAppHeroTitle from "./components/MicroAppHeroTitle"
import MicroAppLoadErrorState from "./components/MicroAppLoadErrorState"
import { useMicroAppsPage } from "./hooks/useMicroAppsPage"

function formatAppTime(value: string | null | undefined): string {
	if (!value) return ""
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
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
	const {
		workspace,
		apps,
		scope,
		setScope,
		keyword,
		setKeyword,
		loading,
		loadingMore,
		hasMore,
		error,
		refresh,
		loadMore,
	} = useMicroAppsPage()
	const [promptFocused, setPromptFocused] = useState(false)
	const reduceMotion = Boolean(useReducedMotion())
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const heroRef = useRef<HTMLElement>(null)

	const handleOpenApp = useCallback(
		(appId: string) => {
			navigate({
				name: RouteName.MicroApp,
				params: { appId },
				viewTransition: false,
			})
		},
		[navigate],
	)
	const EmptyIllustration = keyword ? MicroAppSearchEmptyIllustration : MicroAppEmptyIllustration

	return (
		<ScrollArea
			viewportRef={scrollContainerRef}
			viewportClassName="[&>div]:!block [&>div]:h-full"
			className="absolute inset-0 h-full min-h-0 w-full overflow-hidden bg-mobile-background"
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
							onCreated={handleOpenApp}
							onFocusChange={setPromptFocused}
							mobile
						/>
					</motion.div>
				</div>
			</section>

			<main className="px-3 pb-7 pt-6">
				<div className="mb-4 space-y-3 px-1">
					<h2 className="text-lg font-semibold text-foreground">
						{t("microAppsPage.galleryTitle")}
					</h2>
					<div className="relative">
						<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={keyword}
							onChange={(event) => setKeyword(event.target.value)}
							placeholder={t("microAppsPage.searchPlaceholder")}
							className="h-9 pl-9"
							data-testid="micro-apps-mobile-search"
						/>
					</div>
					<Tabs
						value={scope}
						onValueChange={(value) => setScope(value as MicroAppListScope)}
					>
						<TabsList className="grid h-9 w-full grid-cols-3 rounded-xl">
							<TabsTrigger value="all" data-testid="micro-apps-mobile-scope-all">
								{t("microAppsPage.scopeAll")}
							</TabsTrigger>
							<TabsTrigger
								value="created"
								data-testid="micro-apps-mobile-scope-created"
							>
								{t("microAppsPage.scopeCreated")}
							</TabsTrigger>
							<TabsTrigger
								value="collaborated"
								data-testid="micro-apps-mobile-scope-collaborated"
							>
								{t("microAppsPage.scopeCollaborated")}
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				{loading ? <MobileGridLoading /> : null}

				{!loading && error ? (
					<MicroAppLoadErrorState
						title={t("microAppsPage.errorTitle")}
						description={t("microAppsPage.errorDescription")}
						actionLabel={t("microAppsPage.refresh")}
						onRetry={refresh}
						mobile
					/>
				) : null}

				{!loading && !error && apps.length === 0 ? (
					<div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-border/70 bg-muted/[0.08] px-6 py-7 text-center">
						<EmptyIllustration size="sm" />
						<div className="space-y-1">
							<p className="text-base font-medium text-foreground">
								{keyword
									? t("microAppsPage.noSearchResults")
									: t("microAppsPage.emptyTitle")}
							</p>
							<p className="text-sm text-muted-foreground">
								{keyword
									? t("microAppsPage.noSearchResultsDescription")
									: t("microAppsPage.emptyDescription")}
							</p>
						</div>
					</div>
				) : null}

				{!loading && !error && apps.length > 0 ? (
					<div className="grid grid-cols-2 gap-3" data-testid="micro-apps-mobile-list">
						{apps.map((app) => (
							<MicroAppCard
								key={app.app_id}
								id={app.app_id}
								title={app.app_name || t("project.unnamedProject")}
								description={app.app_description}
								meta={
									app.updated_at
										? formatAppTime(app.updated_at)
										: t("microAppsPage.draftBadge")
								}
								coverUrl={app.cover_url}
								statusLabel={
									app.publish_status === "published"
										? t("microAppsPage.statusPublished")
										: t("microAppsPage.statusUnpublished")
								}
								onClick={() => handleOpenApp(app.app_id)}
								testId={`micro-apps-mobile-app-${app.app_id}`}
							/>
						))}
					</div>
				) : null}

				{!loading && !error && hasMore ? (
					<div className="mt-6 flex justify-center">
						<Button
							type="button"
							variant="outline"
							onClick={loadMore}
							disabled={loadingMore}
							data-testid="micro-apps-mobile-load-more"
						>
							{loadingMore ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
							{t("microAppsPage.loadMore")}
						</Button>
					</div>
				) : null}
			</main>
		</ScrollArea>
	)
}
