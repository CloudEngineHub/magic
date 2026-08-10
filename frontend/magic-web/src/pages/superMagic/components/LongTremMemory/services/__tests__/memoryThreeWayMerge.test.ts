import { describe, expect, it } from "vitest"
import { mergeMemoryContent } from "../memoryThreeWayMerge"

const labels = {
	local: "本地修改",
	remote: "最新内容",
}

describe("mergeMemoryContent", () => {
	it("本地未修改时直接采用服务器最新内容", () => {
		const result = mergeMemoryContent(
			"第一行\n第二行",
			"第一行\n第二行",
			"第一行\n远端第二行",
			labels,
		)

		expect(result).toEqual({
			content: "第一行\n远端第二行",
			hasConflicts: false,
		})
	})

	it("自动合并双方位于不同行的修改", () => {
		const result = mergeMemoryContent(
			"标题\n用户偏好\n项目约定\n结束",
			"标题\n用户偏好：中文\n项目约定\n结束",
			"标题\n用户偏好\n项目约定：周五发布\n结束",
			labels,
		)

		expect(result).toEqual({
			content: "标题\n用户偏好：中文\n项目约定：周五发布\n结束",
			hasConflicts: false,
		})
	})

	it("双方做出相同修改时只保留一份", () => {
		const result = mergeMemoryContent(
			"标题\n原始结论\n结束",
			"标题\n更新结论\n结束",
			"标题\n更新结论\n结束",
			labels,
		)

		expect(result).toEqual({
			content: "标题\n更新结论\n结束",
			hasConflicts: false,
		})
	})

	it("双方修改同一段且内容不同时生成冲突标记", () => {
		const result = mergeMemoryContent(
			"标题\n原始结论\n结束",
			"标题\n本地结论\n结束",
			"标题\n远端结论\n结束",
			labels,
		)

		expect(result.hasConflicts).toBe(true)
		expect(result.content).toBe(
			"标题\n<<<<<<< 本地修改\n本地结论\n=======\n远端结论\n>>>>>>> 最新内容\n结束",
		)
	})

	it("保留双方在不同位置新增的内容", () => {
		const result = mergeMemoryContent(
			"标题\n结束",
			"标题\n本地补充\n结束",
			"标题\n结束\n远端补充",
			labels,
		)

		expect(result).toEqual({
			content: "标题\n本地补充\n结束\n远端补充",
			hasConflicts: false,
		})
	})
})
