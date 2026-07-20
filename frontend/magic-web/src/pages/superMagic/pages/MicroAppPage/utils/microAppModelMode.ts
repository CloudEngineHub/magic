import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"

/** Use the micro-app employee catalog whenever it contains any supported model type. */
export function resolveMicroAppModelSelectionMode(): TopicMode {
	return superMagicModeService.resolveModelSelectionMode(TopicMode.MicroApp, TopicMode.Default)
}
