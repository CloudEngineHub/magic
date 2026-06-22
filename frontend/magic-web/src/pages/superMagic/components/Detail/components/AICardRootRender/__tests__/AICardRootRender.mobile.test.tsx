import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import AICardRootRender from "../index"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("framer-motion", async () => {
	const React = await import("react")
	return {
		AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
	}
})

vi.mock("@/components/base/MagicSpin", () => ({
	default: () => <div data-testid="magic-spin" />,
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({ zhCNModules: {}, enUSModules: {} }),
	getAdminLocaleModules: () => ({ zhCNModules: {}, enUSModules: {} }),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@/apis", () => ({
	ScheduledTaskApi: {
		executeScheduledTask: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: {
		selectedProject: {
			user_role: "owner",
		},
	},
}))

vi.mock("antd", async (importOriginal) => {
	const React = await import("react")
	const actual = await importOriginal<typeof import("antd")>()
	return {
		...actual,
		Flex: ({ children, ...props }: { children?: ReactNode }) =>
			React.createElement("div", props, children),
	}
})

vi.mock("../components/AICardConfigPanel", () => ({
	default: () => <div data-testid="ai-card-config-panel" />,
}))

vi.mock("../components/AICardDashboard", () => ({
	default: ({ cards }: { cards: Array<{ name: string }> }) => (
		<div data-testid="ai-card-dashboard">{cards[0]?.name}</div>
	),
}))

vi.mock("../components/AICardDetail", () => ({
	default: () => <div data-testid="ai-card-detail" />,
}))

vi.mock("../utils/aiCardRunNow", () => ({
	extractChatTopicIdFromExecuteResult: vi.fn(),
	switchToTopicByChatTopicId: vi.fn(),
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(async ({ file_ids }: { file_ids: string[] }) =>
		file_ids.map((fileId) => ({ url: `https://mock.local/${fileId}` })),
	),
}))

const fetchMock = vi.fn(async (url: string) => {
	const fileId = url.split("/").pop()
	const configs: Record<string, unknown> = {
		"config-good": {
			type: "ai-card",
			name: "Mobile Card Home",
			description: "uses the tree children",
			cards: [],
			schedule_id: "schedule-1",
		},
		"config-flat": {
			type: "ai-card",
			name: "Wrong Flat Config",
			description: "flat list should not win",
			cards: [],
		},
	}

	return {
		ok: true,
		text: async () => `window.magicProjectConfig = ${JSON.stringify(configs[fileId || ""])}`,
	} as Response
})

describe("AICardRootRender mobile preview data source", () => {
	it("prefers the project tree over the mobile flat attachment list", async () => {
		vi.stubGlobal("fetch", fetchMock)

		const root = {
			file_id: "ai-card-root",
			file_name: "AI Card",
			is_directory: true,
			display_config: { type: "ai-card" },
			children: [
				{
					file_id: "config-good",
					file_name: "magic.project.js",
					is_directory: false,
				},
				{
					file_id: "latest-folder",
					file_name: "latest",
					is_directory: true,
					children: [
						{
							file_id: "latest-index",
							file_name: "index.html",
							is_directory: false,
						},
					],
				},
			],
		}

		render(
			<AICardRootRender
				data={root}
				attachments={[root]}
				attachmentList={[
					{
						file_id: "config-flat",
						file_name: "magic.project.js",
						is_directory: false,
					},
				]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("ai-card-dashboard")).toHaveTextContent("Mobile Card Home")
		})
		expect(screen.queryByTestId("ai-card-config-panel")).not.toBeInTheDocument()
	})
})
