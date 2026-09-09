import { describe, expect, it } from "vitest"
import { getLayoutConstraintHints } from "../layoutConstraintHint"

describe("getLayoutConstraintHints", () => {
	it("explains distributed alignment when gap cannot close leftover space", () => {
		const hints = getLayoutConstraintHints({
			display: "flex",
			justifyContent: "space-between",
			flexDirection: "row",
		})
		expect(hints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "distributed-alignment",
					fix: { justifyContent: "flex-start" },
				}),
			]),
		)
	})

	it("does not hint when alignment already uses fixed packing", () => {
		expect(
			getLayoutConstraintHints({
				display: "flex",
				justifyContent: "flex-start",
			}),
		).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "distributed-alignment" })]),
		)
	})

	it("explains a stretched flex item whose width is owned by the parent", () => {
		const hints = getLayoutConstraintHints({
			display: "block",
			width: "320px",
			parentDisplay: "flex",
			parentFlexDirection: "row",
			parentAlignItems: "stretch",
			flexGrow: "1",
			alignSelf: "auto",
		})
		expect(hints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "parent-owned-size",
					axis: "width",
					fix: {
						flexGrow: "0",
						flexShrink: "0",
						width: "320px",
					},
				}),
			]),
		)
	})

	it("explains a stretched cross-axis size", () => {
		const hints = getLayoutConstraintHints({
			display: "block",
			height: "80px",
			parentDisplay: "flex",
			parentFlexDirection: "row",
			parentAlignItems: "stretch",
			alignSelf: "auto",
			flexGrow: "0",
		})
		expect(hints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "parent-owned-size",
					axis: "height",
				}),
			]),
		)
	})
})
