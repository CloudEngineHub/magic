import type { ReactNode } from "react"
import { ClawFileHelpTag, type ClawFileHelpKind } from "./components/ClawFileHelpTag"
import type { TopicFileRowDecorationResolver } from "@/pages/superMagic/components/TopicFilesButton"
import {
	AgentsFileIcon,
	BootstrapFileIcon,
	CronFolderIcon,
	HeartbeatFileIcon,
	IdentityFileIcon,
	MemoryFileIcon,
	MemoryFolderIcon,
	SkillsFileIcon,
	SkillsFolderIcon,
	SoulFileIcon,
	ToolsFileIcon,
	UserFileIcon,
} from "./components/file-tree-icons"

interface FileDecorationDefinition {
	icon: ReactNode
	tagKey: ClawFileHelpKind
}

interface FileDecorationMatcher extends FileDecorationDefinition {
	matches: (context: DecorationMatchContext) => boolean
}

interface DecorationMatchContext {
	itemName: string
	isInMagicDirectory: boolean
}

const MAGIC_FOLDER_NAME = ".magic"

const folderDecorationMatchers: FileDecorationMatcher[] = [
	{
		icon: <CronFolderIcon />,
		tagKey: "scheduledTasks",
		matches: createMagicFolderNameMatcher("cron"),
	},
	{
		icon: <SkillsFolderIcon />,
		tagKey: "installedSkills",
		matches: createMagicFolderNameMatcher("skills"),
	},
	{
		icon: <MemoryFolderIcon />,
		tagKey: "memoryFolder",
		matches: createMagicFolderNameMatcher("memory"),
	},
]

const fileDecorationMatchers: FileDecorationMatcher[] = [
	{
		icon: <SkillsFileIcon />,
		tagKey: "skillList",
		matches: createMagicFileNameMatcher("SKILLS.MD"),
	},
	{
		icon: <AgentsFileIcon />,
		tagKey: "prompts",
		matches: createMagicFileNameMatcher("AGENTS.MD"),
	},
	{
		icon: <HeartbeatFileIcon />,
		tagKey: "proactiveExecution",
		matches: createMagicFileNameMatcher("HEARTBEAT.MD"),
	},
	{
		icon: <IdentityFileIcon />,
		tagKey: "identityInfo",
		matches: createMagicFileNameMatcher("IDENTITY.MD"),
	},
	{
		icon: <SoulFileIcon />,
		tagKey: "guidelines",
		matches: createMagicFileNameMatcher("SOUL.MD"),
	},
	{
		icon: <ToolsFileIcon />,
		tagKey: "toolList",
		matches: createMagicFileNameMatcher("TOOLS.MD"),
	},
	{
		icon: <UserFileIcon />,
		tagKey: "aboutYou",
		matches: createMagicFileNameMatcher("USER.MD"),
	},
	{
		icon: <BootstrapFileIcon />,
		tagKey: "initialSetup",
		matches: createMagicFileNameMatcher("BOOTSTRAP.MD"),
	},
	{
		icon: <MemoryFileIcon />,
		tagKey: "memoryFile",
		matches: createMagicFileNameMatcher("MEMORY.MD"),
	},
]

export function createClawPlaygroundFileRowDecorationResolver(): TopicFileRowDecorationResolver {
	return function resolveTopicFileRowDecoration({ item, isVirtual }) {
		if (isVirtual) return

		const itemName = (item.file_name || item.name || "").trim()
		if (!itemName) return

		const matchContext: DecorationMatchContext = {
			itemName,
			isInMagicDirectory: isInMagicDirectory(item.relative_file_path || item.path),
		}
		const decoration = item.is_directory
			? folderDecorationMatchers.find((matcher) => matcher.matches(matchContext))
			: fileDecorationMatchers.find((matcher) => matcher.matches(matchContext))
		if (!decoration) return

		return {
			icon: decoration.icon,
			tag: <ClawFileHelpTag kind={decoration.tagKey} />,
		}
	}
}

function createMagicFolderNameMatcher(expectedName: string) {
	const normalizedExpectedName = expectedName.toLowerCase()

	return function matchesMagicFolderByName({
		itemName,
		isInMagicDirectory,
	}: DecorationMatchContext) {
		if (!isInMagicDirectory) return false
		return itemName.toLowerCase() === normalizedExpectedName
	}
}

function createMagicFileNameMatcher(expectedName: string) {
	const normalizedExpectedName = expectedName.toUpperCase()

	return function matchesMagicFileByName({
		itemName,
		isInMagicDirectory,
	}: DecorationMatchContext) {
		if (!isInMagicDirectory) return false
		return itemName.toUpperCase() === normalizedExpectedName
	}
}

function normalizeRelativePath(path: string | undefined) {
	if (!path) return ""
	return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "")
}

function isInMagicDirectory(path: string | undefined) {
	const normalizedPath = normalizeRelativePath(path)
	if (!normalizedPath) return false

	const segments = normalizedPath.split("/").filter(Boolean)
	const magicDirectoryIndex = segments.lastIndexOf(MAGIC_FOLDER_NAME)
	if (magicDirectoryIndex === -1) return false

	return segments.length === magicDirectoryIndex + 2
}
