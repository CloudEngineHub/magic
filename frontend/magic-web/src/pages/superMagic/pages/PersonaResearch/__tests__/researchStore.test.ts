import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { TaskStatus } from "@/pages/superMagic/pages/Workspace/types"
import { SuperMagicApi } from "@/apis"
import { loadAllResearchTopics, loadResearchFiles } from "../services/researchSnapshot"
import { ResearchOperationError } from "../services/researchOperationError"

/** File contents by file id; a missing id hangs until the read is aborted. */
const contents = new Map<string, string>()
const requested: string[][] = []

let serverFiles: AttachmentItem[] = []
let serverTopics: Topic[] = []
let nextTopic = 0
vi.mock("../services/researchSnapshot", () => ({
	loadAllResearchTopics: vi.fn(async () => serverTopics.map((topic) => ({ ...topic }))),
	loadResearchTopics: vi.fn(async () => serverTopics.map((topic) => ({ ...topic }))),
	loadResearchFiles: vi.fn(async () => ({
		tree: serverFiles.slice(),
		list: serverFiles.slice(),
	})),
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentsByIds: vi.fn(async (ids: string[], options: { signal?: AbortSignal }) => {
		requested.push(ids)
		const successes = new Map<string, string>()
		const failures = new Map<string, Error>()
		const hanging = ids.filter((id) => !contents.has(id))
		for (const id of ids) {
			const content = contents.get(id)
			if (content !== undefined) successes.set(id, content)
		}
		if (hanging.length > 0) {
			await new Promise<void>((resolve) => {
				options.signal?.addEventListener("abort", () => resolve())
			})
			for (const id of hanging) failures.set(id, new Error("aborted"))
		}
		return { successes, failures }
	}),
}))

const { PersonaResearchStore } = await import("../store/research-store")

const file = (path: string, version = "1"): AttachmentItem => ({
	file_id: path,
	file_name: path.split("/").pop(),
	relative_file_path: path,
	is_directory: false,
	updated_at: `2026-10-19 10:00:0${version}`,
})

const study = (topicId: string, title: string) =>
	JSON.stringify({
		schema_version: 1,
		topic_id: topicId,
		title,
		question: "q",
		phase: "interview",
		phases: [],
	})

const persona = (id: string) =>
	JSON.stringify({
		schema_version: 1,
		id,
		name: id,
		tier: "standard",
		dimensions: {},
	})

const topic = (id: string): Topic =>
	({ id, topic_name: id, task_status: TaskStatus.FINISHED }) as unknown as Topic

/** 10 library personas, 2 panels and study s1 (topic t1) using persona p9 only. */
function seed() {
	const files: AttachmentItem[] = []
	for (let index = 0; index < 10; index += 1) {
		const path = `personas/p${index}.json`
		files.push(file(path))
		contents.set(path, persona(`p${index}`))
	}
	for (const path of ["panels/a.json", "panels/b.json"]) {
		files.push(file(path))
		contents.set(
			path,
			JSON.stringify({ schema_version: 1, id: path, name: path, persona_ids: [] }),
		)
	}
	files.push(file("studies/s1/study.json"), file("studies/s2/study.json"))
	contents.set("studies/s1/study.json", study("t1", "S1"))
	contents.set("studies/s2/study.json", study("t2", "S2"))
	files.push(file("studies/s1/panel.json"))
	contents.set(
		"studies/s1/panel.json",
		JSON.stringify({ schema_version: 1, id: "s1", name: "s1", persona_ids: ["p9"] }),
	)
	return files
}

function createStore(files: AttachmentItem[]) {
	const store = new PersonaResearchStore()
	serverFiles = files.slice()
	serverTopics = [topic("t1"), topic("t2")]
	store.topicStore.setTopics(serverTopics)
	store.setAttachments(files, files)
	return store
}

const downloaded = () => requested.flat()

describe("PersonaResearchStore content reads", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		contents.clear()
		requested.length = 0
		nextTopic = 0
		vi.mocked(loadAllResearchTopics).mockImplementation(async () =>
			serverTopics.map((topic) => ({ ...topic })),
		)
		vi.mocked(loadResearchFiles).mockImplementation(
			async () => ({ tree: serverFiles.slice(), list: serverFiles.slice() }) as never,
		)
		vi.spyOn(SuperMagicApi, "createTopic").mockImplementation(async () => {
			const created = {
				...topic(`child-${++nextTopic}`),
				topic_name: "",
				task_status: TaskStatus.WAITING,
			}
			serverTopics.push(created)
			return created as never
		})
		vi.spyOn(SuperMagicApi, "editTopic").mockImplementation(async ({ id, topic_name }) => {
			serverTopics = serverTopics.map((item) =>
				item.id === id ? { ...item, topic_name } : item,
			)
			return undefined as never
		})
		vi.spyOn(SuperMagicApi, "createFile").mockImplementation(
			async ({ file_name, is_directory, parent_id, ignore_duplicate }) => {
				const path = parent_id ? `study-topics/${file_name}` : file_name
				const existing = serverFiles.find((item) => item.relative_file_path === path)
				if (existing && ignore_duplicate) return existing as never
				if (existing) throw new Error("duplicate file")
				const created = { ...file(path), is_directory }
				serverFiles.push(created)
				contents.set(path, "")
				return created as never
			},
		)
		vi.spyOn(SuperMagicApi, "saveFileContent").mockImplementation(async (items) => {
			for (const item of items) {
				contents.set(item.file_id, item.content)
				serverFiles = serverFiles.map((entry) =>
					String(entry.file_id) === item.file_id
						? { ...entry, updated_at: "v2", file_size: item.content.length }
						: entry,
				)
			}
			return { success_files: items.map((item) => ({ file_id: item.file_id })) } as never
		})
		vi.spyOn(SuperMagicApi, "deleteTopic").mockImplementation(async ({ id }) => {
			serverTopics = serverTopics.filter((item) => item.id !== id)
			return undefined as never
		})
		vi.spyOn(SuperMagicApi, "deleteFiles").mockImplementation(async ({ file_ids }) => {
			serverFiles = serverFiles.filter((item) => !file_ids.includes(String(item.file_id)))
			for (const id of file_ids) contents.delete(id)
			return { file_ids } as never
		})
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it("opens a study without downloading any file twice or reading the whole library", async () => {
		const store = createStore(seed())
		// The studio selects its study while the bootstrap read is still running.
		store.selectStudy("t1")
		await store.reloadParsedContent()

		const ids = downloaded()
		expect(new Set(ids).size).toBe(ids.length)
		expect(ids).toContain("personas/p9.json")
		expect(ids).not.toContain("personas/p7.json")
		expect(ids.some((id) => id.startsWith("panels/"))).toBe(false)
		expect(store.loadedStudyTopicId).toBe("t1")
		expect(store.study?.title).toBe("S1")
		expect(store.personaById("p9")?.name).toBe("p9")
		expect(store.personaFileCount).toBe(10)
	})

	it("reads every persona and panel once the library page asks for it", async () => {
		const store = createStore(seed())
		await store.reloadParsedContent()
		expect(store.libraryLoaded).toBe(false)

		store.requestLibrary()
		await store.reloadParsedContent()
		expect(store.libraryLoaded).toBe(true)
		expect(store.personas).toHaveLength(10)
		expect(store.panels).toHaveLength(2)
	})

	it("keeps lists and refs of unchanged files across reads", async () => {
		const files = seed()
		const store = createStore(files)
		store.selectStudy("t1")
		await store.reloadParsedContent()
		const personas = store.personas
		const requestCount = requested.length

		store.setAttachments(files, files)
		await store.reloadParsedContent()
		expect(requested.length).toBe(requestCount)
		expect(store.personas).toBe(personas)
	})

	it("re-downloads only the file whose version changed", async () => {
		const files = seed()
		const store = createStore(files)
		store.selectStudy("t1")
		await store.reloadParsedContent()
		requested.length = 0

		contents.set("studies/s1/study.json", study("t1", "S1 v2"))
		const next = files.map((item) =>
			item.relative_file_path === "studies/s1/study.json"
				? file("studies/s1/study.json", "2")
				: item,
		)
		store.setAttachments(next, next)
		await store.reloadParsedContent()
		expect(downloaded()).toEqual(["studies/s1/study.json"])
		expect(store.study?.title).toBe("S1 v2")
	})

	it("ends the loading state when a download hangs", async () => {
		vi.useFakeTimers()
		const files = seed()
		contents.delete("studies/s1/panel.json")
		const store = createStore(files)
		store.selectStudy("t1")
		const done = store.reloadParsedContent()
		// Two reads run: the bootstrap one and the one for the selected study; each gives the
		// hanging file one timeout, and the failed file is retried by the next read.
		await vi.advanceTimersByTimeAsync(60_000)
		await done
		expect(store.isStudyContentLoading).toBe(false)
		expect(store.study?.title).toBe("S1")
	})

	it("matches list rows to their study through one index", async () => {
		const store = createStore(seed())
		await store.reloadParsedContent()
		expect(store.studyFileOf(topic("t2"))?.title).toBe("S2")
		expect(store.studies.map((item) => item.id).sort()).toEqual(["t1", "t2"])
	})

	it("restores independent markers into one study and excludes template chats", async () => {
		const files = seed()
		addMarker(files, "child")
		addMarker(files, "template")
		files.push(file("template-chats/template.json"))
		const store = createStore(files)
		setTopics(store, [topic("child"), topic("template"), topic("t2"), topic("t1")])
		store.selectStudy("child")
		await store.reloadParsedContent()
		expect(store.studyDir).toBe("studies/s1/")
		expect(store.study?.topic_id).toBe("t1")
		expect(store.studyTopics.map((item) => item.id).sort()).toEqual(["child", "t1"])
		expect(store.studies.map((item) => item.id).sort()).toEqual(["t1", "t2"])
	})

	it("two clients create different markers without overwriting study state or one another", async () => {
		const files = seed()
		const first = createStore(files)
		const second = createStore(files)
		for (const store of [first, second]) {
			store.selectedProject = { id: "project" } as never
			store.selectStudy("t1")
			await store.reloadParsedContent()
		}
		const before = contents.get("studies/s1/study.json")
		await Promise.all([first.createStudyTopic("Pricing"), second.createStudyTopic("Evidence")])
		expect(contents.get("studies/s1/study.json")).toBe(before)
		expect(serverTopics.find((item) => item.id === "t1")?.topic_name).toBe("t1")
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ file_id: "studies/s1/study.json" })]),
		)
		await first.refreshResearchSnapshot()
		expect(first.studyTopics.map((item) => item.id).sort()).toEqual([
			"child-1",
			"child-2",
			"t1",
		])
		first.selectStudy("child-2")
		await first.reloadParsedContent()
		expect(
			first
				.conversationReferences("child-2")
				.map((item) => (item.attrs.data as { file_path: string }).file_path),
		).toEqual(["studies/s1/study.json", "study-topics/child-2.json"])
		expect(first.studies.map((item) => item.id).sort()).toEqual(["t1", "t2"])
	})

	it("does not overwrite a running tool's new study state while saving a relationship", async () => {
		const store = await readyStore()
		const originalSave = vi.mocked(SuperMagicApi.saveFileContent).getMockImplementation()
		vi.mocked(SuperMagicApi.saveFileContent).mockImplementation(async (items) => {
			contents.set(
				"studies/s1/study.json",
				JSON.stringify({
					...JSON.parse(study("t1", "S1")),
					phase: "report",
					limits: { personas: 7 },
				}),
			)
			serverFiles = serverFiles.map((item) =>
				item.file_id === "studies/s1/study.json" ? { ...item, updated_at: "v3" } : item,
			)
			if (!originalSave) throw new Error("missing save mock")
			return originalSave(items)
		})
		await store.createStudyTopic("New")
		expect(JSON.parse(contents.get("studies/s1/study.json") ?? "{}").limits.personas).toBe(7)
		expect(store.studyTopics).toHaveLength(2)
	})

	it("keeps the created conversation and link if only naming fails", async () => {
		const store = await readyStore()
		const cause = new Error("rename failed")
		vi.mocked(SuperMagicApi.editTopic).mockRejectedValue(cause)
		const error = await store.createStudyTopic("Follow up").catch((failure) => failure)
		expect(error).toBeInstanceOf(ResearchOperationError)
		expect(error.originalError).toBe(cause)
		expect(error.stage).toBe("rename")
		expect(error.progress.markerSaved).toBe(true)
		expect(serverTopics.some((item) => item.id === "child-1")).toBe(true)
		expect(store.studyTopics.map((item) => item.id)).toContain("child-1")
		expect(SuperMagicApi.deleteTopic).not.toHaveBeenCalled()
	})

	it("keeps the original link error and both failed compensation errors", async () => {
		const store = await readyStore()
		const original = new Error("save failed")
		vi.mocked(SuperMagicApi.saveFileContent).mockRejectedValue(original)
		vi.mocked(SuperMagicApi.deleteFiles).mockRejectedValue(new Error("file cleanup failed"))
		vi.mocked(SuperMagicApi.deleteTopic).mockRejectedValue(new Error("topic cleanup failed"))
		const error = await store.createStudyTopic("Follow up").catch((failure) => failure)
		expect(error.originalError).toBe(original)
		expect(error.cleanupErrors).toHaveLength(2)
		expect(store.isChangingStudyTopics).toBe(false)
		expect(store.studies.map((item) => item.id).sort()).toEqual(["t1", "t2"])
	})

	it("deletes a child without deleting research outputs", async () => {
		const store = await readyStore(["child"])
		await store.deleteStudyTopic("child")
		expect(contents.has("studies/s1/study.json")).toBe(true)
		expect(serverTopics.some((item) => item.id === "child")).toBe(false)
		expect(contents.has("study-topics/child.json")).toBe(false)
	})

	it("refreshes before deleting and includes a child added on another client", async () => {
		const store = await readyStore(["child"])
		addMarker(serverFiles, "late")
		serverTopics.push(topic("late"))
		await store.deleteStudy("t1")
		expect(vi.mocked(SuperMagicApi.deleteTopic).mock.calls.map(([arg]) => arg.id)).toEqual([
			"child",
			"late",
			"t1",
		])
		expect(serverFiles.some((item) => item.relative_file_path?.startsWith("studies/s1/"))).toBe(
			false,
		)
		expect(contents.has("studies/s2/study.json")).toBe(true)
		expect(contents.has("study-topics/t1.json")).toBe(true)
		expect(store.studies.map((item) => item.id)).toEqual(["t2"])
	})

	it("records file deletion immediately and restores pending deletion after primary failure", async () => {
		const store = await readyStore(["child"])
		const remove = vi.mocked(SuperMagicApi.deleteTopic).getMockImplementation()
		vi.mocked(SuperMagicApi.deleteTopic).mockImplementation(async (args) => {
			if (args.id === "t1") throw new Error("primary failed")
			if (remove) return remove(args)
		})
		const error = await store.deleteStudy("t1").catch((failure) => failure)
		expect(error.progress.filesDeleted).toBe(true)
		expect(
			store.attachmentList.some((item) => item.relative_file_path?.startsWith("studies/s1/")),
		).toBe(false)
		expect(store.studyDeletionOf("t1")?.state).toBe("deleting")
		const fresh = createStore(serverFiles)
		fresh.selectedProject = { id: "project" } as never
		await fresh.refreshResearchSnapshot()
		expect(fresh.studyDeletionOf("t1")?.state).toBe("deleting")
		vi.mocked(SuperMagicApi.deleteTopic).mockImplementation(async ({ id }) => {
			serverTopics = serverTopics.filter((item) => item.id !== id)
			return undefined as never
		})
		await fresh.deleteStudy("t1")
		expect(serverTopics.some((item) => item.id === "t1")).toBe(false)
	})

	it("retains outputs and primary entry if a child deletion fails, then retries", async () => {
		const store = await readyStore(["c1", "c2"])
		const remove = vi.mocked(SuperMagicApi.deleteTopic).getMockImplementation()
		vi.mocked(SuperMagicApi.deleteTopic).mockImplementation(async (args) => {
			if (args.id === "c2") throw new Error("child failed")
			if (remove) return remove(args)
		})
		const error = await store.deleteStudy("t1").catch((failure) => failure)
		expect(error.progress.deletedTopicIds).toEqual(["c1"])
		expect(contents.has("studies/s1/study.json")).toBe(true)
		expect(store.studies.map((item) => item.id).sort()).toEqual(["t1", "t2"])
		vi.mocked(SuperMagicApi.deleteTopic).mockImplementation(async ({ id }) => {
			serverTopics = serverTopics.filter((item) => item.id !== id)
			return undefined as never
		})
		await store.deleteStudy("t1")
		expect(serverTopics.map((item) => item.id)).toEqual(["t2"])
	})

	it("does not write when complete preflight reads fail", async () => {
		const store = await readyStore()
		vi.mocked(loadAllResearchTopics).mockRejectedValue(new Error("incomplete page"))
		await expect(store.deleteStudy("t1")).rejects.toThrow()
		expect(SuperMagicApi.deleteTopic).not.toHaveBeenCalled()
		expect(SuperMagicApi.deleteFiles).not.toHaveBeenCalled()
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})

	it("rechecks running state and deletion intent from the server before creating", async () => {
		const store = await readyStore(["child"])
		serverTopics = serverTopics.map((item) =>
			item.id === "child" ? { ...item, task_status: TaskStatus.RUNNING } : item,
		)
		await expect(store.createStudyTopic("no")).rejects.toThrow()
		expect(SuperMagicApi.createTopic).not.toHaveBeenCalled()
	})

	it("retries an empty deletion intent left by an unconfirmed save", async () => {
		const store = await readyStore()
		const save = vi.mocked(SuperMagicApi.saveFileContent).getMockImplementation()
		vi.mocked(SuperMagicApi.saveFileContent).mockRejectedValueOnce(
			new Error("intent save failed"),
		)
		await expect(store.deleteStudy("t1")).rejects.toThrow()
		expect(contents.get("study-topics/t1.json")).toBe("")
		expect(contents.has("studies/s1/study.json")).toBe(true)
		if (save) vi.mocked(SuperMagicApi.saveFileContent).mockImplementation(save)
		await store.deleteStudy("t1")
		expect(serverTopics.map((item) => item.id)).toEqual(["t2"])
	})

	it("retains the primary and outputs if file deletion fails, and resumes after refresh", async () => {
		const store = await readyStore(["child"])
		const removeFiles = vi.mocked(SuperMagicApi.deleteFiles).getMockImplementation()
		vi.mocked(SuperMagicApi.deleteFiles).mockRejectedValueOnce(
			new Error("file deletion failed"),
		)
		const error = await store.deleteStudy("t1").catch((failure) => failure)
		expect(error.progress.filesDeleted).toBe(false)
		expect(contents.has("studies/s1/study.json")).toBe(true)
		expect(serverTopics.some((item) => item.id === "t1")).toBe(true)
		expect(store.studyDeletionOf("t1")).not.toBeNull()
		if (removeFiles) vi.mocked(SuperMagicApi.deleteFiles).mockImplementation(removeFiles)
		await store.deleteStudy("t1")
		expect(contents.has("studies/s1/study.json")).toBe(false)
	})

	it("rejects a relationship pointing at another study before any destructive operation", async () => {
		const store = await readyStore()
		addMarker(serverFiles, "child")
		contents.set(
			"study-topics/child.json",
			JSON.stringify({
				schema_version: 1,
				topic_id: "child",
				primary_topic_id: "t1",
				study_dir: "studies/s2",
				state: "linked",
				title: "Wrong",
			}),
		)
		serverTopics.push(topic("child"))
		await expect(store.deleteStudy("t1")).rejects.toThrow()
		expect(SuperMagicApi.deleteTopic).not.toHaveBeenCalled()
		expect(SuperMagicApi.deleteFiles).not.toHaveBeenCalled()
		expect(store.studyFileOf(topic("t2"))?.title).toBe("S2")
	})

	it("a concurrent deletion intent prevents a newly saved link from surviving compensation", async () => {
		const store = await readyStore()
		const save = vi.mocked(SuperMagicApi.saveFileContent).getMockImplementation()
		vi.mocked(SuperMagicApi.saveFileContent).mockImplementation(async (items) => {
			if (!save) throw new Error("missing save mock")
			const response = await save(items)
			if (items.some((item) => item.file_id === "study-topics/child-1.json"))
				addMarker(serverFiles, "t1", "deleting")
			return response
		})
		const error = await store.createStudyTopic("Late").catch((failure) => failure)
		expect(error.stage).toBe("link")
		expect(error.progress.topic).toBeUndefined()
		expect(error.progress.markerSaved).toBe(false)
		expect(serverTopics.some((item) => item.id === "child-1")).toBe(false)
		expect(contents.has("study-topics/child-1.json")).toBe(false)
	})

	it("reconciles lost file-delete acknowledgement without claiming outputs are intact", async () => {
		const store = await readyStore()
		const remove = vi.mocked(SuperMagicApi.deleteFiles).getMockImplementation()
		const original = new Error("delete response lost")
		vi.mocked(SuperMagicApi.deleteFiles).mockImplementation(async (args) => {
			if (remove) await remove(args)
			throw original
		})
		const error = await store.deleteStudy("t1").catch((failure) => failure)
		expect(error.originalError).toBe(original)
		expect(error.progress.filesDeleted).toBe(true)
		expect(error.progress.completed).toBe(false)
		expect(
			store.attachmentList.some((item) => item.relative_file_path?.startsWith("studies/s1/")),
		).toBe(false)
	})

	it("recognizes completion after a lost primary-delete acknowledgement", async () => {
		const store = await readyStore()
		const remove = vi.mocked(SuperMagicApi.deleteTopic).getMockImplementation()
		const original = new Error("primary response lost")
		vi.mocked(SuperMagicApi.deleteTopic).mockImplementation(async (args) => {
			if (remove) await remove(args)
			if (args.id === "t1") throw original
			return undefined as never
		})
		const error = await store.deleteStudy("t1").catch((failure) => failure)
		expect(error.originalError).toBe(original)
		expect(error.progress.completed).toBe(true)
		expect(store.studies.map((item) => item.id)).toEqual(["t2"])
	})

	it("retains remote success without committing an old marker after scope switches during save", async () => {
		const store = await readyStore()
		const save = vi.mocked(SuperMagicApi.saveFileContent).getMockImplementation()
		vi.mocked(SuperMagicApi.saveFileContent).mockImplementation(async (items) => {
			if (!save) throw new Error("missing save mock")
			const result = await save(items)
			store.setSelectedProject({ id: "new-project" } as never)
			store.topicStore.setTopics([topic("new-topic")])
			store.setAttachments([], [])
			return result
		})
		const error = await store.createStudyTopic("Old scope").catch((failure) => failure)
		await store.reloadParsedContent()
		expect(error.stage).toBe("verify")
		expect(error.originalError.message).toBe("study_topic_scope_changed")
		expect(error.progress.markerSaved).toBe(true)
		expect(contents.has("study-topics/child-1.json")).toBe(true)
		expect(store.selectedProject?.id).toBe("new-project")
		expect(store.topicStore.topics.map((item) => item.id)).toEqual(["new-topic"])
		expect(store.attachmentList).toEqual([])
		expect(SuperMagicApi.editTopic).not.toHaveBeenCalled()
		expect(SuperMagicApi.deleteTopic).not.toHaveBeenCalled()
	})

	it("never reuses a blank linked child as a new study after a fallback read", async () => {
		const store = await readyStore()
		addMarker(serverFiles, "blank-child")
		serverTopics.push({
			...topic("blank-child"),
			topic_name: "",
			task_status: TaskStatus.WAITING,
		})
		const created = await store.prepareStudyTopic()
		expect(created?.id).toBe("child-1")
		expect(created?.id).not.toBe("blank-child")
		expect(store.studyFileOf(topic("blank-child"))?.topic_id).toBe("t1")
	})

	it("an orphan file left by failed cleanup cannot claim a study or block unrelated creation", async () => {
		const store = await readyStore()
		serverFiles.push(file("study-topics/gone.json"))
		contents.set("study-topics/gone.json", "")
		const created = await store.createStudyTopic("New")
		expect(created?.id).toBe("child-1")
		expect(store.studies.map((item) => item.id).sort()).toEqual(["t1", "t2"])
	})

	it("does not expand a share's topics or permit writes", async () => {
		const files = seed()
		addMarker(files, "child")
		const store = createStore(files)
		store.isReadOnly = true
		store.topicStore.setTopics([topic("child")])
		store.selectStudy("child")
		await store.reloadParsedContent()
		expect(store.studyDir).toBe("studies/s1/")
		expect(store.studyTopics.map((item) => item.id)).toEqual(["child"])
		expect(await store.createStudyTopic("no")).toBeNull()
	})
})

function addMarker(files: AttachmentItem[], id: string, state: "linked" | "deleting" = "linked") {
	const path = `study-topics/${id}.json`
	files.push(file(path))
	contents.set(
		path,
		JSON.stringify({
			schema_version: 1,
			topic_id: id,
			primary_topic_id: "t1",
			study_dir: "studies/s1",
			state,
			title: "S1",
		}),
	)
}
function setTopics(store: InstanceType<typeof PersonaResearchStore>, topics: Topic[]) {
	serverTopics = topics
	store.topicStore.setTopics(topics)
}
async function readyStore(children: string[] = []) {
	const files = seed()
	for (const child of children) addMarker(files, child)
	const store = createStore(files)
	setTopics(store, [topic("t1"), topic("t2"), ...children.map(topic)])
	store.selectedProject = { id: "project" } as never
	store.selectStudy("t1")
	await store.reloadParsedContent()
	return store
}
