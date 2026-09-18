import { trackProjectCreated } from "@/pages/superMagic/services/trackCreatedEntities"
import { takePendingEntityCreation } from "@/services/analytics"
import type { ProjectListItem, Topic } from "../../../Workspace/types"

interface ReportSkillCreatedEntitiesParams {
	skillCode: string
	project: ProjectListItem | null
	topics: Topic[]
}

/**
 * Completes creation analytics after Skill Edit resolves the backing project/topic
 * ids that are intentionally absent from the initial create-skill response.
 */
export async function reportPendingSkillCreatedEntities({
	skillCode,
	project,
	topics,
}: ReportSkillCreatedEntitiesParams): Promise<boolean> {
	if (!project) return false
	const initialTopic = topics.find((topic) => topic.id === project.current_topic_id) ?? topics[0]
	if (!project.id?.trim() || !initialTopic?.id?.trim()) return false
	const pendingEntityCreation = await takePendingEntityCreation({
		scene: "skill",
		resourceCode: skillCode,
	})
	if (!pendingEntityCreation) return false

	trackProjectCreated({ project, topic: initialTopic }, project.workspace_id, "skill")
	return true
}
