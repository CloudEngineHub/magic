import { useState } from "react"
import { MessageSquareQuote, SearchX } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/shadcn-ui/empty"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { usePersonaResearchStore } from "../context"
import { ResearchOnboardingAnchor } from "../onboarding/onboardingState"
import { countStudyGroups, filterStudies, type StudyGroupFilter } from "../services/studyFilter"
import { resolveStudyStatus } from "../services/studyStatus"
import SectionTitle from "./SectionTitle"
import StudyFilterBar from "./StudyFilterBar"
import StudyListItem from "./StudyListItem"

/** Below this many studies the list is short enough to scan, so search and filter stay hidden. */
const FILTER_MIN_STUDIES = 4

interface StudyListSectionProps {
	onOpen: (topic: Topic) => void
	onDelete: (topic: Topic) => void
	onTrySample: () => void
}

/** "My studies" on the research home: status filter, title search, then the list. */
function StudyListSection({ onOpen, onDelete, onTrySample }: StudyListSectionProps) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const [group, setGroup] = useState<StudyGroupFilter>("all")
	const [keyword, setKeyword] = useState("")

	const studies = store.studies
	const items = studies.map((topic) => ({
		item: topic,
		title: store.studyTitleOf(topic),
		kind: resolveStudyStatus(topic, store.studyFileOf(topic)).kind,
	}))
	const showFilter = studies.length >= FILTER_MIN_STUDIES
	// Filters stay out of play while hidden, so a short list never looks oddly empty.
	const visible = showFilter ? filterStudies(items, group, keyword) : studies
	const isFiltering = showFilter && (group !== "all" || keyword.trim() !== "")
	const clearFilter = () => {
		setGroup("all")
		setKeyword("")
	}

	return (
		<section className="flex flex-col gap-4">
			{/* The onboarding frames the heading row only: the list can be taller than the window,
			    which would leave no room for the step card beside it. */}
			<div
				className="flex flex-wrap items-center justify-between gap-3"
				data-guide-anchor={ResearchOnboardingAnchor.HomeStudies}
			>
				<SectionTitle
					title={t("home.myStudies")}
					hint={
						studies.length === 0
							? undefined
							: isFiltering
								? t("home.filter.count", {
										shown: visible.length,
										total: studies.length,
									})
								: t("home.studiesCount", { count: studies.length })
					}
				/>
				{showFilter ? (
					<StudyFilterBar
						group={group}
						onGroupChange={setGroup}
						counts={countStudyGroups(items.map(({ kind }) => kind))}
						total={studies.length}
						keyword={keyword}
						onKeywordChange={setKeyword}
						className="max-sm:w-full"
					/>
				) : null}
			</div>
			{studies.length === 0 ? (
				<Empty className="rounded-xl border border-dashed border-border py-10">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MessageSquareQuote />
						</EmptyMedia>
						<EmptyTitle>{t("home.emptyTitle")}</EmptyTitle>
						<EmptyDescription>{t("home.noStudies")}</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="outline" size="sm" onClick={onTrySample}>
							{t("home.trySample")}
						</Button>
					</EmptyContent>
				</Empty>
			) : visible.length === 0 ? (
				<Empty className="rounded-xl border border-dashed border-border py-10">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<SearchX />
						</EmptyMedia>
						<EmptyTitle>{t("home.filter.noMatchTitle")}</EmptyTitle>
						<EmptyDescription>{t("home.filter.noMatch")}</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="outline" size="sm" onClick={clearFilter}>
							{t("home.filter.reset")}
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<ul className="flex flex-col divide-y divide-border border-y border-border">
					{visible.map((topic) => (
						<StudyListItem
							key={topic.id}
							topic={topic}
							onOpen={onOpen}
							onDelete={onDelete}
						/>
					))}
				</ul>
			)}
		</section>
	)
}

export default observer(StudyListSection)
