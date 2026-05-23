/**
 * AI Card Tree Navigation
 *
 * Resolves clicks on sub-folders within an ai-card root directory,
 * enabling navigation to the AICardRootRender with a specific card focused.
 *
 * Directory structure convention:
 *   ai-cards/                  ← root (display_config.type = "ai-card")
 *     ├── magic.project.js
 *     ├── card-1/             ← card sub-folder
 *     │   ├── card.meta.json
 *     │   └── latest.html
 *     └── card-2/             ← another card sub-folder
 */

export interface AICardTreeNavigationItem {
    file_id?: string
    relative_file_path?: string
    is_directory?: boolean
    display_config?: unknown
    path?: string
}

export interface AICardTreeNavigationTarget {
    rootFolderFileId: string
    activeCardId: string
    initialView: "detail"
}

export interface AICardTreeNodeResolution {
    navigationTarget: AICardTreeNavigationTarget | null
}

interface AttachmentNode {
    file_id?: string
    is_directory?: boolean
    display_config?: Record<string, unknown> | unknown
    children?: AttachmentNode[]
    relative_file_path?: string
    path?: string
    name?: string
    file_name?: string
}

function normPath(p: string): string {
    if (!p) return ""
    const s = p.replace(/\\/g, "/").replace(/\/+/g, "/")
    if (s === "/") return "/"
    return s.replace(/\/$/, "")
}

function getNodePath(node: AICardTreeNavigationItem): string {
    const raw = (node.relative_file_path || (node as { path?: string }).path || "").trim()
    return normPath(raw)
}

function hasAICardDisplayConfig(node: AttachmentNode | undefined): boolean {
    const t = (node?.display_config as { type?: string } | undefined)?.type
    return node?.is_directory === true && t === "ai-card"
}

function folderPath(node: AttachmentNode): string {
    const raw = (node.relative_file_path || (node as { path?: string }).path || "").trim()
    return normPath(raw)
}

function collectAICardRoots(nodes: AttachmentNode[] | undefined, acc: AttachmentNode[]): void {
    if (!nodes?.length) return
    for (const n of nodes) {
        if (hasAICardDisplayConfig(n)) acc.push(n)
        if (n.is_directory && n.children?.length) collectAICardRoots(n.children, acc)
    }
}

function collectAICardTreeIndex(
    nodes: AttachmentNode[] | undefined,
    roots: AttachmentNode[],
    nodeById: Map<string, AttachmentNode>,
): void {
    if (!nodes?.length) return
    for (const n of nodes) {
        if (n.file_id) nodeById.set(String(n.file_id), n)
        if (hasAICardDisplayConfig(n)) roots.push(n)
        if (n.is_directory && n.children?.length) {
            collectAICardTreeIndex(n.children, roots, nodeById)
        }
    }
}

/**
 * Check whether the clicked path is a direct sub-folder of the root
 * (i.e. one level deep), which corresponds to a card folder.
 */
function isDirectChildFolder(root: AttachmentNode, clickedNorm: string): boolean {
    const rootNorm = normPath(folderPath(root))
    if (!rootNorm || !clickedNorm) return false
    const prefix = rootNorm === "/" ? "/" : `${rootNorm}/`
    if (!clickedNorm.startsWith(prefix)) return false
    const rel = clickedNorm.slice(prefix.length)
    // Direct child = no slash in the relative portion
    return rel.length > 0 && !rel.includes("/")
}

/**
 * Find the deepest ai-card root that contains the clicked path as a direct child.
 */
function findContainingAICardRoot(
    roots: AttachmentNode[],
    clickedPath: string,
): AttachmentNode | null {
    if (!roots.length || !clickedPath) return null
    const clickedNorm = normPath(clickedPath)
    let best: AttachmentNode | null = null
    let bestLen = -1
    for (const r of roots) {
        if (!isDirectChildFolder(r, clickedNorm)) continue
        const rootNorm = normPath(folderPath(r))
        if (rootNorm.length > bestLen) {
            bestLen = rootNorm.length
            best = r
        }
    }
    return best
}

/**
 * Extract card folder name (= cardId) from the clicked path relative to root.
 */
function extractCardId(root: AttachmentNode, clickedPath: string): string | null {
    const rootNorm = normPath(folderPath(root))
    const clickedNorm = normPath(clickedPath)
    const prefix = rootNorm === "/" ? "/" : `${rootNorm}/`
    if (!clickedNorm.startsWith(prefix)) return null
    const rel = clickedNorm.slice(prefix.length)
    if (!rel || rel.includes("/")) return null
    return rel
}

function resolveFromRoots(
    roots: AttachmentNode[],
    item: AICardTreeNavigationItem,
): AICardTreeNavigationTarget | null {
    if (!roots.length || !item?.file_id || !item.is_directory) return null

    const clickedPath = getNodePath(item)
    if (!clickedPath) return null

    const root = findContainingAICardRoot(roots, clickedPath)
    if (!root?.file_id) return null

    const cardId = extractCardId(root, clickedPath)
    if (!cardId) return null

    return {
        rootFolderFileId: String(root.file_id),
        activeCardId: cardId,
        initialView: "detail",
    }
}

export interface AICardTreeNavigationIndex {
    resolveCardFolderClick: (item: AICardTreeNavigationItem) => AICardTreeNodeResolution | null
}

/**
 * Create an index for efficient resolution of AI Card sub-folder clicks.
 * Call once per attachment tree change (memoize with useMemo).
 */
export function createAICardTreeNavigationIndex(
    tree: AttachmentNode[] | undefined,
): AICardTreeNavigationIndex {
    const roots: AttachmentNode[] = []
    const nodeById = new Map<string, AttachmentNode>()
    collectAICardTreeIndex(tree, roots, nodeById)

    function resolveCardFolderClick(
        item: AICardTreeNavigationItem,
    ): AICardTreeNodeResolution | null {
        if (!item?.is_directory) return null
        const navigationTarget = resolveFromRoots(roots, item)
        if (!navigationTarget) return null
        return { navigationTarget }
    }

    return { resolveCardFolderClick }
}
