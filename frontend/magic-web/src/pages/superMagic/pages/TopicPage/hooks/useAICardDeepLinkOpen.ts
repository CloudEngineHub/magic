import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import {
	AI_CARD_DEEP_LINK_QUERY_PARAM,
	resolveAICardDeepLinkTarget,
} from "../../../components/Detail/components/AICardRootRender/utils/aiCardDeepLink"

type AICardDeepLinkAttachments = Parameters<typeof resolveAICardDeepLinkTarget>[0]
type AICardDeepLinkTargetFile = NonNullable<ReturnType<typeof resolveAICardDeepLinkTarget>>["file"]

interface UseAICardDeepLinkOpenParams {
	topicId?: string | null
	attachments: AICardDeepLinkAttachments
	scheduleWhenTabsCacheReady: (callback: () => void) => void
	handleFileClickWithPanel: (file: AICardDeepLinkTargetFile) => void
	clearUserSelectDetail: () => void
}

export function useAICardDeepLinkOpen({
	topicId,
	attachments,
	scheduleWhenTabsCacheReady,
	handleFileClickWithPanel,
	clearUserSelectDetail,
}: UseAICardDeepLinkOpenParams) {
	const [searchParams] = useSearchParams()
	const aiCardDeepLinkId = searchParams.get(AI_CARD_DEEP_LINK_QUERY_PARAM)
	const openedAICardDeepLinkRef = useRef<string | null>(null)

	useEffect(() => {
		if (!aiCardDeepLinkId || !topicId) return

		const openKey = `${topicId}:${aiCardDeepLinkId}`
		if (openedAICardDeepLinkRef.current === openKey) return

		const target = resolveAICardDeepLinkTarget(attachments, aiCardDeepLinkId)
		if (!target) return

		openedAICardDeepLinkRef.current = openKey
		clearUserSelectDetail()
		scheduleWhenTabsCacheReady(() => {
			handleFileClickWithPanel(target.file)
		})
	}, [
		aiCardDeepLinkId,
		topicId,
		attachments,
		scheduleWhenTabsCacheReady,
		handleFileClickWithPanel,
		clearUserSelectDetail,
	])
}
