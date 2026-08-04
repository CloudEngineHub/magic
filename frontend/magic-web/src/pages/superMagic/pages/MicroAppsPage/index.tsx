import { lazy, Suspense, useCallback, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { Loader2, Search } from "lucide-react"
import type { MicroAppListScope } from "@/apis/modules/superMagic"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { useIsMobile } from "@/hooks/useIsMobile"
import {
	MicroAppEmptyIllustration,
	MicroAppSearchEmptyIllustration,
} from "@/pages/superMagic/components/MicroAppStateIllustration"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import MicroAppCard from "./components/MicroAppCard"
import MicroAppCreatePrompt from "./components/MicroAppCreatePrompt"
import MicroAppFloatingBackdrop from "./components/MicroAppFloatingBackdrop"
import MicroAppHeroTitle from "./components/MicroAppHeroTitle"
import MicroAppKeyboardCable from "./components/MicroAppKeyboardCable"
import MicroAppListActionDialogs from "./components/MicroAppListActionDialogs"
import MicroAppLoadErrorState from "./components/MicroAppLoadErrorState"
import { useMicroAppListItemActions } from "./hooks/useMicroAppListItemActions"
import { useMicroAppsPage } from "./hooks/useMicroAppsPage"

const MicroAppsPageMobile = lazy(() => import("./index.mobile"))
const MicroAppsListPageMobile = lazy(() => import("./list.mobile"))

function formatAppTime(value: string | null | undefined): string {
	if (!value) return ""
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function EmptyState({
	title,
	description,
	searching,
}: {
	title: string
	description: string
	searching: boolean
}) {
	const Illustration = searching ? MicroAppSearchEmptyIllustration : MicroAppEmptyIllustration

	return (
		<div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-border/70 bg-muted/[0.08] px-6 py-8 text-center">
			<Illustration size="md" />
			<div className="space-y-1">
				<p className="text-sm font-semibold text-foreground">{title}</p>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
		</div>
	)
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

function MicroAppsPageDesktop() {
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
		renameApp,
		deleteApp,
	} = useMicroAppsPage()
	const itemActions = useMicroAppListItemActions({ renameApp, deleteApp })
	const [promptFocused, setPromptFocused] = useState(false)
	const reduceMotion = Boolean(useReducedMotion())
	const [keyboardConnectorReady, setKeyboardConnectorReady] = useState(reduceMotion)
	// 线缆需要标题中的可见标点作为起点；英文标题没有该锚点时不渲染装饰线。
	const keyboardConnectorVisible = /[，,]$/u.test(t("microAppsPage.heroTitlePrefix"))
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const heroRef = useRef<HTMLElement>(null)
	const heroContentRef = useRef<HTMLDivElement>(null)
	const cableStartRef = useRef<HTMLSpanElement>(null)
	const cableEndRef = useRef<HTMLSpanElement>(null)

	const handleOpenApp = useCallback(
		(appId: string) => {
			navigate({ name: RouteName.MicroApp, params: { appId } })
		},
		[navigate],
	)

	return (
		<ScrollArea
			viewportRef={scrollContainerRef}
			viewportClassName="[&>div]:!block [&>div]:h-full"
			className="m-2 h-[calc(100%_-_16px)] w-[calc(100%_-_16px)] overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm"
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
				<div
					ref={heroContentRef}
					className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-1 flex-col justify-center px-12 py-14"
				>
					{keyboardConnectorVisible ? (
						<MicroAppKeyboardCable
							containerRef={heroContentRef}
							startRef={cableStartRef}
							endRef={cableEndRef}
							active={promptFocused}
							ready={keyboardConnectorReady}
						/>
					) : null}
					<MicroAppHeroTitle
						active={promptFocused}
						connectorRef={keyboardConnectorVisible ? cableStartRef : undefined}
					/>
					<motion.p
						className="text-[#172037]/62 relative z-10 mx-auto mt-6 max-w-3xl text-pretty text-center text-[17px] leading-7 dark:text-white/55"
						initial={reduceMotion ? false : { opacity: 0, y: 14 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
					>
						{t("microAppsPage.heroDescription")}
					</motion.p>
					<motion.div
						className="relative z-10 mx-auto mt-12 w-full max-w-4xl text-left"
						initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
						onAnimationComplete={() => setKeyboardConnectorReady(true)}
					>
						<MicroAppCreatePrompt
							workspace={workspace}
							onCreated={handleOpenApp}
							onFocusChange={setPromptFocused}
							keyboardPortRef={cableEndRef}
							keyboardConnectorReady={keyboardConnectorReady}
							keyboardConnectorVisible={keyboardConnectorVisible}
						/>
					</motion.div>
				</div>
			</section>

			<main className="mx-auto w-full max-w-[1320px] px-6 py-10">
				<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
					<div>
						<h2 className="text-xl font-semibold tracking-tight text-foreground">
							{t("microAppsPage.galleryTitle")}
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("microAppsPage.galleryDescription")}
						</p>
					</div>
					<div className="flex flex-wrap items-center justify-end gap-3">
						<div className="relative w-64">
							<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={keyword}
								onChange={(event) => setKeyword(event.target.value)}
								placeholder={t("microAppsPage.searchPlaceholder")}
								className="h-9 pl-9"
								data-testid="micro-apps-search"
							/>
						</div>
						<Tabs
							value={scope}
							onValueChange={(value) => setScope(value as MicroAppListScope)}
						>
							<TabsList className="grid w-[320px] grid-cols-3 rounded-xl">
								<TabsTrigger value="all" data-testid="micro-apps-scope-all">
									{t("microAppsPage.scopeAll")}
								</TabsTrigger>
								<TabsTrigger value="created" data-testid="micro-apps-scope-created">
									{t("microAppsPage.scopeCreated")}
								</TabsTrigger>
								<TabsTrigger
									value="collaborated"
									data-testid="micro-apps-scope-collaborated"
								>
									{t("microAppsPage.scopeCollaborated")}
								</TabsTrigger>
							</TabsList>
						</Tabs>
					</div>
				</div>

				{loading ? <MicroAppsGridLoading /> : null}

				{!loading && error ? (
					<MicroAppLoadErrorState
						title={t("microAppsPage.errorTitle")}
						description={t("microAppsPage.errorDescription")}
						actionLabel={t("microAppsPage.refresh")}
						onRetry={refresh}
					/>
				) : null}

				{!loading && !error && apps.length === 0 ? (
					<EmptyState
						searching={Boolean(keyword)}
						title={
							keyword
								? t("microAppsPage.noSearchResults")
								: t("microAppsPage.emptyTitle")
						}
						description={
							keyword
								? t("microAppsPage.noSearchResultsDescription")
								: t("microAppsPage.emptyDescription")
						}
					/>
				) : null}

				{!loading && !error && apps.length > 0 ? (
					<div
						className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
						data-testid="micro-apps-list"
					>
						{apps.map((app) => (
							<MicroAppCard
								key={app.app_id}
								id={app.app_id}
								title={app.app_name || t("project.unnamedProject")}
								description={app.app_description}
								meta={
									app.updated_at
										? t("microAppsPage.updatedAt", {
												date: formatAppTime(app.updated_at),
											})
										: t("microAppsPage.draftBadge")
								}
								coverUrl={app.cover_url}
								statusLabel={
									app.publish_status === "published"
										? t("microAppsPage.statusPublished")
										: t("microAppsPage.statusUnpublished")
								}
								onClick={() => handleOpenApp(app.app_id)}
								onOpenInNewWindow={() => itemActions.openInNewWindow(app)}
								onRename={() => itemActions.openRename(app)}
								onDelete={() => itemActions.openDelete(app)}
								testId={`micro-apps-app-${app.app_id}`}
							/>
						))}
					</div>
				) : null}

				{!loading && !error && hasMore ? (
					<div className="mt-8 flex justify-center">
						<Button
							type="button"
							variant="outline"
							onClick={loadMore}
							disabled={loadingMore}
							data-testid="micro-apps-load-more"
						>
							{loadingMore ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
							{t("microAppsPage.loadMore")}
						</Button>
					</div>
				) : null}
			</main>
			<MicroAppListActionDialogs
				renameTarget={itemActions.renameTarget}
				deleteTarget={itemActions.deleteTarget}
				renaming={itemActions.renaming}
				deleting={itemActions.deleting}
				onCloseRename={itemActions.closeRename}
				onCloseDelete={itemActions.closeDelete}
				onConfirmRename={itemActions.confirmRename}
				onConfirmDelete={itemActions.confirmDelete}
			/>
		</ScrollArea>
	)
}

interface MicroAppsPageProps {
	mobileView?: "home" | "list"
}

export default function MicroAppsPage({ mobileView = "home" }: MicroAppsPageProps) {
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
				{mobileView === "list" ? <MicroAppsListPageMobile /> : <MicroAppsPageMobile />}
			</Suspense>
		)
	}

	return <MicroAppsPageDesktop />
}
