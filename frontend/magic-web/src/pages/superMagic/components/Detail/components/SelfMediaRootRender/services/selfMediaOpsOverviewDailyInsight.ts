import type {
	SelfMediaOpsOverview,
	SelfMediaOpsOverviewAction,
	SelfMediaOpsOverviewActionKey,
} from "./selfMediaOpsOverview"
import type { SelfMediaHomeDailyInsightPayload } from "./selfMediaHomeInsight"

export type DisplaySelfMediaOpsOverviewAction = SelfMediaOpsOverviewAction & {
	dailyInsightId?: string
	targetTitle?: string
}

interface BuildDailyInsightDisplayActionsOptions {
	dailyInsight?: SelfMediaHomeDailyInsightPayload | null
	overview: SelfMediaOpsOverview
	dismissedDailyInsightActionIds: string[]
}

export function buildDailyInsightDisplayActions({
	dailyInsight,
	overview,
	dismissedDailyInsightActionIds,
}: BuildDailyInsightDisplayActionsOptions): DisplaySelfMediaOpsOverviewAction[] {
	if (!dailyInsight?.actions?.length) return []

	return dailyInsight.actions
		.filter((action) => !dismissedDailyInsightActionIds.includes(action.id))
		.map((action, index) => {
			const target = resolveDailyInsightActionTarget(action.kind, overview, action.postKey)
			return {
				key: action.kind,
				postKey: target?.postKey,
				targetTitle: action.targetTitle || target?.title,
				title: action.title,
				description: action.description,
				cta: action.cta,
				priority: 80 + index,
				dailyInsightId: action.id,
			}
		})
}

function resolveDailyInsightActionTarget(
	kind: SelfMediaOpsOverviewActionKey,
	overview: SelfMediaOpsOverview,
	postKey?: string,
) {
	const candidates = [overview.bestPost, overview.weakestPost].filter(Boolean)
	const matched = postKey ? candidates.find((post) => post?.postKey === postKey) : undefined
	if (matched) return matched
	if (kind === "repurpose-best-post") return overview.bestPost
	if (kind === "improve-weak-post") return overview.weakestPost
	return overview.bestPost || overview.weakestPost
}
