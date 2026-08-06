import { describe, expect, it } from "vitest"
import { getToolRemarkPreviewStrategy } from "../registry"

describe("tool remark preview registry", () => {
	it("registers write_file as a file_path filename strategy", () => {
		const strategy = getToolRemarkPreviewStrategy("write_file")
		const parser = strategy?.createParser()

		expect(
			parser?.parse('{"file_path": "/app/中国近代史调研/民国社会文化深度调研.html"'),
		).toEqual({
			status: "resolved",
			value: "民国社会文化深度调研.html",
		})
	})

	it("registers read_files as a streaming operations file_path aggregation strategy", () => {
		const strategy = getToolRemarkPreviewStrategy("read_files")
		const parser = strategy?.createParser()

		expect(parser?.parse('{"operations": [{"file_path": "中国近代史科普/index')).toEqual({
			status: "pending",
		})
		expect(
			parser?.parse(
				'{"operations": [{"file_path": "中国近代史科普/index.html", "limit": 50}, {"file_path": "中国近代史科普/detail',
			),
		).toEqual({
			status: "resolved",
			value: "index.html",
		})
		expect(
			parser?.parse(
				'{"operations": [{"file_path": "中国近代史科普/index.html", "limit": 50}, {"file_path": "中国近代史科普/detail.html"}]}',
			),
		).toEqual({
			status: "resolved",
			value: "index.html、detail.html",
		})
	})

	it("registers run_python_snippet as a purpose remark strategy", () => {
		const strategy = getToolRemarkPreviewStrategy("run_python_snippet")
		const parser = strategy?.createParser()

		expect(parser?.parse('{"purpose": "替换HTML锚点')).toEqual({ status: "pending" })
		expect(
			parser?.parse('{"purpose": "替换HTML锚点填充内容", "python_code": "\\nimport re"}'),
		).toEqual({
			status: "resolved",
			value: "替换HTML锚点填充内容",
		})
	})

	it("registers shell_exec as a streaming command strategy", () => {
		const strategy = getToolRemarkPreviewStrategy("shell_exec")
		const parser = strategy?.createParser()

		expect(parser?.parse('{"command": "wc -c \\"/app/report')).toEqual({
			status: "pending",
		})
		expect(
			parser?.parse(
				'{"command": "wc -c \\"/app/report.html\\" && grep -c \\"ANCHOR\\" \\"/app/report.html\\""}',
			),
		).toEqual({
			status: "resolved",
			value: 'wc -c "/app/report.html" && grep -c "ANCHOR" "/app/report.html"',
		})
	})

	it("returns no preview strategy for unregistered tools", () => {
		expect(getToolRemarkPreviewStrategy("read_file")).toBeUndefined()
		expect(getToolRemarkPreviewStrategy("future_tool")).toBeUndefined()
	})
})
