import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ServiceProviderModel } from "@/apis/modules/org-ai-model-provider"
import { MyModelRow } from "./MyModelRow"
import type { MyModelGroup } from "./utils"

const { user } = vi.hoisted(() => ({
	user: {
		isPersonalOrganization: false,
		isAdmin: false,
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/models/user", () => ({
	userStore: { user },
}))

vi.mock("@/components/base", () => ({
	MagicDropdown: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/services/superMagic/SuperMagicCustomModelService", () => ({
	serviceProviderModelToModelItem: (model: ServiceProviderModel) => ({
		model_id: model.model_id,
	}),
}))

vi.mock("../ProviderTypeIcon", () => ({
	ProviderTypeIcon: () => null,
}))

const model: ServiceProviderModel = {
	id: "model-1",
	name: "Test model",
	model_id: "test-model",
	model_version: "test-model",
	model_type: 5,
	category: "vgm",
	description: "A test video model",
	service_provider_config_id: "provider-1",
	service_provider_config: {
		id: "provider-1",
		name: "Custom provider",
	},
}

const group: MyModelGroup = {
	representativeModel: model,
	providerEntries: [
		{
			model,
			provider: null,
			providerAlias: "",
			providerName: "Custom provider",
			providerTypeName: "",
		},
	],
}

describe("MyModelRow", () => {
	beforeEach(() => {
		user.isPersonalOrganization = false
		user.isAdmin = false
	})

	it("hides model actions for enterprise administrators", () => {
		user.isAdmin = true

		render(<MyModelRow group={group} onEdit={vi.fn()} onDelete={vi.fn()} />)

		expect(screen.queryByTestId("my-model-actions-model-1")).not.toBeInTheDocument()
	})

	it("keeps model actions for personal organizations", () => {
		user.isPersonalOrganization = true

		render(<MyModelRow group={group} onEdit={vi.fn()} onDelete={vi.fn()} />)

		expect(screen.getByTestId("my-model-actions-model-1")).toBeInTheDocument()
	})
})
