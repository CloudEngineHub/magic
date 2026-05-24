/** AI Card project config from magic.project.js */
export interface AICardProjectConfig {
    type: "ai-card"
    name: string
    description?: string
    cards: Array<{ file: string; label: string }>
    template?: string
    schedule_id?: string
    prompt?: string
    enabled?: number
    data_source?: string
    last_generated?: string
    generation_count?: number
    status?: "active" | "paused" | "error"
}

/** Single card entry for display */
export interface AICardEntry {
    id: string
    name: string
    description: string
    fileId?: string
    templateFileId?: string
    latestHtmlFileId?: string
    lastUpdated?: string
    status: "active" | "paused" | "error" | "loading"
}

/** History snapshot entry */
export interface AICardHistoryEntry {
    fileId: string
    fileName: string
    timestamp: string
    displayTime: string
}

/** Props for the AICardRootRender component */
export interface AICardRootRenderProps {
    data: {
        file_id?: string
        file_name?: string
        is_directory?: boolean
        children?: any[]
        display_config?: Record<string, unknown>
        initialNavigation?: { activeCardId?: string; initialView?: string }
    }
    attachments?: any[]
    attachmentList?: any[]
    className?: string
    allowEdit?: boolean
    saveEditContent?: (...args: any[]) => Promise<void>
    selectedProject?: { id: string; name?: string }
}

export type AICardViewMode = "dashboard" | "detail" | "config"
