import { useProjectFileHelp } from "../hooks/useProjectFileHelp"
import { lazy } from "react"
import { useClawFileHelp } from "../../../pages/ClawPlayground/components/ClawFileHelpTag"
import { resolveFilePresentation, type FilePresentation } from "../utils/file-presentation"
import { useUserFileHelp } from "../../UserSpace/useUserFileHelp"
import { ContextHelp } from "@/components/shadcn-composed/context-help"
import { badgeVariants } from "@/components/shadcn-ui/badge"
import { cn } from "@/utils/cn"
import type { AttachmentItem } from "../hooks/types"
import { useSystemFileHelp, type FileHelpPresentation } from "../hooks/useSystemFileHelp"
import { useSkillFileHelp } from "../hooks/useSkillFileHelp"
import type { SkillFileKind } from "../utils/skill-file-structure"
import { type FileHelpContext } from "../utils/magic-system-folder"

const FileHelpBrowser = lazy(() => import("./FileHelpBrowser"))

/** 标签只解释用途；点击、键盘和触屏操作不能冒泡为文件打开或目录折叠。 */
export function TopicFileTag({
	label,
	shortLabel,
	help,
	articleId,
	sourceKey,
	fileLocation,
}: FileHelpPresentation) {
	return (
		<ContextHelp
			help={help}
			mode="preview"
			renderDialog={
				articleId
					? (props) => (
							<FileHelpBrowser
								key={sourceKey ?? articleId}
								{...props}
								initialArticleId={articleId}
								fileLocation={fileLocation}
							/>
						)
					: undefined
			}
		>
			<button
				type="button"
				aria-label={label}
				data-slot="badge"
				className={cn(
					badgeVariants({ variant: "outline" }),
					"min-h-5 max-w-full cursor-help rounded-md border-border bg-background px-2 py-0.5 text-[10px] font-normal leading-3 text-muted-foreground shadow-none transition-none hover:border-foreground/20 hover:bg-accent hover:text-foreground",
				)}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
				onDoubleClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<span className="min-w-0 whitespace-nowrap text-left">{shortLabel ?? label}</span>
			</button>
		</ContextHelp>
	)
}

export function ProjectFileTag({
	presentation: supplied,
	item,
	skillKind,
	path,
	context,
}: {
	presentation?: FilePresentation
	item: AttachmentItem
	skillKind?: SkillFileKind
	path?: string
	context?: FileHelpContext
}) {
	// Skill 里的同名示例属于资料，不进入项目规则说明。
	const file = supplied ?? resolveFilePresentation(item, { skillKind, path, context })
	const system = useSystemFileHelp(file.systemKind, file)
	const skill = useSkillFileHelp(file.skillKind, file)
	const user = useUserFileHelp(file.userKind, file)
	const claw = useClawFileHelp(file.clawKind, file)
	const project = useProjectFileHelp(file.projectKind, file)
	const presentation = skill ?? user ?? claw ?? system ?? project
	return presentation ? <TopicFileTag {...presentation} /> : null
}

export function UserSpaceFileTag({ item }: { item: AttachmentItem }) {
	return <ProjectFileTag item={item} context={{ kind: "user" }} />
}
