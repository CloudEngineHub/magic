import { useEffect } from "react"

import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import type { ProjectFilesStore } from "@/stores/projectFiles"

/** 同步项目元数据；文件状态由页面级 Store 的生命周期统一清理。 */
export function useMicroAppSelectedProjectSync(
	projectFilesStore: ProjectFilesStore,
	selectedProject: ProjectListItem | null,
) {
	useEffect(() => {
		projectFilesStore.setSelectedProject(selectedProject)
	}, [projectFilesStore, selectedProject])
}
