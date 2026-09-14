import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ElementToolTypeEnum } from "../../../../public/props"
import type { ElementToolType } from "../../../../public/props"
import type { ImageElement } from "../../../../runtime/document/types"
import { createElementToolContext } from "../../../../runtime/element-tools/model/ElementToolContext"
import { resolveElementTools } from "../../../../runtime/element-tools/resolver/ElementToolResolver"
import ElementVersionControls from "./ElementVersionControls"

const mocks = vi.hoisted(() => ({
	operations: {
		switchActiveContent: vi.fn(),
		setMainContent: vi.fn(),
		deleteActiveContent: vi.fn(),
	},
	commandBus: {
		execute: vi.fn(),
	},
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({
		canvas: {
			elementManager: {
				getElementInstance: () => mocks.operations,
			},
			elementToolCommandBus: mocks.commandBus,
		},
	}),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({
		t: (key: string, fallback?: string | { defaultValue?: string }) =>
			typeof fallback === "string" ? fallback : (fallback?.defaultValue ?? key),
	}),
}))

vi.mock("../../../../app/hooks/canvas", () => ({
	useIsMediaReplacing: () => false,
}))

function createImageElement(overrides: Partial<ImageElement> = {}): ImageElement {
	return {
		id: "image-1",
		type: "image",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		activeContentId: "version-2",
		mainContentId: "version-1",
		contents: [
			{ contentId: "version-1", src: "one.png", status: "completed" },
			{ contentId: "version-2", src: "two.png", status: "completed" },
		],
		...overrides,
	}
}

function getVersionTools(element: ImageElement) {
	const context = createElementToolContext({
		canvas: {
			elementToolCommandBus: mocks.commandBus,
		} as never,
		selectedElements: [element],
	})
	if (!context) throw new Error("expected tool context")
	const versionToolIds = new Set<ElementToolType>([
		ElementToolTypeEnum.VersionPrevious,
		ElementToolTypeEnum.VersionNext,
		ElementToolTypeEnum.VersionCount,
		ElementToolTypeEnum.VersionSetMain,
		ElementToolTypeEnum.VersionDelete,
	])
	return resolveElementTools(context, "bottom").filter((tool) => versionToolIds.has(tool.id))
}

describe("ElementVersionControls", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("delegates version actions to the element instance", () => {
		const element = createImageElement()
		render(<ElementVersionControls element={element} tools={getVersionTools(element)} />)

		fireEvent.click(screen.getByRole("button", { name: "上一个版本" }))
		fireEvent.click(screen.getByRole("button", { name: "设为主版本" }))
		fireEvent.click(screen.getByRole("button", { name: "删除版本" }))

		expect(mocks.commandBus.execute).toHaveBeenNthCalledWith(1, {
			toolId: ElementToolTypeEnum.VersionPrevious,
			elementId: "image-1",
			contentId: "version-2",
		})
		expect(mocks.commandBus.execute).toHaveBeenNthCalledWith(2, {
			toolId: ElementToolTypeEnum.VersionSetMain,
			elementId: "image-1",
			contentId: "version-2",
		})
		expect(mocks.commandBus.execute).toHaveBeenNthCalledWith(3, {
			toolId: ElementToolTypeEnum.VersionDelete,
			elementId: "image-1",
			contentId: "version-2",
		})
	})

	it("allows deleting an active pending image version but keeps set-main hidden", () => {
		const element = createImageElement({
			contents: [
				{ contentId: "version-1", src: "one.png", status: "completed" },
				{ contentId: "version-2", status: "pending" },
			],
		})
		render(<ElementVersionControls element={element} tools={getVersionTools(element)} />)

		expect(screen.getByRole("button", { name: "上一个版本" })).not.toBeDisabled()
		expect(screen.queryByRole("status")).toBeNull()
		expect(screen.queryByRole("button", { name: "设为主版本" })).toBeNull()
		expect(screen.getByRole("button", { name: "删除版本" })).not.toBeDisabled()
	})

	it("shows deleting for an active failed image version", () => {
		const element = createImageElement({
			contents: [
				{ contentId: "version-1", src: "one.png", status: "completed" },
				{ contentId: "version-2", status: "failed", errorMessage: "generation failed" },
			],
		})
		render(<ElementVersionControls element={element} tools={getVersionTools(element)} />)

		expect(screen.getByRole("button", { name: "删除版本" })).not.toBeDisabled()
	})

	it("keeps browsing available after switching away from a generating version", () => {
		const element = createImageElement({
			activeContentId: "version-1",
			contents: [
				{ contentId: "version-1", src: "one.png", status: "completed" },
				{ contentId: "version-2", status: "processing" },
			],
		})
		render(<ElementVersionControls element={element} tools={getVersionTools(element)} />)

		expect(screen.getByRole("button", { name: "下一个版本" })).not.toBeDisabled()
		expect(screen.getByRole("button", { name: "删除版本" })).not.toBeDisabled()
		fireEvent.click(screen.getByRole("button", { name: "下一个版本" }))
		expect(mocks.commandBus.execute).toHaveBeenCalledWith({
			toolId: ElementToolTypeEnum.VersionNext,
			elementId: "image-1",
			contentId: "version-1",
		})
	})

	it("keeps setting a completed version as main available with a sibling task", () => {
		const element = createImageElement({
			activeContentId: "version-1",
			mainContentId: "version-2",
			contents: [
				{ contentId: "version-1", src: "one.png", status: "completed" },
				{ contentId: "version-2", src: "two.png", status: "completed" },
				{ contentId: "version-3", status: "processing" },
			],
		})
		render(<ElementVersionControls element={element} tools={getVersionTools(element)} />)

		expect(screen.getByRole("button", { name: "设为主版本" })).not.toBeDisabled()
		expect(screen.getByRole("button", { name: "删除版本" })).not.toBeDisabled()
	})
})
