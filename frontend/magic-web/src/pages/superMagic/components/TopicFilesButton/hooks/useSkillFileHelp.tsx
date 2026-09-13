import { useTranslation } from "react-i18next"
import type { SkillFileKind } from "../utils/skill-file-structure"
import type { FilePresentation } from "../utils/file-presentation"
import {
	createFileHelpPresentation,
	type FileHelpDetail,
	type FileHelpPresentation,
} from "./useSystemFileHelp"

/** 相同交互复用帮助组件；用途、作用范围与读取方式按真实场景区分。 */
export function useSkillFileHelp(
	kind: SkillFileKind | undefined,
	presentation?: FilePresentation,
): FileHelpPresentation | undefined {
	const { t } = useTranslation("super")
	if (kind === "library") {
		const owner = presentation?.context.kind
		if (!owner || owner === "unknown")
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.libraryScopes.unknown.label"),
				t("topicFiles.skillStructure.libraryScopes.unknown.summary"),
				t("topicFiles.skillStructure.libraryScopes.unknown", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
		if (owner === "user")
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.libraryScopes.user.label"),
				t("topicFiles.skillStructure.libraryScopes.user.summary"),
				t("topicFiles.skillStructure.libraryScopes.user", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
		if (owner === "crew")
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.libraryScopes.crew.label"),
				t("topicFiles.skillStructure.libraryScopes.crew.summary"),
				t("topicFiles.skillStructure.libraryScopes.crew", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
		if (owner === "claw")
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.libraryScopes.claw.label"),
				t("topicFiles.skillStructure.libraryScopes.claw.summary"),
				t("topicFiles.skillStructure.libraryScopes.claw", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
	}
	switch (kind) {
		case "library":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.library"),
				t("topicFiles.skillStructure.help.library"),
				t("topicFiles.skillStructure.details.library", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "skill":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.skill"),
				t("topicFiles.skillStructure.help.skill"),
				t("topicFiles.skillStructure.details.skill", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "entry":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.entry"),
				t("topicFiles.skillStructure.help.entry"),
				t("topicFiles.skillStructure.details.entry", {
					returnObjects: true,
				}) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "references":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.references"),
				t("topicFiles.skillStructure.help.references"),
				t("topicFiles.skillStructure.details.references", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "scripts":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.scripts"),
				t("topicFiles.skillStructure.help.scripts"),
				t("topicFiles.skillStructure.details.scripts", {
					returnObjects: true,
				}) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "assets":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.assets"),
				t("topicFiles.skillStructure.help.assets"),
				t("topicFiles.skillStructure.details.assets", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "templates":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.templates"),
				t("topicFiles.skillStructure.help.templates"),
				t("topicFiles.skillStructure.details.templates", {
					returnObjects: true,
				}) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "examples":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.examples"),
				t("topicFiles.skillStructure.help.examples"),
				t("topicFiles.skillStructure.details.examples", {
					returnObjects: true,
				}) as FileHelpDetail,
				"document",
				presentation,
			)
		case "evals":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.evals"),
				t("topicFiles.skillStructure.help.evals"),
				t("topicFiles.skillStructure.details.evals", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "evalCases":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.evalCases"),
				t("topicFiles.skillStructure.help.evalCases"),
				t("topicFiles.skillStructure.details.evalCases", {
					returnObjects: true,
				}) as FileHelpDetail,
				"flow",
				presentation,
			)
		case "evalInputs":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.evalInputs"),
				t("topicFiles.skillStructure.help.evalInputs"),
				t("topicFiles.skillStructure.details.evalInputs", {
					returnObjects: true,
				}) as FileHelpDetail,
				"tree",
				presentation,
			)
		case "agents":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.agents"),
				t("topicFiles.skillStructure.help.agents"),
				t("topicFiles.skillStructure.details.agents", {
					returnObjects: true,
				}) as FileHelpDetail,
				"document",
				presentation,
			)
		case "readme":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.readme"),
				t("topicFiles.skillStructure.help.readme"),
				t("topicFiles.skillStructure.details.readme", {
					returnObjects: true,
				}) as FileHelpDetail,
				"document",
				presentation,
			)
		case "license":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.license"),
				t("topicFiles.skillStructure.help.license"),
				t("topicFiles.skillStructure.details.license", {
					returnObjects: true,
				}) as FileHelpDetail,
				"document",
				presentation,
			)
		case "publishConfig":
			return createFileHelpPresentation(
				t("topicFiles.skillStructure.labels.publishConfig"),
				t("topicFiles.skillStructure.help.publishConfig"),
				t("topicFiles.skillStructure.details.publishConfig", {
					returnObjects: true,
				}) as FileHelpDetail,
				"flow",
				presentation,
			)
	}
}
