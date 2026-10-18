import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { collectStudyAttachments } from "../services/researchFiles"
import { buildResearchMentionCatalog } from "../services/researchMentionCatalog"
import type { PersonaFile } from "../types"

const file = (path: string): AttachmentItem => ({
	file_id: `id:${path}`,
	file_name: path.split("/").pop(),
	relative_file_path: `/${path}`,
	is_directory: false,
})

const persona = { id: "p_a", name: "王浩", tagline: "通勤咖啡重度用户" } as PersonaFile

const labels = {
	study: "本次研究",
	personas: "受访人设",
	outputs: "研究产物",
	interviews: "访谈记录",
	interviewOf: (name: string) => `${name} · 访谈记录`,
}

function build(paths: string[]) {
	const study = collectStudyAttachments(paths.map(file), "studies/x/")
	return buildResearchMentionCatalog({
		study,
		projectId: "project-1",
		personas: [{ persona, file: file("personas/p_a.json") }],
		interviewPersonaIdByFileId: new Map([["id:studies/x/interviews/p_a.json", "p_a"]]),
		personaNameById: (id) => (id === "p_a" ? "王浩" : undefined),
		labels,
		renderPersonaIcon: () => "avatar",
	})
}

describe("buildResearchMentionCatalog", () => {
	it("groups personas, existing outputs in a fixed order, and transcripts", () => {
		const catalog = build([
			"studies/x/desk-research.md",
			"studies/x/report.html",
			"studies/x/plan.md",
			"studies/x/study.json",
			"studies/x/interviews/p_a.json",
			"studies/x/interviews/p_b.json",
		])

		expect(catalog.name).toBe("本次研究")
		const byGroup = Object.fromEntries(
			catalog.groups.map((group) => [group.id, group.items.map((item) => item.name)]),
		)
		expect(byGroup).toEqual({
			personas: ["王浩"],
			outputs: ["report.html", "plan.md", "desk-research.md"],
			// An unparsed transcript keeps its file name.
			interviews: ["王浩 · 访谈记录", "p_b.json"],
		})
	})

	it("serialises rows as project_file mentions that keep the real path", () => {
		const catalog = build(["studies/x/interviews/p_a.json"])
		const [personaRow] = catalog.groups[0].items
		const [transcriptRow] = catalog.groups[2].items

		expect(personaRow).toMatchObject({
			id: "id:personas/p_a.json",
			type: "project_file",
			description: "通勤咖啡重度用户",
			icon: "avatar",
			data: {
				file_id: "id:personas/p_a.json",
				file_name: "王浩",
				file_path: "personas/p_a.json",
				file_extension: "json",
				project_id: "project-1",
			},
		})
		expect(transcriptRow?.data).toMatchObject({
			file_name: "王浩 · 访谈记录",
			file_path: "studies/x/interviews/p_a.json",
		})
	})
})
