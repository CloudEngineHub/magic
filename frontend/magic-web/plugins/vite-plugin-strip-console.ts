import type { Plugin } from "vite"
import {
	createSourceFile,
	getTrailingCommentRanges,
	isCallExpression,
	isElementAccessExpression,
	isIdentifier,
	isPropertyAccessExpression,
	ScriptKind,
	ScriptTarget,
	SyntaxKind,
	type CallExpression,
	type Node,
	type SourceFile,
} from "typescript"

/**
 * Production-only replacement for `vite-plugin-keep-console`.
 *
 * The old plugin ran a full Babel parse + traverse + regenerate (with sourcemaps) on every
 * ts/tsx/js/jsx module, ~29k of them including node_modules, although only a few percent
 * mention `console`. This plugin keeps the same semantics but:
 * - skips modules without `console.` via a native hook filter (no JS call at all);
 * - parses the remaining ones with the TypeScript parser (no type-check, no parent pointers);
 * - edits by source ranges instead of regenerating code, so untouched code stays byte-identical.
 *
 * Semantics (same as before): every `console.x(...)` / `console[x](...)` call is removed unless
 * a comment containing the keep marker sits before/after the call or its statement, or inside
 * the call. A removed expression statement disappears; a call used as a value becomes `undefined`.
 */

const DEFAULT_KEEP_MARKER = "keep-console"
// Same module set as the old plugin: matched against the raw id, so query ids are skipped.
const SCRIPT_ID_FILTER = /\.(?:ts|tsx|js|jsx)$/
// Cheap prefilter; false positives (strings, comments) just fall through to the AST check.
const CONSOLE_CODE_FILTER = /\bconsole\s*[.[]/

interface StripConsoleOptions {
	/** Comment text that protects a console call from removal. */
	keepMarker?: string
}

interface Edit {
	start: number
	end: number
	text: string
}

function getScriptKind(id: string): ScriptKind {
	if (id.endsWith(".tsx")) return ScriptKind.TSX
	if (id.endsWith(".jsx")) return ScriptKind.JSX
	if (id.endsWith(".js")) return ScriptKind.JS
	return ScriptKind.TS
}

function isConsoleCall(node: Node): node is CallExpression {
	if (!isCallExpression(node)) return false
	const callee = node.expression
	// Optional chains (`console?.log`) were never matched by the old plugin; keep that.
	if (!isPropertyAccessExpression(callee) && !isElementAccessExpression(callee)) return false
	if (callee.questionDotToken) return false
	return isIdentifier(callee.expression) && callee.expression.text === "console"
}

/** Text that the old Babel logic considered: leading/trailing/inner comments of call and statement. */
function hasKeepMarker(node: Node, statement: Node | undefined, source: string, marker: string) {
	const scope = statement ?? node
	// getFullStart includes leading trivia (comments) which is where `// keep-console` lives.
	const scoped = source.slice(scope.getFullStart(), scope.getEnd())
	if (scoped.includes(marker)) return true

	const trailing = getTrailingCommentRanges(source, scope.getEnd())
	return Boolean(trailing?.some((range) => source.slice(range.pos, range.end).includes(marker)))
}

function collectEdits(sourceFile: SourceFile, source: string, marker: string): Edit[] {
	const edits: Edit[] = []

	const visit = (node: Node) => {
		if (isConsoleCall(node)) {
			const parent = node.parent
			const isStatement = parent.kind === SyntaxKind.ExpressionStatement
			const statement = isStatement ? parent : undefined

			if (!hasKeepMarker(node, statement, source, marker)) {
				if (statement) {
					// Statement lists can drop the node; single-statement bodies (`if (x) console.log()`)
					// need an empty statement to stay syntactically valid.
					const inList = [
						SyntaxKind.Block,
						SyntaxKind.SourceFile,
						SyntaxKind.ModuleBlock,
						SyntaxKind.CaseClause,
						SyntaxKind.DefaultClause,
					].includes(statement.parent.kind)
					edits.push({
						start: statement.getStart(sourceFile),
						end: statement.getEnd(),
						text: inList ? "" : ";",
					})
				} else {
					edits.push({
						start: node.getStart(sourceFile),
						end: node.getEnd(),
						text: "undefined",
					})
				}
			}
			// Nested console calls live inside the replaced range (or are kept with their parent).
			return
		}

		node.forEachChild(visit)
	}

	visit(sourceFile)
	return edits
}

function applyEdits(source: string, edits: Edit[]): string {
	let result = ""
	let cursor = 0
	for (const edit of edits.sort((a, b) => a.start - b.start)) {
		result += source.slice(cursor, edit.start) + edit.text
		cursor = edit.end
	}
	return result + source.slice(cursor)
}

export function stripConsole(code: string, id: string, keepMarker: string): string | null {
	const sourceFile = createSourceFile(
		id,
		code,
		ScriptTarget.Latest,
		// Parent pointers are required to tell expression statements from value positions.
		true,
		getScriptKind(id),
	)
	// Never edit a tree the parser had to recover; leaving console calls in is the safe failure.
	const diagnostics = (sourceFile as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics
	if (diagnostics?.length) return null

	const edits = collectEdits(sourceFile, code, keepMarker)
	return edits.length > 0 ? applyEdits(code, edits) : null
}

export default function vitePluginStripConsole({
	keepMarker = DEFAULT_KEEP_MARKER,
}: StripConsoleOptions = {}): Plugin {
	return {
		name: "magic-strip-console",
		enforce: "pre",
		apply: "build",
		transform: {
			// Hook filters are evaluated natively by Rolldown, so non-matching modules never enter JS.
			filter: { id: SCRIPT_ID_FILTER, code: CONSOLE_CODE_FILTER },
			handler(code, id) {
				const transformed = stripConsole(code, id, keepMarker)
				// Sourcemaps are off in production by default; removed ranges are statement-granular.
				return transformed === null ? null : { code: transformed, map: null }
			},
		},
	}
}
