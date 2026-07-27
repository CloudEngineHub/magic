import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useMicroAppPageController } from "../useMicroAppPageController"

const mocks = vi.hoisted(() => {
	const setWorkspaceFileTree = vi.fn()
	const projectFilesStore = {
		workspaceFileTree: [],
		workspaceFilesList: [],
		setWorkspaceFileTree,
	}
	const selectedProject = {
		id: "project-1",
		workspace_id: "workspace-1",
		project_name: "Micro App",
	}

	return {
		setWorkspaceFileTree,
		projectFilesStore,
		selectedProject,
		checkAttachmentsNowDebounced: vi.fn(),
		useProjectAttachmentsChangeRealtime: vi.fn(),
		pubsub: {
			publish: vi.fn(),
			subscribe: vi.fn(),
			unsubscribe: vi.fn(),
		},
	}
})

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => vi.fn(),
}))

vi.mock("../../context", () => ({
	useAppStore: () => ({
		projectId: "project-1",
		initLoading: false,
		initError: null,
		initFromProjectId: vi.fn(),
		conversation: {
			selectedProject: mocks.selectedProject,
			topicStore: {
				selectedTopic: null,
				topics: [],
			},
			setSelectedProject: vi.fn(),
		},
		projectFilesStore: mocks.projectFilesStore,
		mentionPanelStore: {
			initLoadAttachments: vi.fn(),
			finishLoadAttachmentsPromise: vi.fn(),
			clearInitLoadAttachmentsPromise: vi.fn(),
		},
	}),
}))

vi.mock("@/pages/superMagic/hooks", () => ({
	useDefaultModeModelListRefreshOnMount: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/TopicMode", () => ({
	useCreateTopicListener: vi.fn(),
}))

vi.mock("@/pages/superMagic/hooks/useAttachmentsPolling", () => ({
	useAttachmentsPolling: () => ({
		checkNowDebounced: mocks.checkAttachmentsNowDebounced,
	}),
}))

vi.mock("@/pages/superMagic/hooks/useProjectAttachmentsChangeRealtime", () => ({
	useProjectAttachmentsChangeRealtime: mocks.useProjectAttachmentsChangeRealtime,
}))

vi.mock("../useMicroAppSelectedProjectSync", () => ({
	useMicroAppSelectedProjectSync: vi.fn(),
}))

vi.mock("../../utils/captureMicroAppCover", () => ({
	captureMicroAppCover: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/WithCollaborators/hooks/useCollaboratorUpdatePanel", () => ({
	default: () => ({
		openManageModal: vi.fn(),
		CollaboratorUpdatePanel: null,
		canManageCollaborators: false,
	}),
}))

vi.mock("@/pages/superMagic/utils/attachmentDataProcessor", () => ({
	AttachmentDataProcessor: {
		processAttachmentData: ({ tree, list }: { tree: unknown[]; list: unknown[] }) => ({
			tree,
			list,
		}),
	},
}))

vi.mock("@/utils/pubsub", () => ({
	default: mocks.pubsub,
	PubSubEvents: {
		Update_Attachments_Loading: "Update_Attachments_Loading",
		Update_Attachments: "Update_Attachments",
		Update_Project_Name: "Update_Project_Name",
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getAttachmentsByProjectId: vi.fn(() => new Promise(() => undefined)),
		updateMicroApp: vi.fn(),
	},
}))

describe("useMicroAppPageController attachment synchronization", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("applies realtime project file changes to the MicroApp attachment store", () => {
		renderHook(() => useMicroAppPageController("app-1", "project-1"))

		expect(mocks.useProjectAttachmentsChangeRealtime).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
				store: mocks.projectFilesStore,
			}),
		)

		const options = mocks.useProjectAttachmentsChangeRealtime.mock.calls[0]?.[0] as {
			onAttachmentsChange?: (data: { tree: unknown[]; list: unknown[] }) => void
		}
		const entry = { file_id: "entry-1", file_name: "index.html" }
		act(() => {
			options.onAttachmentsChange?.({ tree: [entry], list: [entry] })
		})

		expect(mocks.setWorkspaceFileTree).toHaveBeenCalledWith([entry])
	})
})
