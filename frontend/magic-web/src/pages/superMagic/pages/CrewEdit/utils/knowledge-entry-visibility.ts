import type { CollaboratorPermission } from "@/pages/superMagic/types/collaboration"
import { isOwner, isReadOnlyProject } from "@/pages/superMagic/utils/permission"

export function shouldShowCrewKnowledgeBaseEntry(role?: CollaboratorPermission) {
	return isOwner(role) || isReadOnlyProject(role)
}
