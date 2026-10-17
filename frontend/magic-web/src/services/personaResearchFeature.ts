import { env, isPrivateDeployment } from "@/utils/env"

/**
 * Whether the AI research (persona research) product entries are available in this deployment.
 *
 * | MAGIC_PERSONA_RESEARCH_ENABLED | SaaS     | Private deployment |
 * | "true"                         | enabled  | enabled            |
 * | "false"                        | disabled | disabled           |
 * | absent or invalid              | enabled  | disabled           |
 *
 * Mirrors the micro-app switch so private deployments opt in explicitly.
 */
export const isPersonaResearchEnabled = (): boolean => {
	const enabled = env("MAGIC_PERSONA_RESEARCH_ENABLED")
	if (enabled === "true") return true
	if (enabled === "false") return false

	return !isPrivateDeployment()
}
