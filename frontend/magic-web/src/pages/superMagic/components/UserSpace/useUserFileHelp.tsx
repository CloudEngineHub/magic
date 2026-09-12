import { useTranslation } from "react-i18next"
import { HelpArticle } from "@/components/shadcn-composed/context-help/HelpArticle"
import type { HelpDefinition } from "@/components/shadcn-composed/context-help"
import {
	useSystemFileHelp,
	type FileHelpPresentation,
} from "../TopicFilesButton/hooks/useSystemFileHelp"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import { getUserResourceKind, type UserResourceKind } from "./userSpaceFilePresentation"

/** 用途标签共用文件分类；翻译保留静态键以支持提取和语言切换。 */
export function useUserFileHelp(item: AttachmentItem): FileHelpPresentation | undefined {
	const { t } = useTranslation("super")
	const kind = getUserResourceKind(item)
	const system = useSystemFileHelp(
		kind === "magic" ? "userMagic" : kind === "instructions" ? "instructionFile" : undefined,
	)
	if (!kind || kind === "magic" || kind === "instructions") return system
	// 只求值当前分类；详细正文等到打开面板后再创建。
	const entries: Record<
		Exclude<UserResourceKind, "magic" | "instructions">,
		() => HelpDefinition
	> = {
		memory: () => ({
			title: t("userSpace.fileLabels.memory"),
			summary: t("userSpace.fileHelp.memory"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.memory.usage")}
					example={t("userSpace.fileDetails.memory.example")}
					note={t("userSpace.fileDetails.memory.note")}
				/>
			),
		}),
		coreMemory: () => ({
			title: t("userSpace.fileLabels.coreMemory"),
			summary: t("userSpace.fileHelp.coreMemory"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.coreMemory.usage")}
					example={t("userSpace.fileDetails.coreMemory.example")}
					note={t("userSpace.fileDetails.coreMemory.note")}
				/>
			),
		}),
		notes: () => ({
			title: t("userSpace.fileLabels.notes"),
			summary: t("userSpace.fileHelp.notes"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.notes.usage")}
					example={t("userSpace.fileDetails.notes.example")}
					note={t("userSpace.fileDetails.notes.note")}
				/>
			),
		}),
		references: () => ({
			title: t("userSpace.fileLabels.references"),
			summary: t("userSpace.fileHelp.references"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.references.usage")}
					example={t("userSpace.fileDetails.references.example")}
					note={t("userSpace.fileDetails.references.note")}
				/>
			),
		}),
		subject: () => ({
			title: t("userSpace.fileLabels.subject"),
			summary: t("userSpace.fileHelp.subject"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.subject.usage")}
					example={t("userSpace.fileDetails.subject.example")}
					note={t("userSpace.fileDetails.subject.note")}
				/>
			),
		}),
		timeline: () => ({
			title: t("userSpace.fileLabels.timeline"),
			summary: t("userSpace.fileHelp.timeline"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.timeline.usage")}
					example={t("userSpace.fileDetails.timeline.example")}
					note={t("userSpace.fileDetails.timeline.note")}
				/>
			),
		}),
		year: () => ({
			title: t("userSpace.fileLabels.year"),
			summary: t("userSpace.fileHelp.year"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.year.usage")}
					example={t("userSpace.fileDetails.year.example")}
					note={t("userSpace.fileDetails.year.note")}
				/>
			),
		}),
		month: () => ({
			title: t("userSpace.fileLabels.month"),
			summary: t("userSpace.fileHelp.month"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.month.usage")}
					example={t("userSpace.fileDetails.month.example")}
					note={t("userSpace.fileDetails.month.note")}
				/>
			),
		}),
		event: () => ({
			title: t("userSpace.fileLabels.event"),
			summary: t("userSpace.fileHelp.event"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.event.usage")}
					example={t("userSpace.fileDetails.event.example")}
					note={t("userSpace.fileDetails.event.note")}
				/>
			),
		}),
		index: () => ({
			title: t("userSpace.fileLabels.index"),
			summary: t("userSpace.fileHelp.index"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.index.usage")}
					example={t("userSpace.fileDetails.index.example")}
					note={t("userSpace.fileDetails.index.note")}
				/>
			),
		}),
		topics: () => ({
			title: t("userSpace.fileLabels.topics"),
			summary: t("userSpace.fileHelp.topics"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.topics.usage")}
					example={t("userSpace.fileDetails.topics.example")}
					note={t("userSpace.fileDetails.topics.note")}
				/>
			),
		}),
		dingtalk: () => ({
			title: t("userSpace.fileLabels.dingtalk"),
			summary: t("userSpace.fileHelp.dingtalk"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.dingtalk.usage")}
					example={t("userSpace.fileDetails.dingtalk.example")}
					note={t("userSpace.fileDetails.dingtalk.note")}
				/>
			),
		}),
		lark: () => ({
			title: t("userSpace.fileLabels.lark"),
			summary: t("userSpace.fileHelp.lark"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.lark.usage")}
					example={t("userSpace.fileDetails.lark.example")}
					note={t("userSpace.fileDetails.lark.note")}
				/>
			),
		}),
		teamshare: () => ({
			title: t("userSpace.fileLabels.teamshare"),
			summary: t("userSpace.fileHelp.teamshare"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.teamshare.usage")}
					example={t("userSpace.fileDetails.teamshare.example")}
					note={t("userSpace.fileDetails.teamshare.note")}
				/>
			),
		}),
		tools: () => ({
			title: t("userSpace.fileLabels.tools"),
			summary: t("userSpace.fileHelp.tools"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.tools.usage")}
					example={t("userSpace.fileDetails.tools.example")}
					note={t("userSpace.fileDetails.tools.note")}
				/>
			),
		}),
		cli: () => ({
			title: t("userSpace.fileLabels.cli"),
			summary: t("userSpace.fileHelp.cli"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.cli.usage")}
					example={t("userSpace.fileDetails.cli.example")}
					note={t("userSpace.fileDetails.cli.note")}
				/>
			),
		}),
		settings: () => ({
			title: t("userSpace.fileLabels.settings"),
			summary: t("userSpace.fileHelp.settings"),
			renderBody: () => (
				<HelpArticle
					usage={t("userSpace.fileDetails.settings.usage")}
					example={t("userSpace.fileDetails.settings.example")}
					note={t("userSpace.fileDetails.settings.note")}
				/>
			),
		}),
	}
	const help = entries[kind]()
	return { label: help.title, help }
}
