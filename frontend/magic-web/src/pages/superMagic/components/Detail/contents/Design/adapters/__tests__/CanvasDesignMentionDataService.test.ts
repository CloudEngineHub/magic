import { describe, expect, it } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { CanvasDesignMentionDataService } from "../CanvasDesignMentionDataService"
import type { ProjectAttachmentMentionNode } from "@/components/CanvasDesign/types"
import type { I18nTexts } from "@/components/business/MentionPanel/i18n/types"

function folderNode(
	id: string,
	name: string,
	children: ProjectAttachmentMentionNode[] = [],
): ProjectAttachmentMentionNode {
	return {
		id,
		fileId: id,
		name,
		path: id,
		isDirectory: true,
		children,
	}
}

function fileNode(name: string, path: string): ProjectAttachmentMentionNode {
	return {
		id: path,
		fileId: path,
		name,
		path,
		extension: name.includes(".") ? `.${name.split(".").pop() ?? ""}` : "",
		isDirectory: false,
	}
}

describe("CanvasDesignMentionDataService", () => {
	it("keeps folders navigable while keeping project files selectable", async () => {
		const service = new CanvasDesignMentionDataService([
			folderNode("design-a", "Design A", [fileNode("cat.png", "design-a/cat.png")]),
			fileNode("cover.png", "cover.png"),
		])

		const result = await Promise.resolve(
			service.dispatch({
				kind: "default",
				options: { t: {} as I18nTexts },
			}),
		)

		const folder = result.items?.find((item) => item.id === "design-a")
		const file = result.items?.find((item) => item.id === "cover.png")

		expect(folder).toMatchObject({
			type: MentionItemType.FOLDER,
			unSelectable: false,
		})
		expect(file).toMatchObject({
			type: MentionItemType.PROJECT_FILE,
			unSelectable: false,
		})
	})
})
