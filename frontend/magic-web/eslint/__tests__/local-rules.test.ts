import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const { Linter } = require("eslint") as typeof import("eslint")

describe("local ESLint rules", () => {
	it("exports project rule overrides from the root eslint directory", () => {
		const {
			browserCompatibilityRestrictions,
			projectRuleOverrides,
		} = require("../project-rule-overrides.cjs")

		expect(projectRuleOverrides["local/no-component-recursion"]).toBe("warn")
		expect(projectRuleOverrides["compat/compat"]).toBe("warn")
		expect(projectRuleOverrides["no-restricted-syntax"]).toEqual([
			"error",
			...browserCompatibilityRestrictions,
		])
		expect(browserCompatibilityRestrictions.map(({ selector }) => selector)).toContain(
			"CallExpression[callee.name='structuredClone']",
		)
	})

	it("derives layer import boundaries from ordered runtime layer config", () => {
		const {
			FORBIDDEN_NON_RUNTIME_DIRS_BY_LAYER,
			RUNTIME_LAYERS,
			layerImportBoundaryOverrides,
		} = require("../layer-import-boundaries.cjs")

		expect(RUNTIME_LAYERS).toEqual([
			{ name: "src", sourceDir: "src", rootDir: "src", alias: "@" },
			{
				name: "enterprise",
				sourceDir: "enterprise/src",
				rootDir: "enterprise",
				alias: "@enterprise",
			},
			{
				name: "customer",
				sourceDir: "customer/src",
				rootDir: "customer",
				alias: "@customer",
			},
		])
		expect(FORBIDDEN_NON_RUNTIME_DIRS_BY_LAYER).toEqual({
			src: ["plugins", "scripts", "test", "types", "vite"],
		})

		const overrideByFile = Object.fromEntries(
			layerImportBoundaryOverrides.map((override) => [override.files[0], override]),
		)
		const srcOverride = overrideByFile["src/**/*.{ts,tsx,js,jsx}"]
		const enterpriseOverride = overrideByFile["enterprise/src/**/*.{ts,tsx,js,jsx}"]

		expect(
			srcOverride.rules["no-restricted-imports"][1].patterns.map(({ group }) => group[0]),
		).toEqual(["@enterprise", "enterprise", "@customer", "customer"])
		expect(
			srcOverride.rules["import/no-restricted-paths"][1].zones.map(({ from }) => from),
		).toEqual([
			"./enterprise",
			"./customer",
			"./plugins",
			"./scripts",
			"./test",
			"./types",
			"./vite",
		])
		expect(
			enterpriseOverride.rules["no-restricted-imports"][1].patterns.map(
				({ group }) => group[0],
			),
		).toEqual(["@customer", "customer"])
		expect(
			enterpriseOverride.rules["import/no-restricted-paths"][1].zones.map(({ from }) => from),
		).toEqual(["./customer"])
		expect(overrideByFile["customer/src/**/*.{ts,tsx,js,jsx}"]).toBeUndefined()
	})

	it("exports custom rules from the root eslint entry", () => {
		const plugin = require("../index.cjs")

		expect(Object.keys(plugin.rules)).toEqual(["no-component-recursion"])
	})

	it("reports a React component that renders itself directly", () => {
		const plugin = require("../index.cjs")
		const linter = new Linter()
		linter.defineRule("local/no-component-recursion", plugin.rules["no-component-recursion"])

		const messages = linter.verify("const MyComponent = () => <MyComponent />", {
			parserOptions: {
				ecmaVersion: 2020,
				ecmaFeatures: { jsx: true },
				sourceType: "module",
			},
			rules: {
				"local/no-component-recursion": "error",
			},
		})

		expect(messages).toHaveLength(1)
		expect(messages[0]?.ruleId).toBe("local/no-component-recursion")
		expect(messages[0]?.message).toContain('Component "MyComponent" is calling itself directly')
	})

	it("allows components to render separate implementation components", () => {
		const plugin = require("../index.cjs")
		const linter = new Linter()
		linter.defineRule("local/no-component-recursion", plugin.rules["no-component-recursion"])

		const messages = linter.verify(
			[
				"const MyComponent = () => <MyComponentImpl />",
				"const MyComponentImpl = () => <div />",
			].join("\n"),
			{
				parserOptions: {
					ecmaVersion: 2020,
					ecmaFeatures: { jsx: true },
					sourceType: "module",
				},
				rules: {
					"local/no-component-recursion": "error",
				},
			},
		)

		expect(messages).toEqual([])
	})
})
