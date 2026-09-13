import { useTranslation } from "react-i18next"
import { HelpArticle, type HelpGuide } from "@/components/shadcn-composed/context-help/HelpArticle"
import type { SkillFileKind } from "../utils/skill-file-structure"
import type { FileHelpPresentation } from "./useSystemFileHelp"

/** 相同交互复用帮助组件；用途、作用范围与读取方式按真实场景区分。 */
export function useSkillFileHelp(
	kind: SkillFileKind | undefined,
): FileHelpPresentation | undefined {
	const { t } = useTranslation("super")
	switch (kind) {
		case "library":
			return {
				label: t("topicFiles.skillStructure.labels.library"),
				help: {
					title: t("topicFiles.skillStructure.labels.library"),
					summary: t("topicFiles.skillStructure.help.library"),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.skillStructure.details.library.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.library.usage")}
							example={t("topicFiles.skillStructure.details.library.example")}
							note={t("topicFiles.skillStructure.details.library.note")}
						/>
					),
				},
			}
		case "skill":
			return {
				label: t("topicFiles.skillStructure.labels.skill"),
				help: {
					title: t("topicFiles.skillStructure.labels.skill"),
					summary: t("topicFiles.skillStructure.help.skill"),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.skillStructure.details.skill.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.skill.usage")}
							example={t("topicFiles.skillStructure.details.skill.example")}
							note={t("topicFiles.skillStructure.details.skill.note")}
						/>
					),
				},
			}
		case "entry":
			return {
				label: t("topicFiles.skillStructure.labels.entry"),
				help: {
					title: t("topicFiles.skillStructure.labels.entry"),
					summary: t("topicFiles.skillStructure.help.entry"),
					renderBody: () => (
						<HelpArticle
							visual="flow"
							guide={
								t("topicFiles.skillStructure.details.entry.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.entry.usage")}
							example={t("topicFiles.skillStructure.details.entry.example")}
							note={t("topicFiles.skillStructure.details.entry.note")}
						/>
					),
				},
			}
		case "references":
			return {
				label: t("topicFiles.skillStructure.labels.references"),
				help: {
					title: t("topicFiles.skillStructure.labels.references"),
					summary: t("topicFiles.skillStructure.help.references"),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.skillStructure.details.references.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.references.usage")}
							example={t("topicFiles.skillStructure.details.references.example")}
							note={t("topicFiles.skillStructure.details.references.note")}
						/>
					),
				},
			}
		case "scripts":
			return {
				label: t("topicFiles.skillStructure.labels.scripts"),
				help: {
					title: t("topicFiles.skillStructure.labels.scripts"),
					summary: t("topicFiles.skillStructure.help.scripts"),
					renderBody: () => (
						<HelpArticle
							visual="flow"
							guide={
								t("topicFiles.skillStructure.details.scripts.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.scripts.usage")}
							example={t("topicFiles.skillStructure.details.scripts.example")}
							note={t("topicFiles.skillStructure.details.scripts.note")}
						/>
					),
				},
			}
		case "assets":
			return {
				label: t("topicFiles.skillStructure.labels.assets"),
				help: {
					title: t("topicFiles.skillStructure.labels.assets"),
					summary: t("topicFiles.skillStructure.help.assets"),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.skillStructure.details.assets.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.assets.usage")}
							example={t("topicFiles.skillStructure.details.assets.example")}
							note={t("topicFiles.skillStructure.details.assets.note")}
						/>
					),
				},
			}
		case "templates":
			return {
				label: t("topicFiles.skillStructure.labels.templates"),
				help: {
					title: t("topicFiles.skillStructure.labels.templates"),
					summary: t("topicFiles.skillStructure.help.templates"),
					renderBody: () => (
						<HelpArticle
							visual="flow"
							guide={
								t("topicFiles.skillStructure.details.templates.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.templates.usage")}
							example={t("topicFiles.skillStructure.details.templates.example")}
							note={t("topicFiles.skillStructure.details.templates.note")}
						/>
					),
				},
			}
		case "examples":
			return {
				label: t("topicFiles.skillStructure.labels.examples"),
				help: {
					title: t("topicFiles.skillStructure.labels.examples"),
					summary: t("topicFiles.skillStructure.help.examples"),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.skillStructure.details.examples.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.examples.usage")}
							example={t("topicFiles.skillStructure.details.examples.example")}
							note={t("topicFiles.skillStructure.details.examples.note")}
						/>
					),
				},
			}
		case "evals":
			return {
				label: t("topicFiles.skillStructure.labels.evals"),
				help: {
					title: t("topicFiles.skillStructure.labels.evals"),
					summary: t("topicFiles.skillStructure.help.evals"),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.skillStructure.details.evals.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.evals.usage")}
							example={t("topicFiles.skillStructure.details.evals.example")}
							note={t("topicFiles.skillStructure.details.evals.note")}
						/>
					),
				},
			}
		case "evalCases":
			return {
				label: t("topicFiles.skillStructure.labels.evalCases"),
				help: {
					title: t("topicFiles.skillStructure.labels.evalCases"),
					summary: t("topicFiles.skillStructure.help.evalCases"),
					renderBody: () => (
						<HelpArticle
							visual="flow"
							guide={
								t("topicFiles.skillStructure.details.evalCases.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.evalCases.usage")}
							example={t("topicFiles.skillStructure.details.evalCases.example")}
							note={t("topicFiles.skillStructure.details.evalCases.note")}
						/>
					),
				},
			}
		case "evalInputs":
			return {
				label: t("topicFiles.skillStructure.labels.evalInputs"),
				help: {
					title: t("topicFiles.skillStructure.labels.evalInputs"),
					summary: t("topicFiles.skillStructure.help.evalInputs"),
					renderBody: () => (
						<HelpArticle
							visual="tree"
							guide={
								t("topicFiles.skillStructure.details.evalInputs.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.evalInputs.usage")}
							example={t("topicFiles.skillStructure.details.evalInputs.example")}
							note={t("topicFiles.skillStructure.details.evalInputs.note")}
						/>
					),
				},
			}
		case "agents":
			return {
				label: t("topicFiles.skillStructure.labels.agents"),
				help: {
					title: t("topicFiles.skillStructure.labels.agents"),
					summary: t("topicFiles.skillStructure.help.agents"),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.skillStructure.details.agents.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.agents.usage")}
							example={t("topicFiles.skillStructure.details.agents.example")}
							note={t("topicFiles.skillStructure.details.agents.note")}
						/>
					),
				},
			}
		case "readme":
			return {
				label: t("topicFiles.skillStructure.labels.readme"),
				help: {
					title: t("topicFiles.skillStructure.labels.readme"),
					summary: t("topicFiles.skillStructure.help.readme"),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.skillStructure.details.readme.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.readme.usage")}
							example={t("topicFiles.skillStructure.details.readme.example")}
							note={t("topicFiles.skillStructure.details.readme.note")}
						/>
					),
				},
			}
		case "license":
			return {
				label: t("topicFiles.skillStructure.labels.license"),
				help: {
					title: t("topicFiles.skillStructure.labels.license"),
					summary: t("topicFiles.skillStructure.help.license"),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.skillStructure.details.license.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.license.usage")}
							example={t("topicFiles.skillStructure.details.license.example")}
							note={t("topicFiles.skillStructure.details.license.note")}
						/>
					),
				},
			}
		case "publishConfig":
			return {
				label: t("topicFiles.skillStructure.labels.publishConfig"),
				help: {
					title: t("topicFiles.skillStructure.labels.publishConfig"),
					summary: t("topicFiles.skillStructure.help.publishConfig"),
					renderBody: () => (
						<HelpArticle
							visual="flow"
							guide={
								t("topicFiles.skillStructure.details.publishConfig.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.publishConfig.usage")}
							example={t("topicFiles.skillStructure.details.publishConfig.example")}
							note={t("topicFiles.skillStructure.details.publishConfig.note")}
						/>
					),
				},
			}
		case "support":
			return {
				label: t("topicFiles.skillStructure.labels.support"),
				help: {
					title: t("topicFiles.skillStructure.labels.support"),
					summary: t("topicFiles.skillStructure.help.support"),
					renderBody: () => (
						<HelpArticle
							visual="document"
							guide={
								t("topicFiles.skillStructure.details.support.guide", {
									returnObjects: true,
								}) as HelpGuide
							}
							usage={t("topicFiles.skillStructure.details.support.usage")}
							example={t("topicFiles.skillStructure.details.support.example")}
							note={t("topicFiles.skillStructure.details.support.note")}
						/>
					),
				},
			}
	}
}
