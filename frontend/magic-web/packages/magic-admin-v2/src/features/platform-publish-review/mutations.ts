import { useMutation, useQueryClient } from "@tanstack/react-query"
import { publishReviewKeys } from "@magic-admin-v2/features/platform-publish-review/queries"
import type {
	PublishReviewVariant,
	ReviewVersionParams,
} from "@magic-admin-v2/features/platform-publish-review/types"
import { useApis } from "@magic-admin-v2/runtime/context"

export function useReviewAgentVersionMutation(variant: PublishReviewVariant = "platform") {
	const queryClient = useQueryClient()
	const { publishReview } = useApis()

	return useMutation({
		mutationFn: ({ id, values }: { id: string; values: ReviewVersionParams }) =>
			publishReview.reviewAgentVersion(id, values, variant),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: publishReviewKeys.all }),
	})
}

export function useReviewSkillVersionMutation(variant: PublishReviewVariant = "platform") {
	const queryClient = useQueryClient()
	const { publishReview } = useApis()

	return useMutation({
		mutationFn: ({ id, values }: { id: string; values: ReviewVersionParams }) =>
			publishReview.reviewSkillVersion(id, values, variant),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: publishReviewKeys.all }),
	})
}
