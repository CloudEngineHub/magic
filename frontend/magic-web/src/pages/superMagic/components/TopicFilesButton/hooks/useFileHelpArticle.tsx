import {
	BookOpen,
	CalendarDays,
	FolderCog,
	History,
	ListTree,
	MessageSquare,
	NotebookPen,
	Settings,
	Terminal,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import DingTalkIcon from "@/components/base/MagicFileIcon/assets/dingtalk-logo.svg"
import LarkIcon from "@/components/base/MagicFileIcon/assets/feishu-logo.svg"
import IconSuperTeamshare from "@/enhance/tabler/icons-react/icons/IconSuperTeamshare"
import type { HelpNavigationGroup } from "@/components/shadcn-composed/context-help/HelpNavigation"
import {
	useClawFileHelp,
	type ClawFileHelpKind,
} from "../../../pages/ClawPlayground/components/ClawFileHelpTag"
import { getClawBrandTranslationValues } from "../../../utils/clawBrand"
import { useUserFileHelp, useUserSpaceOverviewHelp } from "../../UserSpace/useUserFileHelp"
import type { UserResourceKind } from "../../UserSpace/userSpaceFilePresentation"
import UserSpaceIcon from "../../UserSpace/UserSpaceIcon"
import { SkillFileIcon } from "../components/SkillFileIcon"
import { TopicFileIcon, type TopicFileMagicVariant } from "../components/TopicFileIcon"
import {
	FILE_HELP_ARTICLE_IDS,
	getFileHelpMetadata,
	type FileHelpArticleId,
	type FileHelpIcon,
	type FileHelpGroupId,
	type FileHelpReadingReason,
} from "../utils/file-help-catalog"
import type { FileHelpContext, SystemFileHelpKind } from "../utils/magic-system-folder"
import type { SkillFileKind } from "../utils/skill-file-structure"
import { useSystemFileHelp, useRecordingFileHelp } from "./useSystemFileHelp"
import { useSkillFileHelp } from "./useSkillFileHelp"

const USER_SYMBOLS = {
	notes: NotebookPen,
	references: BookOpen,
	subject: BookOpen,
	timeline: History,
	event: History,
	year: CalendarDays,
	month: CalendarDays,
	index: ListTree,
	topics: MessageSquare,
	tools: FolderCog,
	cli: Terminal,
	settings: Settings,
}

/** canonical 说明复用文件图标素材，不构造虚假的文件 ID、附件或安装状态。 */
function renderFileHelpIcon(icon: FileHelpIcon, size: number) {
	if (icon === "user-space") return <UserSpaceIcon size={size} />
	if (icon.startsWith("magic-"))
		return <TopicFileIcon magicVariant={icon as TopicFileMagicVariant} size={size} />
	if (icon.startsWith("skill:")) {
		const kind = icon.slice(6) as SkillFileKind
		return <SkillFileIcon kind={kind} isDirectory={kind !== "entry"} size={size} />
	}
	if (icon.startsWith("file:")) return <MagicFileIcon type={icon.slice(5)} size={size} />
	if (icon === "user:dingtalk" || icon === "user:lark")
		return (
			<img
				src={icon === "user:dingtalk" ? DingTalkIcon : LarkIcon}
				alt=""
				width={size}
				height={size}
			/>
		)
	if (icon === "user:teamshare") return <IconSuperTeamshare size={size} />
	const symbol = icon.slice(5)
	if (Object.hasOwn(USER_SYMBOLS, symbol)) {
		const Icon = USER_SYMBOLS[symbol as keyof typeof USER_SYMBOLS]
		return <Icon size={size} aria-hidden />
	}
	return <MagicFileIcon type="" size={size} />
}

/** 只在完整指南里调用：语言变化重新取得文案，文章身份与当前工作区无关。 */
export function useFileHelpArticle(id: FileHelpArticleId) {
	const { t } = useTranslation("super")
	// id 已由闭集目录约束；这里拆分命名空间供既有内容 provider 使用，不按文件名猜测。
	const system = useSystemFileHelp(
		id.startsWith("system.") ? (id.slice(7) as SystemFileHelpKind) : undefined,
	)
	const skill = useSkillFileHelp(
		id.startsWith("skillLibrary.")
			? "library"
			: id.startsWith("skill.")
				? (id.slice(6) as SkillFileKind)
				: undefined,
		undefined,
		id.startsWith("skillLibrary.")
			? (id.slice(13) as FileHelpContext["kind"])
			: id === "skill.library"
				? "project"
				: undefined,
	)
	const user = useUserFileHelp(
		id.startsWith("user.") && id !== "user.overview"
			? (id.slice(5) as UserResourceKind)
			: undefined,
	)
	const claw = useClawFileHelp(
		id.startsWith("claw.") ? (id.slice(5) as ClawFileHelpKind) : undefined,
	)
	const overview = useUserSpaceOverviewHelp()
	const recording = useRecordingFileHelp(undefined, id === "recording.project")
	const result =
		system ??
		skill ??
		user ??
		claw ??
		(id === "user.overview" ? overview : undefined) ??
		recording
	if (!result) return undefined
	const metadata = getFileHelpMetadata(id)
	return {
		...result.help,
		tone: metadata.tone,
		identity: {
			name: id === "user.overview" ? t("userSpace.title") : (metadata.name ?? result.label),
			scope: result.help.subtitle,
			renderIcon: (size: number) => renderFileHelpIcon(metadata.icon, size),
		},
	}
}

export function useFileHelpCatalog() {
	const { t } = useTranslation("super")
	const brand = getClawBrandTranslationValues()
	const labels: Record<FileHelpArticleId, string> = {
		"system.clawSoul": t("topicFiles.clawPlaygroundTags.guidelines", brand),
		"system.clawIdentity": t("topicFiles.clawPlaygroundTags.identityInfo", brand),
		"system.projectMagic": t("topicFiles.systemFiles.labels.projectMagic", brand),
		"system.userMagic": t("topicFiles.systemFiles.labels.userMagic", brand),
		"system.clawMagic": t("topicFiles.systemFiles.labels.clawMagic", brand),
		"system.crewMagic": t("topicFiles.systemFiles.labels.crewMagic", brand),
		"system.projectInstructions": t("topicFiles.systemFiles.labels.projectInstructions", brand),
		"system.directoryInstructions": t(
			"topicFiles.systemFiles.labels.directoryInstructions",
			brand,
		),
		"system.clawInstructions": t("topicFiles.systemFiles.labels.clawInstructions", brand),
		"system.crewInstructions": t("topicFiles.systemFiles.labels.crewInstructions", brand),
		"system.agentInstructions": t("topicFiles.systemFiles.labels.agentInstructions", brand),
		"system.instructionFile": t("topicFiles.systemFiles.labels.instructionFile", brand),
		"system.crewIdentity": t("topicFiles.systemFiles.labels.crewIdentity", brand),
		"system.crewSoul": t("topicFiles.systemFiles.labels.crewSoul", brand),
		"skillLibrary.unknown": t("topicFiles.skillStructure.libraryScopes.unknown.label"),
		"skillLibrary.user": t("topicFiles.skillStructure.libraryScopes.user.label"),
		"skillLibrary.crew": t("topicFiles.skillStructure.libraryScopes.crew.label"),
		"skillLibrary.claw": t("topicFiles.skillStructure.libraryScopes.claw.label"),
		"skill.library": t("topicFiles.skillStructure.labels.library"),
		"skill.skill": t("topicFiles.skillStructure.labels.skill"),
		"skill.entry": t("topicFiles.skillStructure.labels.entry"),
		"skill.references": t("topicFiles.skillStructure.labels.references"),
		"skill.scripts": t("topicFiles.skillStructure.labels.scripts"),
		"skill.assets": t("topicFiles.skillStructure.labels.assets"),
		"skill.templates": t("topicFiles.skillStructure.labels.templates"),
		"skill.examples": t("topicFiles.skillStructure.labels.examples"),
		"skill.evals": t("topicFiles.skillStructure.labels.evals"),
		"skill.evalCases": t("topicFiles.skillStructure.labels.evalCases"),
		"skill.evalInputs": t("topicFiles.skillStructure.labels.evalInputs"),
		"skill.agents": t("topicFiles.skillStructure.labels.agents"),
		"skill.readme": t("topicFiles.skillStructure.labels.readme"),
		"skill.license": t("topicFiles.skillStructure.labels.license"),
		"skill.publishConfig": t("topicFiles.skillStructure.labels.publishConfig"),
		"user.memory": t("userSpace.fileLabels.memory"),
		"user.coreMemory": t("userSpace.fileLabels.coreMemory"),
		"user.notes": t("userSpace.fileLabels.notes"),
		"user.references": t("userSpace.fileLabels.references"),
		"user.subject": t("userSpace.fileLabels.subject"),
		"user.timeline": t("userSpace.fileLabels.timeline"),
		"user.year": t("userSpace.fileLabels.year"),
		"user.month": t("userSpace.fileLabels.month"),
		"user.event": t("userSpace.fileLabels.event"),
		"user.index": t("userSpace.fileLabels.index"),
		"user.topics": t("userSpace.fileLabels.topics"),
		"user.dingtalk": t("userSpace.fileLabels.dingtalk"),
		"user.lark": t("userSpace.fileLabels.lark"),
		"user.teamshare": t("userSpace.fileLabels.teamshare"),
		"user.tools": t("userSpace.fileLabels.tools"),
		"user.cli": t("userSpace.fileLabels.cli"),
		"user.settings": t("userSpace.fileLabels.settings"),
		"claw.scheduledTasks": t("topicFiles.clawPlaygroundTags.scheduledTasks", brand),
		"claw.installedSkills": t("topicFiles.clawPlaygroundTags.installedSkills", brand),
		"claw.memoryFolder": t("topicFiles.clawPlaygroundTags.memoryFolder", brand),
		"claw.skillList": t("topicFiles.clawPlaygroundTags.skillList", brand),
		"claw.proactiveExecution": t("topicFiles.clawPlaygroundTags.proactiveExecution", brand),
		"claw.identityInfo": t("topicFiles.clawPlaygroundTags.identityInfo", brand),
		"claw.guidelines": t("topicFiles.clawPlaygroundTags.guidelines", brand),
		"claw.toolList": t("topicFiles.clawPlaygroundTags.toolList", brand),
		"claw.aboutYou": t("topicFiles.clawPlaygroundTags.aboutYou", brand),
		"claw.initialSetup": t("topicFiles.clawPlaygroundTags.initialSetup", brand),
		"claw.memoryFile": t("topicFiles.clawPlaygroundTags.memoryFile", brand),
		"user.overview": t("userSpace.help.title"),
		"recording.project": t("topicFiles.recordingProject.label"),
	}
	const reasons: Record<FileHelpReadingReason, string> = {
		skillEntry: t("topicFiles.helpGuide.reasons.skillEntry"),
		skillStructure: t("topicFiles.helpGuide.reasons.skillStructure"),
		progressiveReading: t("topicFiles.helpGuide.reasons.progressiveReading"),
		projectRules: t("topicFiles.helpGuide.reasons.projectRules"),
		projectConfig: t("topicFiles.helpGuide.reasons.projectConfig"),
		personalSpace: t("topicFiles.helpGuide.reasons.personalSpace"),
		memoryStructure: t("topicFiles.helpGuide.reasons.memoryStructure"),
		scope: t("topicFiles.helpGuide.reasons.scope"),
		assistantRules: t("topicFiles.helpGuide.reasons.assistantRules", brand),
		crewRules: t("topicFiles.helpGuide.reasons.crewRules"),
	}
	const groupLabels: Record<FileHelpGroupId, string> = {
		project: t("topicFiles.helpGuide.groups.project"),
		skills: t("topicFiles.helpGuide.groups.skills"),
		personal: t("topicFiles.helpGuide.groups.personal"),
		assistant: t("topicFiles.helpGuide.groups.assistant", brand),
		crew: t("topicFiles.helpGuide.groups.crew"),
		content: t("topicFiles.helpGuide.groups.content"),
	}
	function group(id: FileHelpGroupId): HelpNavigationGroup {
		return {
			id,
			label: groupLabels[id],
			items: FILE_HELP_ARTICLE_IDS.filter(
				(articleId) => getFileHelpMetadata(articleId).group === id,
			).map((articleId) => ({
				id: articleId,
				label: labels[articleId],
				icon: renderFileHelpIcon(getFileHelpMetadata(articleId).icon, 18),
			})),
		}
	}
	const groups: HelpNavigationGroup[] = [
		group("project"),
		group("skills"),
		group("personal"),
		{
			id: "assistants",
			label: t("topicFiles.helpGuide.groups.assistants"),
			items: [],
			children: [group("assistant"), group("crew")],
		},
		group("content"),
	]
	return { labels, reasons, groups }
}
