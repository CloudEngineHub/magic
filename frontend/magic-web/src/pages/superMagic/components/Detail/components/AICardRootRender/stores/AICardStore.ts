import { makeAutoObservable, runInAction } from "mobx"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import type {
    AICardEntry,
    AICardHistoryEntry,
    AICardMeta,
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

    get hasConfig(): boolean {
        return !!(this.projectConfig?.prompt && this.projectConfig?.schedule_id)
    }

    setViewMode(mode: AICardViewMode) {
        this.viewMode = mode
    }

    openCardDetail(cardId: string) {
        this.activeCardId = cardId
        this.viewMode = "detail"
    }

    openHistory(cardId: string) {
        this.activeCardId = cardId
        this.viewMode = "history"
        this.loadHistory(cardId)
    }

    goBack() {
        this.viewMode = "dashboard"
        this.activeCardId = null
        this.historyEntries = []
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

            // Find card.meta.json
            const metaFile = children.find(
                (f: any) => f.file_name === "card.meta.json" && !f.is_directory,
            )
            let meta: AICardMeta | null = null
            if (metaFile?.file_id) {
                meta = await this.fetchMeta(metaFile.file_id)
            }

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
                name: projectConfig?.name || meta?.name || "AI Card",
                description: projectConfig?.description || meta?.description || "",
                fileId: this.folderFileId,
                latestHtmlFileId: latestFile?.file_id,
                templateFileId: templateFile?.file_id,
                meta: meta || undefined,
                lastUpdated: meta?.last_generated || latestFile?.updated_at,
                status: meta?.status || "active",
            }

            runInAction(() => {
                this.cards = [card]
                this.loading = false
            })
        } catch (err) {
            runInAction(() => {
                this.error = err instanceof Error ? err.message : "Failed to load AI Card"
                this.loading = false
            })
        }
    }

    private async loadHistory(cardId: string) {
        const children = this.findChildren()
        const historyDir = children.find(
            (f: any) => f.file_name === "history" && f.is_directory,
        )
        if (!historyDir?.children?.length) {
            runInAction(() => {
                this.historyEntries = []
            })
            return
        }

        const entries: AICardHistoryEntry[] = historyDir.children
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

        runInAction(() => {
            this.historyEntries = entries
        })
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

    private async fetchMeta(fileId: string): Promise<AICardMeta | null> {
        try {
            const urls = await getTemporaryDownloadUrl({ file_ids: [fileId] })
            const url = urls?.[0]?.url
            if (!url) return null
            const resp = await fetch(url, { credentials: "omit" })
            if (!resp.ok) return null
            return await resp.json()
        } catch {
            return null
        }
    }
}
