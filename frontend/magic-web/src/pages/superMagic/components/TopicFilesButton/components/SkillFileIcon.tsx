import {
	BookOpen,
	FlaskConical,
	FolderCode,
	FolderInput,
	Images,
	LayoutTemplate,
	Lightbulb,
	Users,
} from "lucide-react"
import type { ReactNode } from "react"
import type { SkillFileKind } from "../utils/skill-file-structure"
import { TopicFileIcon } from "./TopicFileIcon"

interface SkillFileIconProps {
	kind?: SkillFileKind
	isDirectory?: boolean
	size?: number
	className?: string
	fallback?: ReactNode
}

/** 仅入口与约定目录使用用途图标，普通资源保留格式或缩略图。 */
export function hasSkillFileIcon(kind: SkillFileKind | undefined, isDirectory?: boolean): boolean {
	if (kind === "entry") return !isDirectory
	return Boolean(isDirectory && kind && kind !== "support")
}

export function SkillFileIcon({
	kind,
	isDirectory,
	size = 16,
	className,
	fallback = null,
}: SkillFileIconProps) {
	if (!hasSkillFileIcon(kind, isDirectory)) return fallback
	if (kind === "library" || kind === "skill" || kind === "entry")
		return (
			<TopicFileIcon
				magicVariant={kind === "entry" ? "magic-file-skills" : "magic-skills"}
				size={size}
				className={className}
			/>
		)
	const icons = {
		references: BookOpen,
		scripts: FolderCode,
		assets: Images,
		templates: LayoutTemplate,
		examples: Lightbulb,
		evals: FlaskConical,
		evalInputs: FolderInput,
		agents: Users,
	}
	const Icon = kind && Object.hasOwn(icons, kind) ? icons[kind as keyof typeof icons] : undefined
	return Icon ? (
		<Icon size={size} className={className ?? "shrink-0 text-muted-foreground"} aria-hidden />
	) : (
		fallback
	)
}
