import type { ReactNode } from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import TopicSidebar from "../TopicSidebar"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/pages/superMagic/components/ProjectCardContainer", () => ({
	default: () => <div data-testid="project-card-container" />,
}))

vi.mock("@/pages/superMagic/components/ProjectSider", () => ({
	default: ({
		items,
	}: {
		items: Array<{ key: string; title: string; content?: ReactNode }>
	}) => (
		<div data-testid="project-sider">
			{items.map((item) => (
				<div key={item.key}>
					<span data-testid={`project-sider-item-${item.key}`}>{item.title}</span>
					<div data-testid={`project-sider-content-${item.key}`}>{item.content}</div>
				</div>
			))}
		</div>
	),
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton", () => ({
	default: ({ title }: { title?: string }) => (
		<div data-testid="topic-files-button">{title ?? "topicFiles.title"}</div>
	),
}))

vi.mock("@/pages/superMagic/components/SiderTask", () => ({
	default: () => <div data-testid="sider-task" />,
}))

vi.mock("@/pages/superMagic/components/LongTremMemory/components/MemorySider", () => ({
	LongTremMemorySider: () => <div data-testid="long-memory-sider" />,
}))

vi.mock("@/pages/superMagic/components/ShareManagement/ShareManagementPanel", () => ({
	default: () => <div data-testid="share-management-panel" />,
}))

vi.mock("@/enhance/tabler/icons-react/icons/iconShareCog", () => ({
	default: () => <span data-testid="icon-share-cog" />,
}))

const baseProps = {
	selectedProject: { id: "project-alpha" },
	selectedWorkspace: { id: "workspace-alpha" },
	selectedTopic: { id: "topic-alpha" },
	isReadOnly: false,
	topicFilesProps: {},
}

describe("TopicSidebar", () => {
	it("renders all sider tabs in default variant", () => {
		render(<TopicSidebar {...baseProps} />)

		expect(screen.getByTestId("project-sider-item-topicFiles")).toHaveTextContent(
			"topicFiles.title",
		)
		expect(screen.getByTestId("topic-files-button")).toHaveTextContent("topicFiles.title")
		expect(screen.getByTestId("project-sider-item-task")).toBeInTheDocument()
		expect(screen.getByTestId("project-sider-item-longMemory")).toBeInTheDocument()
		expect(screen.getByTestId("project-sider-item-share")).toBeInTheDocument()
	})

	it("renders only files and share tabs in chat variant", () => {
		render(<TopicSidebar {...baseProps} siderVariant="chat" hideProjectCard />)

		expect(screen.getByTestId("project-sider-item-topicFiles")).toHaveTextContent(
			"topicFiles.fileTitle",
		)
		expect(screen.getByTestId("topic-files-button")).toHaveTextContent("topicFiles.fileTitle")
		expect(screen.getByTestId("project-sider-item-share")).toBeInTheDocument()
		expect(screen.queryByTestId("project-sider-item-task")).not.toBeInTheDocument()
		expect(screen.queryByTestId("project-sider-item-longMemory")).not.toBeInTheDocument()
		expect(screen.queryByTestId("project-card-container")).not.toBeInTheDocument()
	})
})
