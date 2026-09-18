import { track } from "@/services/analytics"
import { ResourceType } from "../types"

export type ContentSharedType = "topic" | "project" | "file"

/**
 * Maps the share request onto the analytics content_type. Existing project-share
 * screens submit FileCollection with share_project=true, which is semantically a project share.
 */
export function resolveContentSharedType(
	resourceType: number,
	options?: { shareProject?: boolean },
): ContentSharedType | null {
	if (options?.shareProject) return "project"

	switch (resourceType) {
		case ResourceType.Topic:
			return "topic"
		case ResourceType.Project:
			return "project"
		case ResourceType.FileCollection:
		case ResourceType.File:
			return "file"
		default:
			return null
	}
}

interface ContentSharedInput {
	resourceId?: string | null
	resourceType: number
	shareProject?: boolean
}

/** Reports a successful user-initiated share action. */
export function trackContentShared(input: ContentSharedInput): void {
	const contentId = input.resourceId?.trim()
	if (!contentId) return

	const contentType = resolveContentSharedType(input.resourceType, {
		shareProject: input.shareProject,
	})
	if (!contentType) return

	track("content_shared", {
		content_type: contentType,
		content_id: contentId,
	})
}

/** Reports content_shared only after a successful create, never on edit/failure. */
export function trackContentSharedIfCreated(
	input: ContentSharedInput & { created: boolean },
): void {
	if (!input.created) return
	trackContentShared(input)
}
