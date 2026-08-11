import { useCallback, useEffect, useMemo, useState } from "react"
import type { RefObject } from "react"
import { useDebounce, useThrottle } from "ahooks"
import { Check, ChevronDown, Loader2, Plus, Search } from "lucide-react"
import { reaction } from "mobx"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { FUNCTION_PERMISSION_CODE } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Skills } from "@/enhance/lucide-react"
import { useFunctionPermission } from "@/hooks/useFunctionPermission"
import { cn } from "@/lib/utils"
import { configStore } from "@/models/config"
import SkillActionDropdown from "@/pages/superMagic/components/SkillActionDropdown"
import { SkillDetailDialog } from "@/pages/superMagic/components/SkillDetailDialog"
import { useAutoLoadMoreSentinel } from "@/pages/superMagic/hooks/useAutoLoadMoreSentinel"
import { useDelayedVisibility } from "@/pages/superMagic/hooks/useDelayedVisibility"
import { useSkillCreateMenuItems } from "@/pages/superMagic/hooks/useSkillCreateMenuItems"
import {
	MY_SKILLS_INITIAL_TAB_QUERY_KEY,
	MY_SKILLS_PUBLISH_SKILL_CODE_QUERY_KEY,
	MY_SKILLS_TAB_VALUES,
} from "@/pages/superMagic/pages/MySkillsPage/route-state"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import type { StoreSkillView } from "@/services/skills/SkillsService"
import { StoreSkillsStore } from "../stores/store-skills"
import SkillCard, { type SkillCardData } from "./SkillCard"

const SKILLS_SEARCH_DEBOUNCE_MS = 300
const SKILLS_SEARCH_THROTTLE_MS = 400
const FEATURED_SKILL_LIMIT = 3

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
	const { t, i18n } = useTranslation("crew/market")
	const navigate = useNavigate()
	const skillsStore = useMemo(() => new StoreSkillsStore(), [])
	const { isAllowed: canCreateSkill } = useFunctionPermission(
		FUNCTION_PERMISSION_CODE.SkillCreate,
	)

	const [searchQuery, setSearchQuery] = useState("")
	const [isSearchComposing, setIsSearchComposing] = useState(false)
	const [selectedSkill, setSelectedSkill] = useState<StoreSkillView | null>(null)
	const debouncedSearchQuery = useDebounce(searchQuery, { wait: SKILLS_SEARCH_DEBOUNCE_MS })
	const throttledSearchQuery = useThrottle(debouncedSearchQuery, {
		wait: SKILLS_SEARCH_THROTTLE_MS,
	})
	const gridClass = skillGridClassName ?? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
	const formattedTotal = useMemo(() => {
		const locale = i18n.language.replace("_", "-")
		return new Intl.NumberFormat(locale).format(skillsStore.total)
	}, [i18n.language, skillsStore.total])
	// The API already sorts featured entries first, but has no dedicated featured pagination.
	// Only expose the featured records from the loaded first page and do not fake rotation.
	const featuredSkills = useMemo(() => {
		if (searchQuery.trim() || skillsStore.keyword) return []
		return skillsStore.list.filter((skill) => skill.isFeatured).slice(0, FEATURED_SKILL_LIMIT)
	}, [searchQuery, skillsStore.keyword, skillsStore.list])

	useEffect(() => () => skillsStore.reset(), [skillsStore])

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

	const handleOpenDetail = useCallback(
		(skill: SkillCardData) => {
			const fromStore = skillsStore.list.find((item) => item.id === skill.id)
			if (fromStore) setSelectedSkill(fromStore)
		},
		[skillsStore],
	)

	function handleMySkills() {
		navigate({ name: RouteName.MySkills })
	}

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
		<div className="flex min-w-0 flex-col gap-8" data-testid="skills-library">
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

			<header className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
				{hideMarketingHeadline ? null : (
					<div className="flex min-w-0 items-center gap-4">
						<h1 className="shrink-0 text-2xl font-semibold tracking-[-0.035em] text-foreground">
							{t("skillsLibrary.title")}
						</h1>
						<p className="border-l border-border pl-4 text-xs text-muted-foreground">
							{t("skillsLibrary.subtitle")}
						</p>
					</div>
				)}

				<div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center xl:max-w-[570px] xl:justify-end">
					<form
						className="relative min-w-0 flex-1 xl:max-w-[320px]"
						onSubmit={(event) => {
							event.preventDefault()
						}}
						data-testid="skills-library-search-bar"
					>
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
						<Input
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							onCompositionStart={() => setIsSearchComposing(true)}
							onCompositionEnd={() => setIsSearchComposing(false)}
							placeholder={t("skillsLibrary.aiSearchPlaceholder")}
							aria-label={t("skillsLibrary.searchAria")}
							className="h-9 rounded-lg border-border bg-muted/40 pl-9 text-sm shadow-none focus-visible:bg-background"
							data-testid="search-bar-input"
						/>
					</form>

					<div className="flex items-center gap-2.5">
						<Button
							variant="outline"
							className="h-9 flex-1 gap-2 bg-background shadow-none sm:flex-none"
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
											[MY_SKILLS_PUBLISH_SKILL_CODE_QUERY_KEY]:
												result.skill_code,
										},
									})
								}
								promptPublishAfterImport
								placement="bottomRight"
								overlayClassName="w-80"
							>
								<span>
									<Button
										className="h-9 flex-1 gap-2 shadow-none sm:flex-none"
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
				</div>
			</header>

			{featuredSkills.length > 0 ? (
				<section
					className="flex min-w-0 flex-col gap-4"
					data-testid="featured-skills-section"
				>
					<h2 className="text-xl font-semibold tracking-[-0.025em] text-foreground">
						{t("skillsLibrary.featuredSkills")}
					</h2>
					<div className={gridClass} data-testid="featured-skill-card-grid">
						{featuredSkills.map((skill) => (
							<SkillCard
								key={`featured-${skill.id}`}
								skill={skill}
								isAdding={skillsStore.isAddingSkill(skill.id)}
								onAdd={handleAdd}
								onOpenDetail={handleOpenDetail}
							/>
						))}
					</div>
				</section>
			) : null}

			<section className="flex min-w-0 flex-col" data-testid="all-skills-section">
				<div className="flex items-end justify-between border-b border-border">
					<h2 className="border-b-2 border-foreground pb-3 text-xl font-semibold tracking-[-0.025em] text-foreground">
						{t("skillsLibrary.allSkills")}
					</h2>
					<span className="pb-3 text-xs text-muted-foreground">
						{skillsStore.total === 1
							? t("skillsLibrary.skillCountOne", {
									count: formattedTotal,
									defaultValue: "共 {{count}} 个技能",
								})
							: t("skillsLibrary.skillCount", {
									count: formattedTotal,
									defaultValue: "共 {{count}} 个技能",
								})}
					</span>
				</div>

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
						{skillsStore.keyword ? t("noResults") : t("skillsLibrary.noMoreData")}
					</div>
				) : (
					<div className={cn(gridClass, "mt-4")} data-testid="skill-card-grid">
						{skillsStore.list.map((skill) => (
							<SkillCard
								key={skill.id}
								skill={skill}
								isAdding={skillsStore.isAddingSkill(skill.id)}
								onAdd={handleAdd}
								onOpenDetail={handleOpenDetail}
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
