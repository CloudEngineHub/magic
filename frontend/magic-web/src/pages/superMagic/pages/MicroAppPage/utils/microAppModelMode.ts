import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

/** 微应用统一使用 default 模型目录，不再读取微应用员工的模型配置。 */
export function resolveMicroAppModelSelectionMode(): TopicMode {
	return TopicMode.Default
}
