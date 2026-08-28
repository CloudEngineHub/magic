import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const conversationStoreSource = readFileSync(
	resolve(process.cwd(), "src/stores/chatNew/conversation/index.ts"),
	"utf8",
)

function transpileWithoutDefineClassFields() {
	return ts.transpileModule(conversationStoreSource, {
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ES2015,
			useDefineForClassFields: false,
		},
	}).outputText
}

describe("ConversationStore observable fields", () => {
	it.each(["currentConversation", "currentAssistantConversation"])(
		"initializes %s before makeAutoObservable",
		(fieldName) => {
			const output = transpileWithoutDefineClassFields()
			const constructorIndex = output.indexOf("constructor()")
			const makeAutoObservableIndex = output.indexOf(
				"makeAutoObservable(this",
				constructorIndex,
			)

			expect(constructorIndex).toBeGreaterThanOrEqual(0)
			expect(makeAutoObservableIndex).toBeGreaterThan(constructorIndex)
			expect(output.slice(constructorIndex, makeAutoObservableIndex)).toContain(
				`this.${fieldName} = undefined`,
			)
		},
	)
})
