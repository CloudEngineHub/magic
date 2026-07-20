import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"

/** Resolve one model catalog for Web and mobile micro-app conversations. */
export function resolveMicroAppModelSelectionMode(): TopicMode {
	return superMagicModeService.resolveModelSelectionMode(TopicMode.MicroApp, TopicMode.Default)
}
