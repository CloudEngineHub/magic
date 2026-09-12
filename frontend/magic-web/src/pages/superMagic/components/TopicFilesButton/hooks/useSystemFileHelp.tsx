import { useTranslation } from "react-i18next"
import type { HelpDefinition } from "@/components/shadcn-composed/context-help"
import { HelpArticle } from "@/components/shadcn-composed/context-help/HelpArticle"

export interface FileHelpPresentation {
	label: string
	help: HelpDefinition
}

export type SystemFileHelpKind = "magic" | "instructions"

/** 项目、用户空间与 Claw 的相同文件语义共用一份说明，不推断运行时的读取优先级。 */
export function useSystemFileHelp(
	kind: SystemFileHelpKind | undefined,
): FileHelpPresentation | undefined {
	const { t } = useTranslation("super")
	if (kind === "magic")
		return {
			label: t("userSpace.fileLabels.magic"),
			help: {
				title: t("userSpace.fileLabels.magic"),
				summary: t("userSpace.fileHelp.magic"),
				renderBody: () => (
					<HelpArticle
						usage={t("userSpace.fileDetails.magic.usage")}
						example={t("userSpace.fileDetails.magic.example")}
						note={t("userSpace.fileDetails.magic.note")}
					/>
				),
			},
		}
	if (kind === "instructions")
		return {
			label: t("userSpace.fileLabels.instructions"),
			help: {
				title: t("userSpace.fileLabels.instructions"),
				summary: t("userSpace.fileHelp.instructions"),
				renderBody: () => (
					<HelpArticle
						usage={t("userSpace.fileDetails.instructions.usage")}
						example={t("userSpace.fileDetails.instructions.example")}
						note={t("userSpace.fileDetails.instructions.note")}
					/>
				),
			},
		}
}
