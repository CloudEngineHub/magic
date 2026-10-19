import type { Topic } from "@/pages/superMagic/pages/Workspace/types"

/** Keep the first failure, compensation failures and completed work separately. */
export class ResearchOperationError extends Error {
	constructor(
		readonly stage: "link" | "rename" | "verify" | "delete",
		readonly originalError: unknown,
		readonly progress: {
			topic?: Topic
			markerSaved?: boolean
			deletedTopicIds?: string[]
			filesDeleted?: boolean
			completed?: boolean
		} = {},
		readonly cleanupErrors: unknown[] = [],
	) {
		super(`research_${stage}_incomplete`)
		this.name = "ResearchOperationError"
	}
}
