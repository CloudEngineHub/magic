import { SuperMagicApi } from "@/apis"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import {
	ProjectStatus,
	type ProjectListItem,
	type Workspace,
} from "@/pages/superMagic/pages/Workspace/types"

/** 微应用列表的 app_id 不是文件项目 ID；缺少 project_id 时先解析源码项目。 */
export async function loadMicroAppProjectPage({
	workspace,
	page,
	pageSize,
	signal,
}: {
	workspace: Workspace
	page: number
	pageSize: number
	signal?: AbortSignal
}): Promise<{ list: ProjectListItem[]; total: number }> {
	signal?.throwIfAborted()
	const response = await SuperMagicApi.getMicroApps({
		page,
		page_size: pageSize,
		scope: "created",
	})
	signal?.throwIfAborted()
	const list = await Promise.all(
		response.list.map(async (app): Promise<ProjectListItem> => {
			const detail = app.project_id
				? undefined
				: await SuperMagicApi.getMicroAppProject(app.app_id)
			signal?.throwIfAborted()
			const projectId = app.project_id || detail?.project_id
			if (!projectId) throw new Error("Micro app source project is unavailable")
			return {
				project_status: ProjectStatus.WAITING,
				project_mode: TopicMode.MicroApp,
				workspace_id: workspace.id,
				workspace_name: workspace.name,
				work_dir: "",
				current_topic_id: "",
				current_topic_status: "",
				created_at: "",
				updated_at: app.updated_at || "",
				tag: "",
				user_role: app.user_role,
				...detail?.project,
				id: projectId,
				project_name: app.app_name,
			}
		}),
	)
	return { list, total: response.total }
}
