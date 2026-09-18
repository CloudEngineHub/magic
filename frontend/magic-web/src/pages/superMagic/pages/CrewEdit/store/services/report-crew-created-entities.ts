import { takePendingEntityCreation } from "@/services/analytics"
import { trackProjectCreated } from "@/pages/superMagic/services/trackCreatedEntities"
import type { ProjectListItem, Topic } from "../../../Workspace/types"

interface ReportCrewCreatedEntitiesParams {
	crewCode: string
	project: ProjectListItem | null
	topics: Topic[]
}

/**
 * Completes creation analytics after the Crew edit bootstrap has resolved the
 * real project/topic ids that are absent from the create-agent response.
 */
export async function reportPendingCrewCreatedEntities({
	crewCode,
	project,
	topics,
}: ReportCrewCreatedEntitiesParams): Promise<boolean> {
	if (!project) return false
	const initialTopic = topics.find((topic) => topic.id === project.current_topic_id) ?? topics[0]
	if (!project.id?.trim() || !initialTopic?.id?.trim()) return false
	const pendingEntityCreation = await takePendingEntityCreation({
		scene: "crew",
		resourceCode: crewCode,
	})
	if (!pendingEntityCreation) return false

	trackProjectCreated({ project, topic: initialTopic }, project.workspace_id, "crew")
	return true
}
