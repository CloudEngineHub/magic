import { describe, expect, test } from "vitest"
import vitePluginStripConsole, { stripConsole } from "../vite-plugin-strip-console"

const run = (code: string, id = "/virtual/test.ts") => stripConsole(code, id, "keep-console")

describe("stripConsole", () => {
	test("removes console expression statements", () => {
		expect(run("a()\nconsole.log(1)\nb()")).toBe("a()\n\nb()")
	})

	test("replaces value-position calls with undefined", () => {
		expect(run("const f = () => console.log(x)\nconst v = cond && console.warn(1)")).toBe(
			"const f = () => undefined\nconst v = cond && undefined",
		)
	})

	test("keeps calls protected by a comment before, inside or after", () => {
		const code = [
			"/** keep-console */ console.log(1)",
			"console.log(/** keep-console */ 2)",
			"console.log(3) // keep-console",
			"// keep-console",
			"console.log(4)",
		].join("\n")
		expect(run(code)).toBeNull()
	})

	test("only the protected call survives when mixed", () => {
		expect(run("console.log(1)\nconsole.log(/** keep-console */ 2)")).toBe(
			"\nconsole.log(/** keep-console */ 2)",
		)
	})

	test("keeps statement validity for single-statement bodies", () => {
		expect(run("if (x) console.log(1)\nelse console.log(2)")).toBe("if (x) ;\nelse ;")
	})

	test("handles computed access and nested calls", () => {
		expect(run('console["log"](console.log(1))\nx()')).toBe("\nx()")
	})

	test("ignores optional chains, shadowed lookups of other objects and strings", () => {
		expect(run('console?.log(1)\nlogger.console.log(1)\nconst s = "console.log(1)"')).toBeNull()
	})

	test("parses tsx and typescript syntax", () => {
		expect(
			run(
				"const A = <T,>(p: T) => { console.log(p); return <div>{p as any}</div> }",
				"/virtual/a.tsx",
			),
		).toBe("const A = <T,>(p: T) => {  return <div>{p as any}</div> }")
	})

	test("leaves unparseable code untouched", () => {
		expect(run("console.log(1) }}}")).toBeNull()
	})
})

describe("vitePluginStripConsole", () => {
	test("filters natively to script modules that mention console", () => {
		const plugin = vitePluginStripConsole()
		const transform = plugin.transform as unknown as {
			filter: { id: RegExp; code: RegExp }
		}
		expect(transform.filter.id.test("/a/b.tsx")).toBe(true)
		expect(transform.filter.id.test("/a/b.tsx?x")).toBe(false)
		expect(transform.filter.id.test("/a/b.css")).toBe(false)
		expect(transform.filter.code.test("console.log(1)")).toBe(true)
		expect(transform.filter.code.test("const x = 1")).toBe(false)
	})
})
