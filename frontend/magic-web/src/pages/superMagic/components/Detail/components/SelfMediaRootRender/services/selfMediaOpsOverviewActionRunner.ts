import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SelfMediaOpsOverviewAction } from "./selfMediaOpsOverview"

interface ExecuteSelfMediaOpsOverviewActionOptions {
	action: SelfMediaOpsOverviewAction
	postsByPostKey: Map<string, SelfMediaPlatformPostItem>
	onOpenPost: (target: { platform: SelfMediaPlatformPostItem["platform"]; index: number }) => void
	onCreateArticle?: () => void
	onOpenPublishedLinkBinding?: (target: SelfMediaPlatformPostItem) => void
	onPostPublishRefresh?: (target: SelfMediaPlatformPostItem) => Promise<void> | void
	onOpenOpsMetrics?: (target: SelfMediaPlatformPostItem) => void
	onOpenOpsReview?: (target: SelfMediaPlatformPostItem) => void
}

export function executeSelfMediaOpsOverviewAction({
	action,
	postsByPostKey,
	onOpenPost,
	onCreateArticle,
	onOpenPublishedLinkBinding,
	onPostPublishRefresh,
	onOpenOpsMetrics,
	onOpenOpsReview,
}: ExecuteSelfMediaOpsOverviewActionOptions) {
	if (action.key === "plan-next-post") {
		onCreateArticle?.()
		return
	}

	if (!action.postKey) return

	const target = postsByPostKey.get(action.postKey)
	if (!target) return

	if (action.key === "bind-source") {
		if (onOpenPublishedLinkBinding) {
			onOpenPublishedLinkBinding(target)
			return
		}
	}

	if (action.key === "sync-metrics") {
		if (onPostPublishRefresh) {
			void Promise.resolve(onPostPublishRefresh(target))
			return
		}
	}

	if (action.key === "collect-comments") {
		if (onOpenOpsMetrics) {
			onOpenOpsMetrics(target)
			return
		}
	}

	if (action.key === "generate-review") {
		if (onOpenOpsReview) {
			onOpenOpsReview(target)
			return
		}
	}

	onOpenPost({ platform: target.platform, index: target.index })
}
