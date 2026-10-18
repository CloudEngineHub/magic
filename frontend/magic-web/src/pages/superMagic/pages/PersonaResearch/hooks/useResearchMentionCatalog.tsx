import { useEffect } from "react"
import { autorun } from "mobx"
import { useTranslation } from "react-i18next"
import { FlaskConical, LayoutTemplate } from "lucide-react"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import PersonaAvatar from "../components/PersonaAvatar"
import { usePersonaResearchStore } from "../context"
import {
	DEFAULT_REPORT_TEMPLATE_PATH,
	getAttachmentPath,
	reportTemplateName,
} from "../services/researchFiles"
import {
	buildReportTemplateCatalog,
	buildResearchMentionCatalog,
} from "../services/researchMentionCatalog"

/**
 * Pins research files in the @ panel of a research composer.
 *
 * | Composer                                        | Pinned entry                              |
 * | study conversation, study files ready           | "This study" + its report templates group |
 * | no study yet (home, library sheets, a template  | "Report templates" only, when any exist   |
 * | conversation) or a study still loading          |                                           |
 *
 * The entry follows file changes and is cleared on unmount; while a newly selected study is
 * still loading the previous study's personas never show under the next one.
 */
export function useResearchMentionCatalog(selectedTopic: Topic | null) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const topicId = selectedTopic?.id

	useEffect(() => {
		const mentionPanelStore = store.mentionPanelStore
		const templatesInput = () => ({
			files: store.reportTemplates,
			title: t("mention.reportTemplates"),
			nameOf: (file: AttachmentItem) => {
				const path = getAttachmentPath(file)
				return path === DEFAULT_REPORT_TEMPLATE_PATH
					? t("reportTemplates.defaultName")
					: reportTemplateName(path)
			},
		})
		const labels = {
			study: t("mention.study"),
			personas: t("mention.personas"),
			outputs: t("mention.outputs"),
			interviews: t("mention.interviews"),
			// Same names as the workspace tabs, so a file reads the same everywhere.
			outputNames: {
				report: t("console.docReport"),
				plan: t("console.docPlan"),
				validation: t("console.docValidation"),
				deskResearch: t("console.docDeskResearch"),
			},
			interviewOf: (name: string) => t("mention.interviewOf", { name }),
		}
		const dispose = autorun(() => {
			const study = topicId ? store.studyAttachments : null
			if (!study || store.selectedTopic?.id !== topicId || store.isStudyContentLoading) {
				const templates = templatesInput()
				mentionPanelStore.setPinnedSceneCatalog(
					templates.files.length
						? buildReportTemplateCatalog(templates, {
								projectId: store.selectedProject?.id,
								icon: <LayoutTemplate size={16} />,
							})
						: null,
				)
				return
			}
			const personaFiles = new Map(
				store.studyPersonaFiles.map((file) => [String(file.file_id), file]),
			)
			const personas = store.studyPersonas.flatMap((persona) => {
				const file = personaFiles.get(store.personaRefById(persona.id)?.fileId ?? "")
				return file ? [{ persona, file }] : []
			})
			mentionPanelStore.setPinnedSceneCatalog(
				buildResearchMentionCatalog({
					study,
					reportTemplates: templatesInput(),
					projectId: store.selectedProject?.id,
					personas,
					interviewPersonaIdByFileId: new Map(
						store.interviews.map((ref) => [ref.fileId, ref.data.persona_id]),
					),
					personaNameById: (id) => store.personaById(id)?.name,
					labels,
					icon: <FlaskConical size={16} />,
					// The panel renders outside the research context, so pass demographics along.
					renderPersonaIcon: (persona) => (
						<PersonaAvatar
							id={persona.id}
							name={persona.name}
							demographics={persona.dimensions?.demographics}
							className="size-4"
						/>
					),
				}),
			)
		})
		return () => {
			dispose()
			mentionPanelStore.setPinnedSceneCatalog(null)
		}
	}, [store, t, topicId])
}
