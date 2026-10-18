import { useEffect } from "react"
import { autorun } from "mobx"
import { useTranslation } from "react-i18next"
import { FlaskConical } from "lucide-react"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import PersonaAvatar from "../components/PersonaAvatar"
import { usePersonaResearchStore } from "../context"
import { buildResearchMentionCatalog } from "../services/researchMentionCatalog"

/**
 * Pins "This study" (personas, outputs, transcripts) in the @ panel of a study conversation.
 *
 * | Composer                                  | Effect                                  |
 * | study conversation (selectedTopic set)    | pins the study, follows file changes    |
 * | home / persona build (selectedTopic null) | leaves the panel alone                  |
 *
 * The entry is cleared on unmount, and while a newly selected study is still loading so the
 * previous study's personas never show under the next one.
 */
export function useResearchMentionCatalog(selectedTopic: Topic | null) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const topicId = selectedTopic?.id

	useEffect(() => {
		if (!topicId) return
		const mentionPanelStore = store.mentionPanelStore
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
			const study = store.studyAttachments
			if (!study || store.selectedTopic?.id !== topicId || store.isStudyContentLoading) {
				mentionPanelStore.setPinnedSceneCatalog(null)
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
