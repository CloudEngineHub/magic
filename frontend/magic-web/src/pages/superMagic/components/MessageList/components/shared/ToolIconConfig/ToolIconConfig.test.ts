import { describe, expect, it } from "vitest"
import { loadToolIcon } from "../../Nodes/ToolCall/ToolIcon"
import { getToolIconConfig } from "./config"

const tableToolNames = [
	"query_magicbase_tables",
	"get_magicbase_table",
	"create_magicbase_table",
	"create_magicbase_column",
	"update_magicbase_table_permissions",
	"delete_magicbase_table",
	"update_magicbase_column",
	"delete_magicbase_column",
]

describe("table tool icons", () => {
	it.each(tableToolNames)(
		"uses the same SVG asset in both tool icon renderers: %s",
		async (toolName) => {
			const configuredAsset = getToolIconConfig(toolName).assetUrl

			expect(configuredAsset).toBeTruthy()
			expect(await loadToolIcon(toolName)).toBe(configuredAsset)
		},
	)
})
