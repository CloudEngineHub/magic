import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"
import { useDebounce, useThrottle } from "ahooks"
import { Check, ChevronDown, Loader2, Plus, RefreshCw } from "lucide-react"
import { reaction } from "mobx"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { FUNCTION_PERMISSION_CODE } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import { Skills } from "@/enhance/lucide-react"
import { useFunctionPermission } from "@/hooks/useFunctionPermission"
import { cn } from "@/utils/cn"
import { configStore } from "@/models/config"
import SkillActionDropdown from "@/pages/superMagic/components/SkillActionDropdown"
import { SkillDetailDialog } from "@/pages/superMagic/components/SkillDetailDialog"
import { useAutoLoadMoreSentinel } from "@/pages/superMagic/hooks/useAutoLoadMoreSentinel"
import { useDelayedVisibility } from "@/pages/superMagic/hooks/useDelayedVisibility"
import { useSkillCreateMenuItems } from "@/pages/superMagic/hooks/useSkillCreateMenuItems"
import MarketStickyHeader from "@/pages/superMagic/pages/CrewMarket/components/MarketStickyHeader"
import SearchBar from "@/pages/superMagic/pages/CrewMarket/components/SearchBar"
import {
	MY_SKILLS_INITIAL_TAB_QUERY_KEY,
	MY_SKILLS_PUBLISH_SKILL_CODE_QUERY_KEY,
	MY_SKILLS_TAB_VALUES,
} from "@/pages/superMagic/pages/MySkillsPage/route-state"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import type { StoreSkillView } from "@/services/skills/SkillsService"
import { StoreSkillsStore } from "../stores/store-skills"
import SkillCard from "./SkillCard"
import SkillCategoryFilter from "./SkillCategoryFilter"

const SKILLS_SEARCH_DEBOUNCE_MS = 300
const SKILLS_SEARCH_THROTTLE_MS = 400

interface SkillsLibraryProps {
	hideMarketingHeadline?: boolean
	skillGridClassName?: string
	scrollViewportRef?: RefObject<HTMLDivElement | null>
}

function SkillsLibrary({
	hideMarketingHeadline = false,
	skillGridClassName,
	scrollViewportRef,
}: SkillsLibraryProps) {
	const { t } = useTranslation("crew/market")
	const navigate = useNavigate()
	const skillsStore = useMemo(() => new StoreSkillsStore(), [])
	const { isAllowed: canCreateSkill } = useFunctionPermission(
		FUNCTION_PERMISSION_CODE.SkillCreate,
	)

	const [searchQuery, setSearchQuery] = useState("")
	const [isSearchComposing, setIsSearchComposing] = useState(false)
	const lastSubmittedSearchRef = useRef<string | null>(null)
	const [selectedSkill, setSelectedSkill] = useState<StoreSkillView | null>(null)
	const debouncedSearchQuery = useDebounce(searchQuery, { wait: SKILLS_SEARCH_DEBOUNCE_MS })
	const throttledSearchQuery = useThrottle(debouncedSearchQuery, {
		wait: SKILLS_SEARCH_THROTTLE_MS,
	})
	const gridClass = skillGridClassName ?? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
	const hasActiveFilters =
		Boolean(searchQuery.trim()) ||
		Boolean(skillsStore.keyword) ||
		skillsStore.categoryIds.length > 0 ||
		skillsStore.publisherType != null ||
		skillsStore.isFeatured != null
	useEffect(() => () => skillsStore.reset(), [skillsStore])

	useEffect(() => {
		void skillsStore.fetchFeaturedSkills()
		void skillsStore.fetchCategories()
	}, [skillsStore])

	useEffect(() => {
		return reaction(
			() => configStore.i18n.displayLanguage,
			() => {
				skillsStore.refreshAfterLanguageChange()
			},
		)
	}, [skillsStore])

	// Debounced search; skip while IME is composing (CJK input).
	useEffect(() => {
		if (isSearchComposing) return
		const keyword = throttledSearchQuery.trim()
		if (lastSubmittedSearchRef.current === keyword) {
			lastSubmittedSearchRef.current = null
			return
		}
		void skillsStore.fetchSkills({ keyword: keyword || undefined, page: 1 })
	}, [skillsStore, throttledSearchQuery, isSearchComposing])

	const handleAutoLoadMore = useCallback(() => {
		void skillsStore.loadMore()
	}, [skillsStore])
	const sentinelRef = useAutoLoadMoreSentinel({
		rootRef: scrollViewportRef,
		disabled: skillsStore.loading || skillsStore.loadingMore || !skillsStore.hasMore,
		onLoadMore: handleAutoLoadMore,
	})
	const shouldShowLoadingMoreIndicator = useDelayedVisibility({
		visible: skillsStore.loadingMore,
	})

	const handleAdd = useCallback(
		(id: string) => {
			void skillsStore.addSkill(id).catch(() => {
				toast.error(t("skillsLibrary.addFailed"))
			})
		},
		[skillsStore, t],
	)

	const handleRefreshFeatured = useCallback(() => {
		void skillsStore.fetchNextFeaturedSkills()
	}, [skillsStore])

	const handleOpenDetail = useCallback((skill: StoreSkillView) => {
		setSelectedSkill(skill)
	}, [])

	function handleMySkills() {
		navigate({ name: RouteName.MySkills })
	}

	const handleSearch = useCallback(
		(query?: string) => {
			if (isSearchComposing) return
			const keyword = (query ?? searchQuery).trim()
			lastSubmittedSearchRef.current = keyword
			void skillsStore.fetchSkills({ keyword: keyword || undefined, page: 1 })
		},
		[isSearchComposing, searchQuery, skillsStore],
	)
	const onSearchCompositionStart = useCallback(() => setIsSearchComposing(true), [])
	const onSearchCompositionEnd = useCallback(() => setIsSearchComposing(false), [])

	const createSkillMenuItems = useSkillCreateMenuItems({
		createViaChatTestId: "skills-create-via-chat",
		importSkillTestId: "skills-import-skill",
	})
	const selectedSkillId = selectedSkill?.id
	const selectedSkillStatus = selectedSkill?.status
	const selectedSkillNeedUpgrade = selectedSkill?.needUpgrade ?? false
	const isSelectedSkillAdding = selectedSkillId
		? skillsStore.isAddingSkill(selectedSkillId)
		: false
	const detailPrimaryAction = useMemo(
		() =>
			selectedSkillId
				? {
						label: isSelectedSkillAdding
							? t("skillsLibrary.adding")
							: selectedSkillStatus === "added"
								? selectedSkillNeedUpgrade
									? t("skillsLibrary.upgrade")
									: t("skillsLibrary.added")
								: t("skillsLibrary.addToMySkills"),
						onClick: async () => {
							if (selectedSkillStatus === "added") {
								if (selectedSkillNeedUpgrade)
									await skillsStore.upgradeSkill(selectedSkillId)
								return
							}

							await skillsStore.addSkill(selectedSkillId)
						},
						onError: () => toast.error(t("skillsLibrary.actionFailed")),
						disabled:
							isSelectedSkillAdding ||
							(selectedSkillStatus === "added" && !selectedSkillNeedUpgrade),
						testId: "skill-detail-dialog-primary-action",
					}
				: undefined,
		[
			isSelectedSkillAdding,
			selectedSkillId,
			selectedSkillNeedUpgrade,
			selectedSkillStatus,
			skillsStore,
			t,
		],
	)

	return (
		<div className="flex min-w-0 flex-col gap-5 sm:gap-6" data-testid="skills-library">
			<SkillDetailDialog
				open={selectedSkill != null}
				onOpenChange={(nextOpen) => {
					if (nextOpen) return
					setSelectedSkill(null)
				}}
				skillCode={selectedSkill?.skillCode ?? null}
				detailSource="market"
				skillSummary={selectedSkill}
				primaryAction={detailPrimaryAction}
			/>
			<header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				{hideMarketingHeadline ? null : (
					<div className="flex min-w-0 flex-1 flex-col gap-2.5">
						<h1 className="break-words text-2xl font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-3xl">
							{t("skillsLibrary.title")}
						</h1>
						<p className="max-w-2xl break-words text-sm text-muted-foreground">
							{t("skillsLibrary.subtitle")}
						</p>
					</div>
				)}

				<div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:justify-end">
					<Button
						variant="outline"
						className="h-9 flex-1 gap-2 bg-background shadow-xs sm:flex-none"
						onClick={handleMySkills}
						data-testid="skills-library-my-skills-button"
					>
						<Skills className="size-4" />
						{t("skillsLibrary.mySkills")}
					</Button>

					{canCreateSkill ? (
						<SkillActionDropdown
							createMenuItems={createSkillMenuItems}
							onImportSuccess={(result) =>
								navigate({
									name: RouteName.MySkills,
									query: {
										[MY_SKILLS_INITIAL_TAB_QUERY_KEY]:
											MY_SKILLS_TAB_VALUES.createdByMe,
										[MY_SKILLS_PUBLISH_SKILL_CODE_QUERY_KEY]: result.skill_code,
									},
								})
							}
							promptPublishAfterImport
							placement="bottomRight"
							overlayClassName="w-80"
						>
							<span>
								<Button
									className="h-9 flex-1 gap-2 shadow-xs sm:flex-none"
									data-testid="skills-library-create-button"
								>
									<Plus className="size-4" />
									{t("skillsLibrary.createSkill")}
									<ChevronDown className="size-4 opacity-70" />
								</Button>
							</span>
						</SkillActionDropdown>
					) : null}
				</div>
			</header>

			<MarketStickyHeader
				className="py-1.5 sm:py-2"
				scrollViewportRef={scrollViewportRef}
				data-testid="skills-library-sticky-header"
			>
				<SearchBar
					value={searchQuery}
					onChange={setSearchQuery}
					onSearch={handleSearch}
					onCompositionStart={onSearchCompositionStart}
					onCompositionEnd={onSearchCompositionEnd}
					placeholder={t("skillsLibrary.aiSearchPlaceholder")}
					enableSearchSubmit
					data-testid="skills-library-search-bar"
				/>
			</MarketStickyHeader>

			{skillsStore.featuredLoading ||
			skillsStore.featuredError ||
			skillsStore.featuredList.length > 0 ? (
				<section className="flex min-w-0 flex-col" data-testid="featured-skills-section">
					<div className="flex items-end justify-between border-b border-border">
						<h2 className="border-b-2 border-foreground pb-3 text-xl font-semibold tracking-[-0.025em] text-foreground">
							{t("skillsLibrary.featuredSkills")}
						</h2>
						<Button
							variant="ghost"
							size="sm"
							className="mb-1 h-8 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
							disabled={
								skillsStore.featuredLoading || !skillsStore.canRefreshFeatured
							}
							onClick={handleRefreshFeatured}
							data-testid="featured-skills-refresh"
						>
							<RefreshCw
								className={cn(
									"size-3.5",
									skillsStore.featuredLoading && "animate-spin",
								)}
								aria-hidden
							/>
							{skillsStore.featuredError
								? t("skillsLibrary.retryFeatured")
								: t("skillsLibrary.refreshFeatured")}
						</Button>
					</div>

					{skillsStore.featuredError ? (
						<div
							className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
							role="status"
							data-testid="featured-skills-error"
						>
							{t("skillsLibrary.featuredLoadFailed")}
						</div>
					) : null}

					{skillsStore.featuredLoading && skillsStore.featuredList.length === 0 ? (
						<div
							className="flex items-center justify-center py-10"
							data-testid="featured-skills-loading"
						>
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</div>
					) : skillsStore.featuredList.length > 0 ? (
						<div
							className={cn(gridClass, "mt-4")}
							data-testid="featured-skill-card-grid"
						>
							{skillsStore.featuredList.map((skill) => (
								<SkillCard
									key={`featured-${skill.id}`}
									skill={skill}
									showFeaturedTag
									isAdding={skillsStore.isAddingSkill(skill.id)}
									onAdd={handleAdd}
									onOpenDetail={() => handleOpenDetail(skill)}
								/>
							))}
						</div>
					) : null}
				</section>
			) : null}

			<section className="flex min-w-0 flex-col" data-testid="all-skills-section">
				<SkillCategoryFilter
					categories={skillsStore.categories}
					selectedCategoryIds={skillsStore.categoryIds}
					loading={skillsStore.categoriesLoading}
					error={skillsStore.categoriesError}
					onChange={skillsStore.setCategoryIds}
				/>

				{skillsStore.loading && skillsStore.list.length === 0 ? (
					<div
						className="flex items-center justify-center py-16"
						data-testid="skills-library-loading"
					>
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : skillsStore.isEmpty ? (
					<div
						className="flex items-center justify-center py-16 text-sm text-muted-foreground"
						data-testid="skills-library-empty"
					>
						{hasActiveFilters ? t("noResults") : t("skillsLibrary.noMoreData")}
					</div>
				) : (
					<div className={cn(gridClass, "mt-4")} data-testid="skill-card-grid">
						{skillsStore.list.map((skill) => (
							<SkillCard
								key={skill.id}
								skill={skill}
								isAdding={skillsStore.isAddingSkill(skill.id)}
								onAdd={handleAdd}
								onOpenDetail={() => handleOpenDetail(skill)}
							/>
						))}
					</div>
				)}
			</section>

			<div
				ref={sentinelRef}
				className="h-1 w-full"
				data-testid="skills-library-scroll-sentinel"
			/>

			{shouldShowLoadingMoreIndicator ? (
				<div
					className="flex items-center justify-center py-2"
					data-testid="skills-library-loading-more"
				>
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
				</div>
			) : null}

			{!skillsStore.hasMore && skillsStore.list.length > 0 ? (
				<div
					className="flex items-center justify-center gap-1 py-2 opacity-30"
					data-testid="skills-library-no-more"
				>
					<Check className="size-4" />
					<span className="text-xs">{t("skillsLibrary.noMoreData")}</span>
				</div>
			) : null}
		</div>
	)
}

export default observer(SkillsLibrary)
