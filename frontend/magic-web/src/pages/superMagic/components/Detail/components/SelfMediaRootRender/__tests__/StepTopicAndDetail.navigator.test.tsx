import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { createArticle, globalSettings, StepTopicAndDetail } from "./StepTopicAndDetail.testHarness"

describe("StepTopicAndDetail navigator interactions", () => {
	it("supports keyboard selection from the article navigator", () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle(), createArticle({ title: "第二篇", folderName: "p2" })]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		const firstArticleButton = screen.getByRole("button", { name: "选择小红书选题" })
		const secondArticleButton = screen.getByRole("button", { name: "选择第二篇" })
		expect(secondArticleButton).toBeInTheDocument()
		expect(firstArticleButton).toHaveAttribute("aria-current", "true")
		expect(secondArticleButton).not.toHaveAttribute("aria-current")

		fireEvent.click(secondArticleButton)

		expect(screen.getByDisplayValue("第二篇")).toBeInTheDocument()
		expect(secondArticleButton).toHaveAttribute("aria-current", "true")
	})

	it("keeps article selection and destructive actions as separate controls", () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle()]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		const articleButton = screen.getByRole("button", { name: "选择小红书选题" })
		const removeButton = screen.getByLabelText("删除小红书选题")

		expect(articleButton).toBeInTheDocument()
		expect(removeButton).toBeInTheDocument()
		expect(articleButton).not.toContainElement(removeButton)
		expect(removeButton.closest('[role="button"]')).toBeNull()
	})

	it("moves focus into the delete confirmation controls", () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle()]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		fireEvent.click(screen.getByLabelText("删除小红书选题"))

		expect(screen.getByRole("button", { name: "取消" })).toHaveFocus()
		expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument()
	})

	it("keeps active delete confirmation controls readable and away from the title", () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle()]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		fireEvent.click(screen.getByLabelText("删除小红书选题"))

		const articleButton = screen.getByRole("button", { name: "选择小红书选题" })
		const cancelButton = screen.getByRole("button", { name: "取消" })
		const confirmationControls = cancelButton.parentElement

		expect(articleButton).toHaveClass("pr-[7.5rem]")
		expect(confirmationControls).toHaveClass("top-3")
		expect(confirmationControls).not.toHaveClass("top-2")
		expect(cancelButton).toHaveClass("bg-white/16", "text-white")
		expect(cancelButton.getAttribute("class")).not.toContain("text-current")
	})

	it("restores focus to the delete action after cancelling topic removal", () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle()]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		fireEvent.click(screen.getByLabelText("删除小红书选题"))
		fireEvent.click(screen.getByRole("button", { name: "取消" }))

		expect(screen.getByLabelText("删除小红书选题")).toHaveFocus()
	})

	it("cancels topic removal with Escape without deleting the topic", () => {
		const onChange = vi.fn()
		render(
			<StepTopicAndDetail
				articles={[createArticle()]}
				onChange={onChange}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		fireEvent.click(screen.getByLabelText("删除小红书选题"))
		fireEvent.keyDown(screen.getByRole("button", { name: "取消" }), {
			key: "Escape",
		})

		expect(screen.getByLabelText("删除小红书选题")).toHaveFocus()
		expect(screen.queryByRole("button", { name: "取消" })).not.toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument()
		expect(onChange).not.toHaveBeenCalled()
	})

	it("keeps the current article selected after deleting a previous topic", () => {
		function ControlledTopicStep() {
			const [articles, setArticles] = useState([
				createArticle({ title: "第一篇", folderName: "p1" }),
				createArticle({ title: "第二篇", folderName: "p2" }),
				createArticle({ title: "第三篇", folderName: "p3" }),
			])
			return (
				<StepTopicAndDetail
					articles={articles}
					onChange={setArticles}
					onArticleUpdate={(index, article) => {
						setArticles((current) =>
							current.map((item, itemIndex) =>
								itemIndex === index ? article : item,
							),
						)
					}}
					globalSettings={globalSettings}
				/>
			)
		}

		render(<ControlledTopicStep />)

		fireEvent.click(screen.getByRole("button", { name: "选择第二篇" }))
		fireEvent.click(screen.getByLabelText("删除第一篇"))
		fireEvent.click(screen.getByRole("button", { name: "删除" }))

		const currentArticleButton = screen.getByRole("button", { name: "选择第二篇" })
		expect(currentArticleButton).toHaveAttribute("aria-current", "true")
		expect(within(currentArticleButton).getByText("编辑中")).toBeInTheDocument()
		expect(screen.getByDisplayValue("第二篇")).toBeInTheDocument()
	})

	it("moves focus to the current title after confirming topic removal", () => {
		function ControlledTopicStep() {
			const [articles, setArticles] = useState([
				createArticle({ title: "第一篇", folderName: "p1" }),
				createArticle({ title: "第二篇", folderName: "p2" }),
			])
			return (
				<StepTopicAndDetail
					articles={articles}
					onChange={setArticles}
					onArticleUpdate={(index, article) => {
						setArticles((current) =>
							current.map((item, itemIndex) =>
								itemIndex === index ? article : item,
							),
						)
					}}
					globalSettings={globalSettings}
				/>
			)
		}

		render(<ControlledTopicStep />)

		fireEvent.click(screen.getByLabelText("删除第一篇"))
		fireEvent.click(screen.getByRole("button", { name: "删除" }))

		expect(screen.getByLabelText("选题标题")).toHaveFocus()
		expect(screen.getByDisplayValue("第二篇")).toBeInTheDocument()
	})

	it("marks the active topic card with compact editing feedback", () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle(), createArticle({ title: "第二篇", folderName: "p2" })]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		const firstArticleButton = screen.getByRole("button", { name: "选择小红书选题" })
		const secondArticleButton = screen.getByRole("button", { name: "选择第二篇" })
		const firstRemoveButton = screen.getByLabelText("删除小红书选题")

		expect(within(firstArticleButton).getByText("编辑中")).toBeInTheDocument()
		expect(firstArticleButton).toHaveClass("pr-[8.25rem]")
		expect(screen.getByTestId("self-media-topic-active-status-0")).toHaveClass(
			"absolute",
			"right-12",
			"top-4",
			"h-8",
		)
		expect(firstRemoveButton).toHaveClass("right-4", "top-4", "h-8", "w-8")
		expect(within(secondArticleButton).queryByText("编辑中")).not.toBeInTheDocument()

		fireEvent.click(secondArticleButton)

		expect(within(secondArticleButton).getByText("编辑中")).toBeInTheDocument()
		expect(within(firstArticleButton).queryByText("编辑中")).not.toBeInTheDocument()
	})

	it("does not leave a shadow behind the active topic card", () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle(), createArticle({ title: "第二篇", folderName: "p2" })]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		const firstArticleButton = screen.getByRole("button", { name: "选择小红书选题" })
		const secondArticleButton = screen.getByRole("button", { name: "选择第二篇" })

		expect(firstArticleButton).toHaveClass("bg-[#18181b]", "shadow-none")
		expect(firstArticleButton.getAttribute("class")).not.toContain("shadow-[0_14px_30px")

		fireEvent.click(secondArticleButton)

		expect(secondArticleButton).toHaveClass("bg-[#18181b]", "shadow-none")
		expect(secondArticleButton.getAttribute("class")).not.toContain("shadow-[0_14px_30px")
	})

	it("keeps the collapsed navigator named for quick keyboard recovery", () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle()]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		fireEvent.click(screen.getByLabelText("收起看板"))

		expect(screen.getByLabelText("展开选题看板")).toBeInTheDocument()
		expect(screen.getByLabelText("小红书选题")).toHaveAttribute("aria-current", "true")
	})

	it("shows article titles from the collapsed navigator dots", () => {
		render(
			<StepTopicAndDetail
				articles={[
					createArticle({ title: "第一篇标题", folderName: "p1" }),
					createArticle({ title: "第二篇标题", folderName: "p2" }),
				]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		fireEvent.click(screen.getByLabelText("收起看板"))

		const firstDot = screen.getByLabelText("第一篇标题")
		const secondDot = screen.getByLabelText("第二篇标题")

		expect(firstDot.closest("[data-tooltip-title]")).toHaveAttribute(
			"data-tooltip-title",
			"第一篇标题",
		)
		expect(secondDot.closest("[data-tooltip-title]")).toHaveAttribute(
			"data-tooltip-title",
			"第二篇标题",
		)
	})

	it("moves focus to the expand control after collapsing the topic board", () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle()]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		fireEvent.click(screen.getByLabelText("收起看板"))

		expect(screen.getByLabelText("展开选题看板")).toHaveFocus()
	})

	it("restores focus to the collapse control after expanding the topic board", async () => {
		render(
			<StepTopicAndDetail
				articles={[createArticle()]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={globalSettings}
			/>,
		)

		fireEvent.click(screen.getByLabelText("收起看板"))
		fireEvent.click(screen.getByLabelText("展开选题看板"))

		await waitFor(() => {
			expect(screen.getByLabelText("收起看板")).toHaveFocus()
		})
	})
})
