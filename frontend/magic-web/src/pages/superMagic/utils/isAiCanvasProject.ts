import { TopicMode } from "../pages/Workspace/TopicMode"
import type { ProjectListItem } from "../pages/Workspace/types"

/** AI canvas projects live in the ai-canvas workspace and render the canvas-only project layout. */
export function isAiCanvasProject(project?: Pick<ProjectListItem, "project_mode"> | null): boolean {
	return project?.project_mode === TopicMode.AiCanvas
}
