import { makeAutoObservable, runInAction } from "mobx"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import type {
    AICardEntry,
    AICardHistoryEntry,
    AICardProjectConfig,
    AICardViewMode,
} from "../types"

/**
 * Parse magic.project.js content to extract config.
 * Uses bracket-matching approach (no eval) for safety.
 */
function parseMagicProjectConfig(content: string): AICardProjectConfig | null {
    const marker = "window.magicProjectConfig"
    const idx = content.indexOf(marker)
    if (idx === -1) return null

    const eqIdx = content.indexOf("=", idx + marker.length)
    if (eqIdx === -1) return null

    let braceStart = -1
    for (let i = eqIdx + 1; i < content.length; i++) {
        if (content[i] === "{") {
            braceStart = i
            break
        }
    }
    if (braceStart === -1) return null

    let depth = 0
    let braceEnd = -1
    for (let i = braceStart; i < content.length; i++) {
        if (content[i] === "{") depth++
        else if (content[i] === "}") {
            depth--
            if (depth === 0) {
                braceEnd = i
                break
            }
        }
    }
    if (braceEnd === -1) return null

    const jsonLike = content.slice(braceStart, braceEnd + 1)
    // Normalize JS object to JSON (handle trailing commas, unquoted keys)
    const normalized = jsonLike
        .replace(/\/\/[^\n]*/g, "") // remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, "") // remove multi-line comments
        .replace(/,(\s*[}\]])/g, "$1") // remove trailing commas
        .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // quote unquoted keys
        .replace(/:\s*'([^']*)'/g, ': "$1"') // single quotes to double

    try {
        return JSON.parse(normalized)
    } catch {
        return null
    }
}

export class AICardStore {
    cards: AICardEntry[] = []
    viewMode: AICardViewMode = "dashboard"
    activeCardId: string | null = null
    /** When viewing a history entry, this holds the history file id */
    activeHistoryFileId: string | null = null
    historyEntries: AICardHistoryEntry[] = []
    loading = true
    error: string | null = null
    projectConfig: AICardProjectConfig | null = null

    private folderFileId: string | undefined
    private attachmentList: any[] | undefined

    constructor() {
        makeAutoObservable(this)
    }

    get activeCard(): AICardEntry | null {
        if (!this.activeCardId) return null
        return this.cards.find((c) => c.id === this.activeCardId) || null
    }

    /** The file ID to render in the detail iframe */
    get detailFileId(): string | undefined {
        return this.activeHistoryFileId || this.activeCard?.latestHtmlFileId
    }

    get hasConfig(): boolean {
        return !!(this.projectConfig?.schedule_id)
    }

    setViewMode(mode: AICardViewMode) {
        this.viewMode = mode
    }

    openCardDetail(cardId: string) {
        this.activeCardId = cardId
        this.activeHistoryFileId = null
        this.viewMode = "detail"
    }

    openHistoryDetail(historyFileId: string) {
        // Use the main card as context, but show history file
        if (this.cards.length > 0) {
            this.activeCardId = this.cards[0].id
        }
        this.activeHistoryFileId = historyFileId
        this.viewMode = "detail"
    }

    goBack() {
        this.viewMode = "dashboard"
        this.activeCardId = null
        this.activeHistoryFileId = null
    }

    async sync(folderFileId?: string, attachmentList?: any[]) {
        this.folderFileId = folderFileId
        this.attachmentList = attachmentList
        await this.loadCards()
    }

    private async loadCards() {
        runInAction(() => {
            this.loading = true
            this.error = null
        })

        try {
            const children = this.findChildren()
            if (!children.length) {
                runInAction(() => {
                    this.cards = []
                    this.loading = false
                })
                return
            }

            // Find magic.project.js to get config
            const configFile = children.find(
                (f: any) => f.file_name === "magic.project.js" && !f.is_directory,
            )

            let projectConfig: AICardProjectConfig | null = null
            if (configFile?.file_id) {
                projectConfig = await this.fetchProjectConfig(configFile.file_id)
            }

            runInAction(() => {
                this.projectConfig = projectConfig
            })

            // Find latest.html
            const latestFile = children.find(
                (f: any) => f.file_name === "latest.html" && !f.is_directory,
            )

            // Find template.html
            const templateFile = children.find(
                (f: any) =>
                    f.file_name === (projectConfig?.template || "template.html") &&
                    !f.is_directory,
            )

            // Build card entry
            const card: AICardEntry = {
                id: this.folderFileId || "default",
                name: projectConfig?.name || "AI Card",
                description: projectConfig?.description || "",
                fileId: this.folderFileId,
                latestHtmlFileId: latestFile?.file_id,
                templateFileId: templateFile?.file_id,
                lastUpdated: projectConfig?.last_generated || latestFile?.updated_at,
                status: projectConfig?.status || "active",
            }

            runInAction(() => {
                this.cards = [card]
                this.historyEntries = this.buildHistoryEntries(children)
                this.loading = false
            })
        } catch (err) {
            runInAction(() => {
                this.error = err instanceof Error ? err.message : "Failed to load AI Card"
                this.loading = false
            })
        }
    }

    private buildHistoryEntries(children: any[]): AICardHistoryEntry[] {
        const historyDir = children.find(
            (f: any) => f.file_name === "history" && f.is_directory,
        )
        if (!historyDir?.children?.length) {
            return []
        }

        return historyDir.children
            .filter((f: any) => f.file_name?.endsWith(".html"))
            .map((f: any) => {
                const name = f.file_name || ""
                // Parse YYYY-MM-DD_HH-mm.html
                const match = name.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})\.html$/)
                const timestamp = match ? `${match[1]}T${match[2]}:${match[3]}:00` : ""
                return {
                    fileId: f.file_id,
                    fileName: name,
                    timestamp,
                    displayTime: match ? `${match[1]} ${match[2]}:${match[3]}` : name,
                }
            })
            .sort(
                (a: AICardHistoryEntry, b: AICardHistoryEntry) =>
                    b.timestamp.localeCompare(a.timestamp),
            )
    }

    private findChildren(): any[] {
        if (!this.attachmentList?.length) return []

        // The folder itself may be in attachmentList
        const folder = this.attachmentList.find(
            (f: any) => f.file_id === this.folderFileId,
        )
        if (folder?.children?.length) return folder.children

        // Or the attachmentList IS the children
        return this.attachmentList
    }

    private async fetchProjectConfig(fileId: string): Promise<AICardProjectConfig | null> {
        try {
            const urls = await getTemporaryDownloadUrl({ file_ids: [fileId] })
            const url = urls?.[0]?.url
            if (!url) return null
            const resp = await fetch(url, { credentials: "omit" })
            if (!resp.ok) return null
            const text = await resp.text()
            return parseMagicProjectConfig(text)
        } catch {
            return null
        }
    }
}
