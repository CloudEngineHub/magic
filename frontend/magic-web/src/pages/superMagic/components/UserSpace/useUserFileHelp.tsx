import { useTranslation } from "react-i18next"
import {
	useSystemFileHelp,
	createFileHelpPresentation,
	type FileHelpPresentation,
	type FileHelpDetail,
} from "../TopicFilesButton/hooks/useSystemFileHelp"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import {
	resolveFilePresentation,
	type FilePresentation,
} from "../TopicFilesButton/utils/file-presentation"

/** 用途标签共用文件分类；翻译保留静态键以支持提取和语言切换。 */
export function useUserFileHelp(
	item: AttachmentItem,
	supplied?: FilePresentation,
): FileHelpPresentation | undefined {
	const { t } = useTranslation("super")
	const presentation = supplied ?? resolveFilePresentation(item, { context: { kind: "user" } })
	const kind = presentation.userKind
	const system = useSystemFileHelp(
		kind === "magic" ? "userMagic" : kind === "instructions" ? "instructionFile" : undefined,
		presentation,
	)
	if (!kind || kind === "magic" || kind === "instructions") return system
	switch (kind) {
		case "memory":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.memory"),
				t("userSpace.fileHelp.memory"),
				t("userSpace.fileDetails.memory", { returnObjects: true }) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "coreMemory":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.coreMemory"),
				t("userSpace.fileHelp.coreMemory"),
				t("userSpace.fileDetails.coreMemory", { returnObjects: true }) as FileHelpDetail,
				"document",
				presentation,
			)
		case "notes":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.notes"),
				t("userSpace.fileHelp.notes"),
				t("userSpace.fileDetails.notes", { returnObjects: true }) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "references":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.references"),
				t("userSpace.fileHelp.references"),
				t("userSpace.fileDetails.references", { returnObjects: true }) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "subject":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.subject"),
				t("userSpace.fileHelp.subject"),
				t("userSpace.fileDetails.subject", { returnObjects: true }) as FileHelpDetail,
				"document",
				presentation,
			)
		case "timeline":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.timeline"),
				t("userSpace.fileHelp.timeline"),
				t("userSpace.fileDetails.timeline", { returnObjects: true }) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "year":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.year"),
				t("userSpace.fileHelp.year"),
				t("userSpace.fileDetails.year", { returnObjects: true }) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "month":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.month"),
				t("userSpace.fileHelp.month"),
				t("userSpace.fileDetails.month", { returnObjects: true }) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "event":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.event"),
				t("userSpace.fileHelp.event"),
				t("userSpace.fileDetails.event", { returnObjects: true }) as FileHelpDetail,
				"document",
				presentation,
			)
		case "index":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.index"),
				t("userSpace.fileHelp.index"),
				t("userSpace.fileDetails.index", { returnObjects: true }) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "topics":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.topics"),
				t("userSpace.fileHelp.topics"),
				t("userSpace.fileDetails.topics", { returnObjects: true }) as FileHelpDetail,
				"document",
				presentation,
			)
		case "dingtalk":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.dingtalk"),
				t("userSpace.fileHelp.dingtalk"),
				t("userSpace.fileDetails.dingtalk", { returnObjects: true }) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "lark":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.lark"),
				t("userSpace.fileHelp.lark"),
				t("userSpace.fileDetails.lark", { returnObjects: true }) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "teamshare":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.teamshare"),
				t("userSpace.fileHelp.teamshare"),
				t("userSpace.fileDetails.teamshare", { returnObjects: true }) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "tools":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.tools"),
				t("userSpace.fileHelp.tools"),
				t("userSpace.fileDetails.tools", { returnObjects: true }) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "cli":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.cli"),
				t("userSpace.fileHelp.cli"),
				t("userSpace.fileDetails.cli", { returnObjects: true }) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "settings":
			return createFileHelpPresentation(
				t("userSpace.fileLabels.settings"),
				t("userSpace.fileHelp.settings"),
				t("userSpace.fileDetails.settings", { returnObjects: true }) as FileHelpDetail,
				"document",
				presentation,
			)
	}
}
