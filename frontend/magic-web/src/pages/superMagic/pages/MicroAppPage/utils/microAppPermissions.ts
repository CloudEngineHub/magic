import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { canEditProject } from "@/pages/superMagic/utils/permission"

type MicroAppProjectPermission = Pick<ProjectListItem, "id" | "user_role">

export function canEditMicroAppMetadata(project?: MicroAppProjectPermission | null) {
	if (!project?.id) return false
	return !project.user_role || canEditProject(project.user_role)
}
