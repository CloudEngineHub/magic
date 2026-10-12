import type { ProjectListItem } from "../../pages/Workspace/types"
import { TopicMode } from "../../pages/Workspace/TopicMode"

export type ResourceProjectType = "claw" | "micro-app" | "agent" | "skill"

/** 选择器内特殊项目条目所需的模块元数据，不改变项目列表接口契约。 */
export type ResourceProject = ProjectListItem & {
	resourceType?: ResourceProjectType
	resourceId?: string
	resourceDescription?: string | null
	resourceIcon?: string | null
	resourceCoverUrl?: string | null
	resourceStatus?: string | null
	resourceRole?: string | null
	resourceVersion?: string | null
	resourcePackageName?: string
	resourceTemplateCode?: string | null
	resourceCode?: string | null
	project_id?: string | null
}

export function getResourceProjectType(project: ProjectListItem): ResourceProjectType | undefined {
	switch (project.project_mode) {
		case TopicMode.MagiClaw:
			return "claw"
		case TopicMode.MicroApp:
			return "micro-app"
		case TopicMode.AgentCreator:
		case TopicMode.CustomAgent:
			return "agent"
		case TopicMode.SkillProjectCreator:
		case TopicMode.CustomSkill:
			return "skill"
		default:
			return undefined
	}
}
