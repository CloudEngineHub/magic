import { BriefcaseBusiness, FileText, Globe2, Layers3, type LucideIcon } from "lucide-react"
import { TopicFileIcon } from "@/pages/superMagic/components/TopicFilesButton/components/TopicFileIcon"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

type MemoryFolderVariant = "global" | "projects" | "project" | "notes"

interface MemoryFolderStyle {
	backColor: string
	frontColor: string
	glyph: LucideIcon
}

interface MemoryTreeNodeIconProps {
	item: AttachmentItem
	pathSegments: string[]
}

const MEMORY_ROOT_NAME = "memory"
const GLOBAL_FOLDER_NAME = "global"
const PROJECTS_FOLDER_NAME = "projects"
const NOTES_FOLDER_NAME = "notes"
const MEMORY_FILE_NAME = "MEMORY.MD"

const memoryFolderStyles: Record<MemoryFolderVariant, MemoryFolderStyle> = {
	global: {
		backColor: "#2563EB",
		frontColor: "#60A5FA",
		glyph: Globe2,
	},
	projects: {
		backColor: "#7C3AED",
		frontColor: "#A78BFA",
		glyph: Layers3,
	},
	project: {
		backColor: "#0891B2",
		frontColor: "#22D3EE",
		glyph: BriefcaseBusiness,
	},
	notes: {
		backColor: "#EA8C00",
		frontColor: "#FFC154",
		glyph: FileText,
	},
}

/** 渲染文件记忆结构中的语义目录图标。 */
function MemorySemanticFolderIcon({ variant }: { variant: MemoryFolderVariant }) {
	const style = memoryFolderStyles[variant]
	const Glyph = style.glyph

	return (
		<span className="relative block size-4 shrink-0" aria-hidden>
			<svg className="block size-full" viewBox="0 0 24 24" fill="none">
				<path
					fillRule="evenodd"
					clipRule="evenodd"
					d="M2 1H6.687C7.122 1 7.546 1.142 7.893 1.404L9.65 2.732C9.997 2.994 10.42 3.137 10.855 3.137H22C23.105 3.137 24 4.032 24 5.137V21C24 22.105 23.105 23 22 23H2C0.895 23 0 22.105 0 21V3C0 1.895 0.895 1 2 1Z"
					fill={style.backColor}
				/>
				<path
					fillRule="evenodd"
					clipRule="evenodd"
					d="M0 9.2H24V21C24 22.105 23.105 23 22 23H2C0.895 23 0 22.105 0 21V9.2Z"
					fill={style.frontColor}
				/>
			</svg>
			<span className="absolute inset-x-0 top-[4px] flex justify-center text-white">
				<Glyph size={8} strokeWidth={2.6} />
			</span>
		</span>
	)
}

/** 判断当前路径是否为内置项目记忆目录。 */
function isProjectMemoryFolder(pathSegments: string[]): boolean {
	return (
		pathSegments.length === 3 &&
		pathSegments[0] === MEMORY_ROOT_NAME &&
		pathSegments[1] === PROJECTS_FOLDER_NAME &&
		pathSegments[2].startsWith("p_")
	)
}

/** 判断当前路径是否为内置笔记目录。 */
function isMemoryNotesFolder(pathSegments: string[]): boolean {
	if (pathSegments.at(-1) !== NOTES_FOLDER_NAME) return false

	const parentPath = pathSegments.slice(0, -1)
	const isGlobalNotes =
		parentPath.length === 2 &&
		parentPath[0] === MEMORY_ROOT_NAME &&
		parentPath[1] === GLOBAL_FOLDER_NAME

	return isGlobalNotes || isProjectMemoryFolder(parentPath)
}

/** 判断当前路径是否为内置记忆索引文件。 */
function isMemoryIndexFile(pathSegments: string[]): boolean {
	if (pathSegments.at(-1)?.toUpperCase() !== MEMORY_FILE_NAME) return false

	const parentPath = pathSegments.slice(0, -1)
	const isGlobalMemory =
		parentPath.length === 2 &&
		parentPath[0] === MEMORY_ROOT_NAME &&
		parentPath[1] === GLOBAL_FOLDER_NAME

	return isGlobalMemory || isProjectMemoryFolder(parentPath)
}

/** 按固定目录结构渲染专用图标，其余节点回退普通文件图标。 */
export function MemoryTreeNodeIcon({ item, pathSegments }: MemoryTreeNodeIconProps) {
	const normalizedPath = pathSegments.map((segment) => segment.trim().toLowerCase())

	if (!item.is_directory && isMemoryIndexFile(normalizedPath)) {
		return <TopicFileIcon magicVariant="magic-file-memory" className="block size-4 shrink-0" />
	}

	if (item.is_directory) {
		if (normalizedPath.length === 1 && normalizedPath[0] === MEMORY_ROOT_NAME) {
			return <TopicFileIcon magicVariant="magic-memory" className="block size-4 shrink-0" />
		}
		if (
			normalizedPath.length === 2 &&
			normalizedPath[0] === MEMORY_ROOT_NAME &&
			normalizedPath[1] === GLOBAL_FOLDER_NAME
		) {
			return <MemorySemanticFolderIcon variant="global" />
		}
		if (
			normalizedPath.length === 2 &&
			normalizedPath[0] === MEMORY_ROOT_NAME &&
			normalizedPath[1] === PROJECTS_FOLDER_NAME
		) {
			return <MemorySemanticFolderIcon variant="projects" />
		}
		if (isProjectMemoryFolder(normalizedPath)) {
			return <MemorySemanticFolderIcon variant="project" />
		}
		if (isMemoryNotesFolder(normalizedPath)) {
			return <MemorySemanticFolderIcon variant="notes" />
		}
	}

	return (
		<TopicFileIcon
			isDirectory={Boolean(item.is_directory)}
			hasChildren={Boolean(item.children?.length)}
			fileExtension={item.file_extension}
			className="block size-4 shrink-0"
		/>
	)
}
