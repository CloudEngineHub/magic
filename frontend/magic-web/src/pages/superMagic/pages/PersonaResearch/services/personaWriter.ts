import { MagicFSApi, SuperMagicApi } from "@/apis"
import { getFileContentsByIds } from "@/pages/superMagic/utils/api"
import type { PersonaResearchStore } from "../store/research-store"
import type { PersonaFile, ResearchFileRef } from "../types"
import { PERSONAS_DIR, getAttachmentPath, parsePersonaFile } from "./researchFiles"

/**
 * Writes personas the user creates or edits in the persona library.
 *
 * The agent remains the main writer of personas/. The page writes only whole persona files it
 * created or that the user is editing, using the same file APIs as other editors:
 * create file → save content → confirm success_files, then re-read the project file list so
 * the library shows the server's state instead of a local copy.
 *
 * | Outcome   | Meaning                                                                 |
 * | saved     | the server confirmed the content                                         |
 * | conflict  | the file changed after the form opened (usually the agent appended data) |
 * | failed    | the write did not happen or could not be confirmed                       |
 */
export type PersonaWriteOutcome = "saved" | "conflict" | "failed"

/** Server error code for a stale expected_revision (same as the PPT editor). */
const REVISION_CONFLICT_CODE = 51152

interface CreatedFile {
	file_id?: string | number
	id?: string | number
}

const createdId = (file: CreatedFile | undefined) => {
	const id = file?.file_id ?? file?.id
	return id === undefined || id === null ? null : String(id)
}

const serialize = (persona: PersonaFile) => `${JSON.stringify(persona, null, 2)}\n`

/** personas/ directory id, created at the project root the first time a user persona is saved. */
async function ensurePersonasDir(store: PersonaResearchStore, projectId: string) {
	const dirName = PERSONAS_DIR.replace(/\/$/, "")
	const existing = store.attachmentList.find(
		(item) => item.is_directory && getAttachmentPath(item).replace(/\/$/, "") === dirName,
	)
	if (existing?.file_id) return String(existing.file_id)
	const created = (await SuperMagicApi.createFile({
		project_id: projectId,
		file_name: dirName,
		is_directory: true,
	})) as CreatedFile
	return createdId(created)
}

export async function createPersonaFile(
	store: PersonaResearchStore,
	persona: PersonaFile,
): Promise<PersonaWriteOutcome> {
	const projectId = store.selectedProject?.id
	if (!projectId || store.isReadOnly) return "failed"
	let fileId: string | null = null
	try {
		const dirId = await ensurePersonasDir(store, projectId)
		if (!dirId) return "failed"
		fileId = createdId(
			(await SuperMagicApi.createFile({
				project_id: projectId,
				parent_id: dirId,
				file_name: `${persona.id}.json`,
				is_directory: false,
			})) as CreatedFile,
		)
		if (!fileId) return "failed"
		const response = await SuperMagicApi.saveFileContent([
			{ file_id: fileId, content: serialize(persona) },
		])
		if (!response?.success_files?.some((file) => String(file.file_id) === fileId)) {
			throw new Error("persona_save_unconfirmed")
		}
	} catch {
		// An empty file would sit in personas/ as "not ready"; remove it best-effort.
		if (fileId) {
			void SuperMagicApi.deleteFiles({ file_ids: [fileId], project_id: projectId }).catch(
				() => undefined,
			)
		}
		return "failed"
	}
	await store.refreshAttachments().catch(() => undefined)
	return "saved"
}

/**
 * Saves an edit only when the file still holds what the form was opened with.
 * Example: the form opened at revision 3; a study then appended evidence (revision 4) →
 * "conflict", nothing is written, and the caller reloads the latest persona.
 */
export async function updatePersonaFile(
	store: PersonaResearchStore,
	ref: ResearchFileRef<PersonaFile>,
	persona: PersonaFile,
): Promise<PersonaWriteOutcome> {
	if (store.isReadOnly) return "failed"
	try {
		const info = await MagicFSApi.getFileInfo(ref.fileId)
		const revision = info?.file?.version
		const { successes } = await getFileContentsByIds([ref.fileId], {
			responseType: "text",
			forceRefresh: true,
			access: store.fileAccess,
		})
		const current = parsePersonaFile(successes.get(ref.fileId))
		if (!current.ok || typeof revision !== "number") return "failed"
		if (JSON.stringify(current.data) !== JSON.stringify(ref.data)) return "conflict"
		const response = await SuperMagicApi.saveFileContent([
			{ file_id: ref.fileId, content: serialize(persona), expected_revision: revision },
		])
		const failure = response?.error_files?.find((file) => String(file.file_id) === ref.fileId)
		if (failure) return failure.error_code === REVISION_CONFLICT_CODE ? "conflict" : "failed"
		if (!response?.success_files?.some((file) => String(file.file_id) === ref.fileId)) {
			return "failed"
		}
	} catch {
		return "failed"
	}
	await store.refreshAttachments().catch(() => undefined)
	return "saved"
}

/** Deletes the persona file; studies that already used it keep their transcripts. */
export async function deletePersonaFile(
	store: PersonaResearchStore,
	ref: ResearchFileRef<PersonaFile>,
): Promise<boolean> {
	const projectId = store.selectedProject?.id
	if (!projectId || store.isReadOnly) return false
	try {
		await SuperMagicApi.deleteFiles({ file_ids: [ref.fileId], project_id: projectId })
	} catch {
		return false
	}
	store.removeAttachmentsLocally([ref.fileId])
	return true
}
