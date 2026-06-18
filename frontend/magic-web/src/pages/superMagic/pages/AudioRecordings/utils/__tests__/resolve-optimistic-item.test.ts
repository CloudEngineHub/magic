import { describe, expect, it } from "vitest"
import type { AudioProjectListItem } from "@/types/audioProject"
import { shouldResolveOptimisticItem } from "../resolve-optimistic-item"

function makeOptimisticItem(
	overrides: Partial<Pick<AudioProjectListItem, "transferStatus" | "card_status">>,
): AudioProjectListItem {
	return {
		id: "proj-test-001",
		project_name: "test",
		created_at: 1710000000,
		duration: 100,
		tags: [],
		device_id: "",
		audio_source: "recorded",
		current_phase: "summarizing",
		phase_status: "in_progress",
		card_status: "summarizing",
		is_summarized: false,
		...overrides,
	}
}

describe("shouldResolveOptimisticItem", () => {
	it("returns false when the optimistic item is still transferring", () => {
		expect(
			shouldResolveOptimisticItem(makeOptimisticItem({ transferStatus: "transferring" })),
		).toBe(false)
	})

	it("returns false when the optimistic item upload has failed", () => {
		expect(shouldResolveOptimisticItem(makeOptimisticItem({ transferStatus: "failed" }))).toBe(
			false,
		)
	})

	it("returns false when the card status is uploading", () => {
		expect(shouldResolveOptimisticItem(makeOptimisticItem({ card_status: "uploading" }))).toBe(
			false,
		)
	})

	it("returns false when the card status is upload_failed", () => {
		expect(
			shouldResolveOptimisticItem(makeOptimisticItem({ card_status: "upload_failed" })),
		).toBe(false)
	})

	it("returns true when transferStatus is done and card_status is summarizing", () => {
		expect(
			shouldResolveOptimisticItem(
				makeOptimisticItem({ transferStatus: "done", card_status: "summarizing" }),
			),
		).toBe(true)
	})

	it("returns true when card_status is not_summarized", () => {
		expect(
			shouldResolveOptimisticItem(
				makeOptimisticItem({ transferStatus: "done", card_status: "not_summarized" }),
			),
		).toBe(true)
	})

	it("returns true when card_status is summarized", () => {
		expect(
			shouldResolveOptimisticItem(
				makeOptimisticItem({ transferStatus: "done", card_status: "summarized" }),
			),
		).toBe(true)
	})

	it("returns true when card_status is summary_failed", () => {
		expect(
			shouldResolveOptimisticItem(
				makeOptimisticItem({ transferStatus: "done", card_status: "summary_failed" }),
			),
		).toBe(true)
	})

	it("returns true when transferStatus is undefined (no upload phase)", () => {
		expect(shouldResolveOptimisticItem(makeOptimisticItem({ transferStatus: undefined }))).toBe(
			true,
		)
	})
})
