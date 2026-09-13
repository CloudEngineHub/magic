import { useTranslation } from "react-i18next"
import { HelpArticle, type HelpGuide } from "@/components/shadcn-composed/context-help/HelpArticle"
import type { SystemFileHelpKind } from "../utils/magic-system-folder"
import type { HelpDefinition } from "@/components/shadcn-composed/context-help"
import { getClawBrandTranslationValues } from "@/pages/superMagic/utils/clawBrand"
export type { SystemFileHelpKind } from "../utils/magic-system-folder"

export interface FileHelpPresentation {
	label: string
	help: HelpDefinition
}

/** 相同交互复用帮助组件；用途、作用范围与读取方式按真实场景区分。 */
export function useSystemFileHelp(
	kind: SystemFileHelpKind | undefined,
): FileHelpPresentation | undefined {
	const { t } = useTranslation("super")
	const brand = getClawBrandTranslationValues()
	switch (kind) {
		case "clawSoul":
			return {
				label: t("topicFiles.clawPlaygroundTags.guidelines", brand),
				help: {
					title: t("topicFiles.clawPlaygroundTags.guidelines", brand),
					summary: t("topicFiles.clawPlaygroundHelp.guidelines", brand),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.clawPlaygroundDetails.guidelines.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t("topicFiles.clawPlaygroundDetails.guidelines.usage", brand)}
							example={t(
								"topicFiles.clawPlaygroundDetails.guidelines.example",
								brand,
							)}
							note={t("topicFiles.clawPlaygroundDetails.guidelines.note", brand)}
						/>
					),
				},
			}
		case "clawIdentity":
			return {
				label: t("topicFiles.clawPlaygroundTags.identityInfo", brand),
				help: {
					title: t("topicFiles.clawPlaygroundTags.identityInfo", brand),
					summary: t("topicFiles.clawPlaygroundHelp.identityInfo", brand),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.clawPlaygroundDetails.identityInfo.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t("topicFiles.clawPlaygroundDetails.identityInfo.usage", brand)}
							example={t(
								"topicFiles.clawPlaygroundDetails.identityInfo.example",
								brand,
							)}
							note={t("topicFiles.clawPlaygroundDetails.identityInfo.note", brand)}
						/>
					),
				},
			}
		case "projectMagic":
			return {
				label: t("topicFiles.systemFiles.labels.projectMagic", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.projectMagic", brand),
					summary: t("topicFiles.systemFiles.help.projectMagic", brand),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.systemFiles.details.projectMagic.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t("topicFiles.systemFiles.details.projectMagic.usage", brand)}
							example={t(
								"topicFiles.systemFiles.details.projectMagic.example",
								brand,
							)}
							note={t("topicFiles.systemFiles.details.projectMagic.note", brand)}
						/>
					),
				},
			}
		case "userMagic":
			return {
				label: t("topicFiles.systemFiles.labels.userMagic", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.userMagic", brand),
					summary: t("topicFiles.systemFiles.help.userMagic", brand),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.systemFiles.details.userMagic.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t("topicFiles.systemFiles.details.userMagic.usage", brand)}
							example={t("topicFiles.systemFiles.details.userMagic.example", brand)}
							note={t("topicFiles.systemFiles.details.userMagic.note", brand)}
						/>
					),
				},
			}
		case "clawMagic":
			return {
				label: t("topicFiles.systemFiles.labels.clawMagic", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.clawMagic", brand),
					summary: t("topicFiles.systemFiles.help.clawMagic", brand),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.systemFiles.details.clawMagic.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t("topicFiles.systemFiles.details.clawMagic.usage", brand)}
							example={t("topicFiles.systemFiles.details.clawMagic.example", brand)}
							note={t("topicFiles.systemFiles.details.clawMagic.note", brand)}
						/>
					),
				},
			}
		case "crewMagic":
			return {
				label: t("topicFiles.systemFiles.labels.crewMagic", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.crewMagic", brand),
					summary: t("topicFiles.systemFiles.help.crewMagic", brand),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.systemFiles.details.crewMagic.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t("topicFiles.systemFiles.details.crewMagic.usage", brand)}
							example={t("topicFiles.systemFiles.details.crewMagic.example", brand)}
							note={t("topicFiles.systemFiles.details.crewMagic.note", brand)}
						/>
					),
				},
			}
		case "projectInstructions":
			return {
				label: t("topicFiles.systemFiles.labels.projectInstructions", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.projectInstructions", brand),
					summary: t("topicFiles.systemFiles.help.projectInstructions", brand),
					renderBody: () => (
						<HelpArticle
							visual="flow"
							guide={
								t("topicFiles.systemFiles.details.projectInstructions.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t(
								"topicFiles.systemFiles.details.projectInstructions.usage",
								brand,
							)}
							example={t(
								"topicFiles.systemFiles.details.projectInstructions.example",
								brand,
							)}
							note={t(
								"topicFiles.systemFiles.details.projectInstructions.note",
								brand,
							)}
						/>
					),
				},
			}
		case "directoryInstructions":
			return {
				label: t("topicFiles.systemFiles.labels.directoryInstructions", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.directoryInstructions", brand),
					summary: t("topicFiles.systemFiles.help.directoryInstructions", brand),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.systemFiles.details.directoryInstructions.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t(
								"topicFiles.systemFiles.details.directoryInstructions.usage",
								brand,
							)}
							example={t(
								"topicFiles.systemFiles.details.directoryInstructions.example",
								brand,
							)}
							note={t(
								"topicFiles.systemFiles.details.directoryInstructions.note",
								brand,
							)}
						/>
					),
				},
			}
		case "clawInstructions":
			return {
				label: t("topicFiles.systemFiles.labels.clawInstructions", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.clawInstructions", brand),
					summary: t("topicFiles.systemFiles.help.clawInstructions", brand),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.systemFiles.details.clawInstructions.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t(
								"topicFiles.systemFiles.details.clawInstructions.usage",
								brand,
							)}
							example={t(
								"topicFiles.systemFiles.details.clawInstructions.example",
								brand,
							)}
							note={t("topicFiles.systemFiles.details.clawInstructions.note", brand)}
						/>
					),
				},
			}
		case "crewInstructions":
			return {
				label: t("topicFiles.systemFiles.labels.crewInstructions", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.crewInstructions", brand),
					summary: t("topicFiles.systemFiles.help.crewInstructions", brand),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.systemFiles.details.crewInstructions.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t(
								"topicFiles.systemFiles.details.crewInstructions.usage",
								brand,
							)}
							example={t(
								"topicFiles.systemFiles.details.crewInstructions.example",
								brand,
							)}
							note={t("topicFiles.systemFiles.details.crewInstructions.note", brand)}
						/>
					),
				},
			}
		case "agentInstructions":
			return {
				label: t("topicFiles.systemFiles.labels.agentInstructions", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.agentInstructions", brand),
					summary: t("topicFiles.systemFiles.help.agentInstructions", brand),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.systemFiles.details.agentInstructions.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t(
								"topicFiles.systemFiles.details.agentInstructions.usage",
								brand,
							)}
							example={t(
								"topicFiles.systemFiles.details.agentInstructions.example",
								brand,
							)}
							note={t("topicFiles.systemFiles.details.agentInstructions.note", brand)}
						/>
					),
				},
			}
		case "instructionFile":
			return {
				label: t("topicFiles.systemFiles.labels.instructionFile", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.instructionFile", brand),
					summary: t("topicFiles.systemFiles.help.instructionFile", brand),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.systemFiles.details.instructionFile.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t("topicFiles.systemFiles.details.instructionFile.usage", brand)}
							example={t(
								"topicFiles.systemFiles.details.instructionFile.example",
								brand,
							)}
							note={t("topicFiles.systemFiles.details.instructionFile.note", brand)}
						/>
					),
				},
			}
		case "crewIdentity":
			return {
				label: t("topicFiles.systemFiles.labels.crewIdentity", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.crewIdentity", brand),
					summary: t("topicFiles.systemFiles.help.crewIdentity", brand),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.systemFiles.details.crewIdentity.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t("topicFiles.systemFiles.details.crewIdentity.usage", brand)}
							example={t(
								"topicFiles.systemFiles.details.crewIdentity.example",
								brand,
							)}
							note={t("topicFiles.systemFiles.details.crewIdentity.note", brand)}
						/>
					),
				},
			}
		case "crewSoul":
			return {
				label: t("topicFiles.systemFiles.labels.crewSoul", brand),
				help: {
					title: t("topicFiles.systemFiles.labels.crewSoul", brand),
					summary: t("topicFiles.systemFiles.help.crewSoul", brand),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.systemFiles.details.crewSoul.guide", {
									returnObjects: true,
									...brand,
								}) as HelpGuide
							}
							usage={t("topicFiles.systemFiles.details.crewSoul.usage", brand)}
							example={t("topicFiles.systemFiles.details.crewSoul.example", brand)}
							note={t("topicFiles.systemFiles.details.crewSoul.note", brand)}
						/>
					),
				},
			}
	}
}
