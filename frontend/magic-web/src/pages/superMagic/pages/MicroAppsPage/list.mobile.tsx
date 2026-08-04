import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Loader2, Search } from "lucide-react"
import type { MicroAppListScope } from "@/apis/modules/superMagic"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import {
	MicroAppEmptyIllustration,
	MicroAppSearchEmptyIllustration,
} from "@/pages/superMagic/components/MicroAppStateIllustration"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import MicroAppCard from "./components/MicroAppCard"
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

export default function MicroAppsListPageMobile() {
	const { t } = useTranslation("super")
	const navigate = useNavigate({ fallbackRoute: { name: RouteName.MicroApps } })
	const {
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
		<div
			className="absolute inset-0 flex h-full min-h-0 w-full flex-col overflow-hidden bg-mobile-background"
			data-testid="micro-apps-list-page-mobile"
		>
			<header className="mobile-page-header shrink-0 border-b border-border/60">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-9 shrink-0"
					onClick={() =>
						navigate({
							delta: -1,
							viewTransition: { type: "slide", direction: "right" },
						})
					}
					aria-label={t("microAppsPage.backToCreate")}
					data-testid="micro-apps-mobile-list-back"
				>
					<ArrowLeft className="size-[18px]" aria-hidden />
				</Button>
				<h1 className="min-w-0 flex-1 truncate px-2 text-center text-[17px] font-medium leading-6 text-foreground">
					{t("microAppsPage.galleryTitle")}
				</h1>
				<div className="size-9 shrink-0" aria-hidden />
			</header>

			<ScrollArea
				viewportClassName="[&>div]:!block"
				className="min-h-0 flex-1"
				data-testid="micro-apps-list-scroll-area"
			>
				<main className="px-3 pb-7 pt-4">
					<div className="mb-4 space-y-3 px-1">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={keyword}
								onChange={(event) => setKeyword(event.target.value)}
								placeholder={t("microAppsPage.searchPlaceholder")}
								className="h-10 rounded-xl pl-9"
								data-testid="micro-apps-mobile-search"
							/>
						</div>
						<Tabs
							value={scope}
							onValueChange={(value) => setScope(value as MicroAppListScope)}
						>
							<TabsList className="grid h-10 w-full grid-cols-3 rounded-xl">
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
						<div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-border/70 bg-muted/[0.08] px-6 py-7 text-center">
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
						<div
							className="grid grid-cols-2 gap-3"
							data-testid="micro-apps-mobile-list"
						>
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
								{loadingMore ? (
									<Loader2 className="mr-2 size-4 animate-spin" />
								) : null}
								{t("microAppsPage.loadMore")}
							</Button>
						</div>
					) : null}
				</main>
			</ScrollArea>
		</div>
	)
}
