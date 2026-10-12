import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { AssetItem } from "@/apis"
import type { TFunction } from "../../../../public/i18n-types"
import { AssetLibraryAssetCard } from "../AssetLibraryAssetCard"

const { refreshAfterLoadFailure } = vi.hoisted(() => ({
	refreshAfterLoadFailure: vi.fn(),
}))

vi.mock("../../../../runtime/resources/asset/AssetDetailStore", () => ({
	assetDetailStore: {
		get: vi.fn(),
		refreshAfterLoadFailure,
	},
}))

vi.mock("@/components/shadcn-ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: { children: ReactNode }) => (
		<div role="menu">{children}</div>
	),
	DropdownMenuItem: ({
		children,
		onSelect,
		disabled,
	}: {
		children: ReactNode
		onSelect?: () => void
		disabled?: boolean
	}) => (
		<button
			type="button"
			role="menuitem"
			disabled={disabled}
			onClick={(event) => {
				event.stopPropagation()
				onSelect?.()
			}}
		>
			{children}
		</button>
	),
}))

const t: TFunction = (key, options) =>
	typeof options === "string" ? options : (options?.defaultValue?.toString() ?? key)

const baseAsset: AssetItem = {
	asset_id: "asset-1",
	asset_kind: "ASSET",
	asset_business_type: null,
	asset_media_type: "IMAGE",
	parent_id: null,
	name: "Portrait",
	description: "",
	file_url: "https://example.com/portrait.png",
	file_key: "private/portrait.png",
	compliance_status: "FAILED",
	compliance_failed_reason: "reason",
	owner: { id: "owner-1", name: "Alice" },
	owner_uid: "owner-1",
	source: "PERSONAL",
	tags: [],
}

describe("AssetLibraryAssetCard compliance menu", () => {
	it("does not show compliance menu item for PASS assets", () => {
		render(
			<AssetLibraryAssetCard
				asset={{ ...baseAsset, compliance_status: "PASS" }}
				selected={false}
				selectionBlocked={false}
				manageable={false}
				t={t}
				onToggle={vi.fn()}
				onPreview={vi.fn()}
				onComplianceCheck={vi.fn()}
			/>,
		)

		expect(screen.queryByRole("button", { name: "素材操作" })).not.toBeInTheDocument()
	})

	it("shows compliance in the actions menu for non-owners", () => {
		const onToggle = vi.fn()
		const onComplianceCheck = vi.fn()
		render(
			<AssetLibraryAssetCard
				asset={baseAsset}
				selected={false}
				selectionBlocked={false}
				manageable={false}
				t={t}
				onToggle={onToggle}
				onPreview={vi.fn()}
				onComplianceCheck={onComplianceCheck}
				seedanceComplianceAvailable
			/>,
		)

		fireEvent.click(screen.getByRole("menuitem", { name: "Seedance 2.0 合规校验" }))

		expect(onComplianceCheck).toHaveBeenCalledWith(baseAsset)
		expect(onToggle).not.toHaveBeenCalled()
	})

	it("keeps the action available when the list omits file_key", () => {
		render(
			<AssetLibraryAssetCard
				asset={{ ...baseAsset, file_key: undefined }}
				selected={false}
				selectionBlocked={false}
				manageable={false}
				t={t}
				onToggle={vi.fn()}
				onPreview={vi.fn()}
				onComplianceCheck={vi.fn()}
				seedanceComplianceAvailable
			/>,
		)

		expect(screen.getByRole("menuitem", { name: "Seedance 2.0 合规校验" })).toBeInTheDocument()
	})

	it("does not refresh asset detail when a preview fails", () => {
		render(
			<AssetLibraryAssetCard
				asset={baseAsset}
				selected={false}
				selectionBlocked={false}
				manageable={false}
				t={t}
				onToggle={vi.fn()}
				onPreview={vi.fn()}
				onComplianceCheck={vi.fn()}
			/>,
		)

		fireEvent.error(screen.getByRole("img"))

		expect(refreshAfterLoadFailure).not.toHaveBeenCalled()
	})
})
