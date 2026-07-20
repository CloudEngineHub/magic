import { describe, expect, it } from "vitest"
import type { I18nTexts } from "../../../../../i18n/types"
import { MentionItemType, type MentionItem } from "../../../../../types"
import { workspaceFilesRendererEntries } from "../renderer"

const t = {
	selectPathItemDescription: {
		rootDirectory: "根目录",
	},
	defaultItems: {
		canvasElements: "画布元素",
	},
} as I18nTexts

function getProjectFileTypeDescription(item: MentionItem, isSearch = true) {
	const renderer = workspaceFilesRendererEntries.find(
		([type]) => type === MentionItemType.PROJECT_FILE,
	)?.[1]

	return renderer?.getTypeDescription?.({
		item,
		t,
		isSearch,
		platform: "desktop",
	})
}

function createProjectFileItem(filePath: string): MentionItem {
	return {
		id: "file-hero",
		type: MentionItemType.PROJECT_FILE,
		name: "hero.png",
		icon: "png",
		extension: "png",
		hasChildren: false,
		isFolder: false,
		path: filePath,
		metadata: {
			mentionFileSubtitleParentPrefix: "皮卡丘",
		},
		data: {
			file_id: "file-hero",
			file_name: "hero.png",
			file_path: filePath,
			file_extension: "png",
		},
	}
}

describe("workspaceFilesRendererEntries", () => {
	it("formats canvas dsl-relative search paths without leaking current-directory prefix", () => {
		expect(getProjectFileTypeDescription(createProjectFileItem("./images/hero.png"))).toBe(
			"皮卡丘/images",
		)
	})

	it("formats canvas dsl-relative root files as the canvas folder", () => {
		expect(getProjectFileTypeDescription(createProjectFileItem("./hero.png"))).toBe("皮卡丘")
	})

	it("keeps ordinary project paths unchanged when no canvas subtitle prefix exists", () => {
		const item = createProjectFileItem("docs/images/hero.png")
		delete item.metadata

		expect(getProjectFileTypeDescription(item)).toBe("docs/images")
	})
})
