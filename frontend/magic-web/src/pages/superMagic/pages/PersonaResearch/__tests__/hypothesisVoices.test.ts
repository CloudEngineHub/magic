import { describe, expect, it } from "vitest"
import {
	hypothesisStanceGroups,
	leadQuote,
	quotedPersonaIds,
	sourceRefs,
} from "../services/hypothesisVoices"

describe("hypothesisStanceGroups", () => {
	it("returns null when no theme is linked to the hypothesis", () => {
		expect(
			hypothesisStanceGroups(
				{ id: "H1" },
				[{ hypothesis_ids: ["H2"], stance_by_persona: { a: "support" } }],
				["a"],
			),
		).toBeNull()
	})

	it("groups panel personas by their combined stance across linked themes", () => {
		const groups = hypothesisStanceGroups(
			{ id: "H1" },
			[
				{
					hypothesis_ids: ["H1"],
					stance_by_persona: { a: "support", b: "support", c: "oppose", d: "mixed" },
				},
				{
					hypothesis_ids: ["H1", "H3"],
					stance_by_persona: { b: "oppose", e: "not_mentioned" },
				},
			],
			["a", "b", "c", "d", "e", "f"],
		)
		expect(groups).toEqual([
			{ stance: "support", personaIds: ["a"] },
			{ stance: "partial", personaIds: ["b", "d"] },
			{ stance: "oppose", personaIds: ["c"] },
			{ stance: "none", personaIds: ["e", "f"] },
		])
	})

	it("falls back to personas named in themes when the panel is unknown", () => {
		expect(
			hypothesisStanceGroups(
				{ id: "H1" },
				[{ hypothesis_ids: ["H1"], stance_by_persona: { a: "support" } }],
				[],
			),
		).toEqual([{ stance: "support", personaIds: ["a"] }])
	})
})

describe("evidence helpers", () => {
	const hypothesis = {
		evidence_refs: [
			{ kind: "source" as const, ref: "S8" },
			{ kind: "quote" as const, persona_id: "a", text: "第一句", round_index: 1 },
			{ kind: "quote" as const, persona_id: "b", text: "第二句" },
			{ kind: "quote" as const, persona_id: "a", text: "第三句" },
			{ kind: "source" as const, ref: "S9" },
		],
	}

	it("lists quoted personas once, in citation order", () => {
		expect(quotedPersonaIds(hypothesis)).toEqual(["a", "b"])
	})

	it("picks the first quote as the lead quote", () => {
		expect(leadQuote(hypothesis)?.text).toBe("第一句")
		expect(leadQuote({ evidence_refs: [] })).toBeNull()
	})

	it("collects source ids", () => {
		expect(sourceRefs(hypothesis)).toEqual(["S8", "S9"])
	})
})
