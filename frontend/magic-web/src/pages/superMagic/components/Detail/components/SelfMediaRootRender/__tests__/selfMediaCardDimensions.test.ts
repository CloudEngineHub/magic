import { describe, expect, it } from "vitest"
import { resolveSelfMediaCardScaleContentDimensions } from "../utils/selfMediaCardDimensions"

describe("resolveSelfMediaCardScaleContentDimensions", () => {
	it("uses rednote fixed card canvas dimensions by default", () => {
		expect(resolveSelfMediaCardScaleContentDimensions("rednote")).toEqual({
			width: 540,
			height: 720,
		})
	})

	it("uses instagram fixed card canvas dimensions by default", () => {
		expect(resolveSelfMediaCardScaleContentDimensions("instagram")).toEqual({
			width: 540,
			height: 675,
		})
	})

	it("prefers explicit fixed canvas dimensions from card HTML", () => {
		expect(
			resolveSelfMediaCardScaleContentDimensions(
				"rednote",
				`
					<html>
						<head>
							<style>
								html, body {
									width: 720px;
									height: 960px;
								}
							</style>
						</head>
						<body></body>
					</html>
				`,
			),
		).toEqual({ width: 720, height: 960 })
	})

	it("does not force dimensions for non-card platforms", () => {
		expect(resolveSelfMediaCardScaleContentDimensions("wechat-official-accounts")).toBeNull()
		expect(resolveSelfMediaCardScaleContentDimensions(null)).toBeNull()
	})
})
