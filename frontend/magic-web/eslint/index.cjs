/**
 * Local ESLint plugin entry.
 *
 * Keep project-specific ESLint rules under this directory so rule code and
 * architecture guardrails live together.
 */
module.exports = {
	rules: {
		"no-component-recursion": require("./rules/no-component-recursion.cjs"),
	},
}
