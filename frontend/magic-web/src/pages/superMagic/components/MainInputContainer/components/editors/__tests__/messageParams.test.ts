import { describe, expect, it } from "vitest"
import { mergeSceneClientContext } from "../messageParams"

describe("mergeSceneClientContext", () => {
	it("keeps existing dynamic params and sends natural-language client context", () => {
		expect(
			mergeSceneClientContext(
				{
					super_agent: {
						dynamic_params: { message_version: "v2" },
					},
				},
				{
					version: "1.0.0",
					data: { content: "生成方式: 精细; 画幅: 16:9." },
				},
			),
		).toEqual({
			super_agent: {
				dynamic_params: {
					message_version: "v2",
					client_context: {
						version: "1.0.0",
						data: { content: "生成方式: 精细; 画幅: 16:9." },
					},
				},
			},
		})
	})
})
