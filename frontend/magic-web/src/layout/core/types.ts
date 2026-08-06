export type WorkspaceMode = "three-column" | "preview-drawer" | "focus-main"
export type WorkspaceDensity = "regular" | "compact" | "short"
export type WorkspacePartId = "files" | "main" | "preview"

export interface WorkspacePartSpec {
	minWidth: number
	priority: number
	fallback: "keep" | "rail" | "drawer"
}

export type WorkspaceSpec = Record<WorkspacePartId, WorkspacePartSpec>

export interface WorkspaceLayoutResult {
	mode: WorkspaceMode
	density: WorkspaceDensity
	visibleParts: WorkspacePartId[]
}
