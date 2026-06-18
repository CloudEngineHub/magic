import type { HttpClient } from "@/apis/core/HttpClient"
import { genRequestUrl } from "@/utils/http"
import type { QueryAudioProjectsParams, QueryAudioProjectsResponse } from "@/types/audioProject"
import type { CreatedProject } from "@/pages/superMagic/pages/Workspace/types"

export interface BatchMoveProjectsParams {
	project_ids: string[]
	target_workspace_id: string
}

export interface CreateAudioProjectParams {
	project_name: string
	workspace_id?: string
	source: "app" | "device" | "h5" | "pc"
	device_id?: string
	is_hidden?: boolean
	task_key: string
	auto_summary?: boolean
	model_id?: string
	audio_source: "recorded" | "imported"
}

/** Builds REST helpers for PC audio recording project list queries */
export const generateAudioProjectsApi = (fetch: HttpClient) => ({
	/**
	 * Query audio/summary projects for the recordings list page.
	 * Endpoint: POST /api/v1/super-agent/audio-projects/queries
	 */
	queryAudioProjects(params: QueryAudioProjectsParams) {
		return fetch.post<QueryAudioProjectsResponse>(
			genRequestUrl("/api/v1/super-agent/audio-projects/queries"),
			params,
			// TODO: remove this config after backend handle it
			{ parseJsonLargeIntAsString: true },
		)
	},

	/** Reads the number of audio projects without a workspace group */
	getUngroupedAudioProjectsCount() {
		return fetch.get<{ count: number }>(
			genRequestUrl("/api/v1/super-agent/audio-projects/ungrouped/count"),
		)
	},

	/** Moves audio projects to another workspace group in one backend request */
	batchMoveProjects(params: BatchMoveProjectsParams) {
		return fetch.post<void>(genRequestUrl("/api/v1/super-agent/projects/batch-move"), params)
	},

	/**
	 * Creates a new audio recording and summary project.
	 * Endpoint: POST /api/v1/super-agent/audio-projects
	 */
	createAudioProject(params: CreateAudioProjectParams) {
		return fetch.post<CreatedProject>(
			genRequestUrl("/api/v1/super-agent/audio-projects"),
			params,
		)
	},
})
