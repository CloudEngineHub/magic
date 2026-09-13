import type { HelpTone } from "@/components/shadcn-composed/context-help/types"
import type { TopicFileMagicVariant } from "../components/TopicFileIcon"
import type { SkillFileKind } from "./skill-file-structure"
import type { UserResourceKind } from "../../UserSpace/userSpaceFilePresentation"

export type FileHelpGroupId = "project" | "skills" | "personal" | "assistant" | "crew" | "content"
export type FileHelpIcon =
	| TopicFileMagicVariant
	| `skill:${SkillFileKind}`
	| `user:${UserResourceKind}`
	| "user-space"
	| "file:md"
	| "file:json"
	| "file:yaml"
	| "file:txt"
	| "file:audio"

interface FileHelpMetadata {
	group: FileHelpGroupId
	name?: string
	icon: FileHelpIcon
	tone: HelpTone
}

/** 文章身份不依赖翻译或真实文件；目录只登记说明，不表示文件存在、技能安装或权限状态。 */
export const FILE_HELP_CATALOG = {
	"system.projectMagic": { group: "project", name: ".magic", icon: "magic-root", tone: "indigo" },
	"system.projectInstructions": {
		group: "project",
		name: "AGENTS.md",
		icon: "magic-file-agent",
		tone: "red",
	},
	"system.directoryInstructions": {
		group: "project",
		name: "AGENTS.md",
		icon: "magic-file-agent",
		tone: "red",
	},
	"system.agentInstructions": {
		group: "project",
		name: "AGENTS.md",
		icon: "magic-file-agent",
		tone: "red",
	},
	"system.instructionFile": {
		group: "project",
		name: "AGENTS.md",
		icon: "magic-file-agent",
		tone: "red",
	},
	"system.userMagic": { group: "personal", name: ".magic", icon: "magic-root", tone: "indigo" },
	"system.clawMagic": { group: "assistant", name: ".magic", icon: "magic-root", tone: "indigo" },
	"system.clawInstructions": {
		group: "assistant",
		name: "AGENTS.md",
		icon: "magic-file-agent",
		tone: "red",
	},
	"system.clawIdentity": {
		group: "assistant",
		name: "IDENTITY.md",
		icon: "magic-file-identity",
		tone: "indigo",
	},
	"system.clawSoul": {
		group: "assistant",
		name: "SOUL.md",
		icon: "magic-file-soul",
		tone: "indigo",
	},
	"system.crewMagic": { group: "crew", name: ".magic", icon: "magic-root", tone: "indigo" },
	"system.crewInstructions": {
		group: "crew",
		name: "AGENTS.md",
		icon: "magic-file-agent",
		tone: "red",
	},
	"system.crewIdentity": {
		group: "crew",
		name: "IDENTITY.md",
		icon: "magic-file-identity",
		tone: "indigo",
	},
	"system.crewSoul": { group: "crew", name: "SOUL.md", icon: "magic-file-soul", tone: "indigo" },
	"skill.library": { group: "skills", name: "skills", icon: "skill:library", tone: "indigo" },
	"skill.skill": { group: "skills", icon: "skill:skill", tone: "indigo" },
	"skill.entry": { group: "skills", name: "SKILL.md", icon: "skill:entry", tone: "indigo" },
	"skill.references": {
		group: "skills",
		name: "references",
		icon: "skill:references",
		tone: "indigo",
	},
	"skill.scripts": { group: "skills", name: "scripts", icon: "skill:scripts", tone: "indigo" },
	"skill.assets": { group: "skills", name: "assets", icon: "skill:assets", tone: "indigo" },
	"skill.templates": {
		group: "skills",
		name: "templates",
		icon: "skill:templates",
		tone: "indigo",
	},
	"skill.examples": { group: "skills", name: "examples", icon: "skill:examples", tone: "indigo" },
	"skill.evals": { group: "skills", name: "evals", icon: "skill:evals", tone: "indigo" },
	"skill.evalCases": { group: "skills", name: "evals.json", icon: "file:json", tone: "indigo" },
	"skill.evalInputs": {
		group: "skills",
		name: "files",
		icon: "skill:evalInputs",
		tone: "indigo",
	},
	"skill.agents": { group: "skills", name: "agents", icon: "skill:agents", tone: "indigo" },
	"skill.readme": { group: "skills", name: "README.md", icon: "file:md", tone: "indigo" },
	"skill.license": { group: "skills", name: "LICENSE", icon: "file:txt", tone: "neutral" },
	"skill.publishConfig": {
		group: "skills",
		name: "skill_config.yaml",
		icon: "file:yaml",
		tone: "indigo",
	},
	"skillLibrary.unknown": {
		group: "skills",
		name: "skills",
		icon: "skill:library",
		tone: "indigo",
	},
	"skillLibrary.user": {
		group: "personal",
		name: "skills",
		icon: "skill:library",
		tone: "indigo",
	},
	"skillLibrary.claw": {
		group: "assistant",
		name: "skills",
		icon: "skill:library",
		tone: "indigo",
	},
	"skillLibrary.crew": { group: "crew", name: "skills", icon: "skill:library", tone: "indigo" },
	"user.overview": { group: "personal", icon: "user-space", tone: "indigo" },
	"user.memory": { group: "personal", name: "memory", icon: "magic-memory", tone: "amber" },
	"user.coreMemory": {
		group: "personal",
		name: "MEMORY.md",
		icon: "magic-file-memory",
		tone: "amber",
	},
	"user.notes": { group: "personal", name: "notes", icon: "user:notes", tone: "amber" },
	"user.references": {
		group: "personal",
		name: "references",
		icon: "user:references",
		tone: "amber",
	},
	"user.subject": { group: "personal", icon: "user:subject", tone: "amber" },
	"user.timeline": { group: "personal", name: "timeline", icon: "user:timeline", tone: "amber" },
	"user.year": { group: "personal", icon: "user:year", tone: "amber" },
	"user.month": { group: "personal", icon: "user:month", tone: "amber" },
	"user.event": { group: "personal", icon: "user:event", tone: "amber" },
	"user.index": { group: "personal", name: "index.md", icon: "user:index", tone: "amber" },
	"user.topics": { group: "personal", name: "topics", icon: "user:topics", tone: "amber" },
	"user.dingtalk": { group: "personal", name: ".dws", icon: "user:dingtalk", tone: "indigo" },
	"user.lark": { group: "personal", name: ".lark-cli", icon: "user:lark", tone: "indigo" },
	"user.teamshare": {
		group: "personal",
		name: "teamshare-cli",
		icon: "user:teamshare",
		tone: "indigo",
	},
	"user.tools": { group: "personal", name: ".local", icon: "user:tools", tone: "indigo" },
	"user.cli": { group: "personal", name: "cli", icon: "user:cli", tone: "indigo" },
	"user.settings": {
		group: "personal",
		name: "super-magic.env",
		icon: "user:settings",
		tone: "indigo",
	},
	"claw.scheduledTasks": { group: "assistant", name: "cron", icon: "magic-cron", tone: "indigo" },
	"claw.installedSkills": {
		group: "assistant",
		name: "skills",
		icon: "skill:library",
		tone: "indigo",
	},
	"claw.memoryFolder": {
		group: "assistant",
		name: "memory",
		icon: "magic-memory",
		tone: "amber",
	},
	"claw.skillList": {
		group: "assistant",
		name: "SKILLS.md",
		icon: "magic-file-skills",
		tone: "indigo",
	},
	"claw.proactiveExecution": {
		group: "assistant",
		name: "HEARTBEAT.md",
		icon: "magic-file-heartbeat",
		tone: "indigo",
	},
	"claw.identityInfo": {
		group: "assistant",
		name: "IDENTITY.md",
		icon: "magic-file-identity",
		tone: "indigo",
	},
	"claw.guidelines": {
		group: "assistant",
		name: "SOUL.md",
		icon: "magic-file-soul",
		tone: "indigo",
	},
	"claw.toolList": {
		group: "assistant",
		name: "TOOLS.md",
		icon: "magic-file-tools",
		tone: "indigo",
	},
	"claw.aboutYou": {
		group: "assistant",
		name: "USER.md",
		icon: "magic-file-user",
		tone: "indigo",
	},
	"claw.initialSetup": {
		group: "assistant",
		name: "BOOTSTRAP.md",
		icon: "magic-file-bootstrap",
		tone: "indigo",
	},
	"claw.memoryFile": {
		group: "assistant",
		name: "MEMORY.md",
		icon: "magic-file-memory",
		tone: "amber",
	},
	"recording.project": { group: "content", icon: "file:audio", tone: "teal" },
} as const satisfies Record<string, FileHelpMetadata>

export type FileHelpArticleId = keyof typeof FILE_HELP_CATALOG
export const FILE_HELP_ARTICLE_IDS = Object.keys(FILE_HELP_CATALOG) as FileHelpArticleId[]

export function isFileHelpArticleId(id: string): id is FileHelpArticleId {
	return Object.hasOwn(FILE_HELP_CATALOG, id)
}

export function getFileHelpMetadata(id: FileHelpArticleId): FileHelpMetadata {
	return FILE_HELP_CATALOG[id]
}

export type FileHelpReadingReason =
	| "skillEntry"
	| "skillStructure"
	| "progressiveReading"
	| "projectRules"
	| "projectConfig"
	| "personalSpace"
	| "memoryStructure"
	| "scope"
	| "assistantRules"
	| "crewRules"
export interface FileHelpReadingLink {
	id: FileHelpArticleId
	reason: FileHelpReadingReason
}
interface FileHelpRelations {
	further?: FileHelpReadingLink[]
	recommended?: FileHelpReadingLink[]
}

/** 每条关系说明为何值得阅读；无关联的文章保留空结果，不按目录顺序填充推荐。 */
const RELATIONS: Partial<Record<FileHelpArticleId, FileHelpRelations>> = {
	"skill.entry": {
		further: [{ id: "skill.references", reason: "progressiveReading" }],
		recommended: [{ id: "skill.library", reason: "skillStructure" }],
	},
	"skill.references": {
		further: [{ id: "skill.entry", reason: "skillEntry" }],
		recommended: [{ id: "skill.library", reason: "skillStructure" }],
	},
	"skill.library": {
		further: [{ id: "skill.entry", reason: "skillEntry" }],
		recommended: [{ id: "system.projectMagic", reason: "projectConfig" }],
	},
	"system.projectMagic": {
		further: [{ id: "system.projectInstructions", reason: "projectRules" }],
		recommended: [{ id: "skill.library", reason: "skillStructure" }],
	},
	"system.projectInstructions": {
		recommended: [
			{ id: "system.projectMagic", reason: "projectConfig" },
			{ id: "skill.library", reason: "skillStructure" },
		],
	},
	"skillLibrary.user": {
		further: [{ id: "skill.entry", reason: "skillEntry" }],
		recommended: [{ id: "user.overview", reason: "personalSpace" }],
	},
	"skillLibrary.crew": {
		further: [{ id: "skill.entry", reason: "skillEntry" }],
		recommended: [{ id: "system.crewInstructions", reason: "crewRules" }],
	},
	"skillLibrary.claw": {
		further: [{ id: "skill.entry", reason: "skillEntry" }],
		recommended: [{ id: "system.clawInstructions", reason: "assistantRules" }],
	},
	"user.overview": {
		recommended: [
			{ id: "user.memory", reason: "memoryStructure" },
			{ id: "skillLibrary.user", reason: "scope" },
		],
	},
	"user.memory": {
		recommended: [
			{ id: "user.coreMemory", reason: "memoryStructure" },
			{ id: "user.overview", reason: "personalSpace" },
		],
	},
}

export function getFileHelpRelations(id: FileHelpArticleId): FileHelpRelations {
	const explicit = RELATIONS[id]
	if (explicit) return explicit
	if (id.startsWith("skill."))
		return {
			recommended: [
				{ id: "skill.entry", reason: "skillEntry" },
				{ id: "skill.library", reason: "skillStructure" },
			],
		}
	const { group } = FILE_HELP_CATALOG[id]
	if (group === "personal")
		return {
			recommended: [
				{ id: "user.overview", reason: "personalSpace" },
				{ id: "user.memory", reason: "memoryStructure" },
			],
		}
	if (group === "assistant")
		return {
			recommended: [
				{ id: "system.clawInstructions", reason: "assistantRules" },
				{ id: "skillLibrary.claw", reason: "scope" },
			],
		}
	if (group === "crew")
		return {
			recommended: [
				{ id: "system.crewInstructions", reason: "crewRules" },
				{ id: "skillLibrary.crew", reason: "scope" },
			],
		}
	if (group === "project")
		return {
			recommended: [
				{ id: "system.projectInstructions", reason: "projectRules" },
				{ id: "system.projectMagic", reason: "projectConfig" },
			],
		}
	return {}
}
