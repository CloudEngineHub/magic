import type { CollaboratorPermission } from "@/pages/superMagic/types/collaboration"
import {
	canManageProject,
	isEditable,
	isReadOnlyProject,
} from "@/pages/superMagic/utils/permission"

export function shouldShowCrewKnowledgeBaseEntry(role?: CollaboratorPermission) {
	return canManageProject(role) || isEditable(role) || isReadOnlyProject(role)
}
