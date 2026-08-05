import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SkillFilesPanel from "./SkillFilesPanel"

const topicFilesButtonPropsSpy = vi.hoisted(() => vi.fn())

vi.mock("@/pages/superMagic/components/TopicFilesButton", () => ({
	default: (props: Record<string, unknown>) => {
		topicFilesButtonPropsSpy(props)
		return <div data-testid="topic-files-button" />
	},
}))

describe("SkillFilesPanel", () => {
	it("viewer 只允许查看附件", () => {
		render(<SkillFilesPanel readOnly attachments={[]} />)

		expect(topicFilesButtonPropsSpy).toHaveBeenLastCalledWith(
			expect.objectContaining({
				allowEdit: false,
				isInProject: true,
			}),
		)
	})

	it("非 viewer 保留附件编辑能力", () => {
		render(<SkillFilesPanel readOnly={false} attachments={[]} />)

		expect(topicFilesButtonPropsSpy).toHaveBeenLastCalledWith(
			expect.objectContaining({ allowEdit: true }),
		)
	})
})
