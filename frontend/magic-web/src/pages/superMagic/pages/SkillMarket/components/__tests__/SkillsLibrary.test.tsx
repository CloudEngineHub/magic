import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { StoreSkillView } from "@/services/skills/SkillsService"

const getStoreSkillsMock = vi.fn()
const getSkillMarketCategoriesMock = vi.fn()
const useFunctionPermissionMock = vi.hoisted(() => vi.fn())
const skillCardRenderMock = vi.fn()
const skillDetailDialogRenderMock = vi.fn()

vi.mock("ahooks", () => ({
	useDebounce: <T,>(value: T) => value,
	useThrottle: <T,>(value: T) => value,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"skillsLibrary.allSkills": "All Skills",
				"skillsLibrary.category": "Category",
				"skillsLibrary.categoriesLoadFailed": "Failed to load categories",
				"skillsLibrary.featuredSkills": "Featured Skills",
				"skillsLibrary.retryFeatured": "Retry",
				"skillsLibrary.refreshFeatured": "Refresh",
				"skillsLibrary.featuredLoadFailed": "Failed to load featured skills",
			})[key] ?? key,
	}),
}))

vi.mock("lucide-react", () => {
	function Icon() {
		return <span aria-hidden="true" />
	}

	return {
		Check: Icon,
		ChevronDown: Icon,
		Loader2: Icon,
		Plus: Icon,
		RefreshCw: Icon,
		Search: Icon,
		WandSparkles: Icon,
	}
})

vi.mock("sonner", () => ({
	toast: { error: vi.fn() },
}))

vi.mock("@/apis", () => ({
	FUNCTION_PERMISSION_CODE: {
		SkillCreate: "SkillCreate",
	},
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({
		children,
		variant,
		size,
		...props
	}: ComponentProps<"button"> & { variant?: string; size?: string }) => {
		void variant
		void size

		return (
			<button type="button" {...props}>
				{children}
			</button>
		)
	},
}))

vi.mock("@/components/shadcn-ui/input", () => ({
	Input: (props: ComponentProps<"input">) => <input {...props} />,
}))

vi.mock("@/enhance/lucide-react", () => ({
	Skills: () => <span aria-hidden="true" />,
}))

vi.mock("@/hooks/useFunctionPermission", () => ({
	useFunctionPermission: (code: string, options?: { allowSuperAdmin?: boolean }) =>
		useFunctionPermissionMock(code, options),
}))

vi.mock("@/models/config", () => ({
	configStore: { i18n: { displayLanguage: "en_US" } },
}))

vi.mock("@/pages/superMagic/components/SkillActionDropdown", () => ({
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/pages/superMagic/components/SkillDetailDialog", () => ({
	SkillDetailDialog: (props: {
		open: boolean
		skillCode: string | null
		skillSummary?: StoreSkillView | null
	}) => {
		skillDetailDialogRenderMock(props)
		return null
	},
}))

vi.mock("@/pages/superMagic/hooks/useAutoLoadMoreSentinel", () => ({
	useAutoLoadMoreSentinel: () => ({ current: null }),
}))

vi.mock("@/pages/superMagic/hooks/useDelayedVisibility", () => ({
	useDelayedVisibility: ({ visible }: { visible: boolean }) => visible,
}))

vi.mock("@/pages/superMagic/hooks/useSkillCreateMenuItems", () => ({
	useSkillCreateMenuItems: () => [],
}))

vi.mock("@/pages/superMagic/pages/MySkillsPage/route-state", () => ({
	MY_SKILLS_INITIAL_TAB_QUERY_KEY: "tab",
	MY_SKILLS_PUBLISH_SKILL_CODE_QUERY_KEY: "publishSkillCode",
	MY_SKILLS_TAB_VALUES: { createdByMe: "created-by-me" },
}))

vi.mock("@/routes/constants", () => ({
	RouteName: { MySkills: "MySkills" },
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => vi.fn(),
}))

vi.mock("@/services/skills/SkillsService", () => ({
	skillsService: {
		getSkillMarketCategories: (...args: unknown[]) => getSkillMarketCategoriesMock(...args),
		getStoreSkills: (...args: unknown[]) => getStoreSkillsMock(...args),
		addSkillFromStore: vi.fn(),
		upgradeSkill: vi.fn(),
	},
}))

vi.mock("../SkillCard", () => ({
	default: (props: {
		skill: StoreSkillView
		showFeaturedTag?: boolean
		onOpenDetail?: (skill: StoreSkillView) => void
	}) => {
		skillCardRenderMock(props)
		return (
			<button
				type="button"
				aria-label={props.skill.name}
				onClick={() => props.onOpenDetail?.(props.skill)}
			>
				{props.skill.name}
			</button>
		)
	},
}))

import SkillsLibrary from "../SkillsLibrary"

function createSkill(overrides: Partial<StoreSkillView>): StoreSkillView {
	return {
		id: "skill-1",
		storeSkillId: "store-skill-1",
		skillCode: "skill.code",
		name: "Skill",
		description: "Description",
		isFeatured: false,
		status: "not-added",
		needUpgrade: false,
		updatedAt: "2026-08-17 10:00:00",
		...overrides,
	}
}

function createPage(list: StoreSkillView[], page: number, pageSize: number) {
	return { list, page, pageSize }
}

describe("SkillsLibrary", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		useFunctionPermissionMock.mockImplementation(() => ({ isAllowed: false }))
		getStoreSkillsMock.mockReset()
		getSkillMarketCategoriesMock.mockReset()
		getSkillMarketCategoriesMock.mockResolvedValue([])
	})

	it("uses the all-skills tab when the category endpoint is empty", async () => {
		getStoreSkillsMock.mockResolvedValue(createPage([], 1, 20))

		render(<SkillsLibrary />)

		expect(await screen.findByRole("tab", { name: "All Skills" })).toBeInTheDocument()
		expect(screen.getByTestId("skills-library-search-bar")).toHaveClass(
			"rounded-xl",
			"border-border",
			"shadow-xs",
		)
		expect(screen.queryByRole("tab", { name: "All", exact: true })).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("skills-library-upload-official-button"),
		).not.toBeInTheDocument()
	})

	it("includes empty categories and filters the skill list by string id", async () => {
		getSkillMarketCategoriesMock.mockResolvedValueOnce([
			{
				id: "10001",
				name: "Productivity",
				sortOrder: 100,
				skillCount: 0,
			},
		])
		getStoreSkillsMock.mockImplementation(({ is_featured }: { is_featured?: number }) =>
			Promise.resolve(createPage([], 1, is_featured === 1 ? 3 : 20)),
		)

		render(<SkillsLibrary />)

		expect(await screen.findByRole("tab", { name: "Productivity" })).toBeInTheDocument()
		expect(getSkillMarketCategoriesMock).toHaveBeenCalledWith({ include_empty: true })

		fireEvent.click(screen.getByRole("tab", { name: "Productivity" }))

		await waitFor(() => {
			expect(getStoreSkillsMock).toHaveBeenCalledWith(
				expect.objectContaining({
					page: 1,
					category_ids: ["10001"],
				}),
			)
		})
	})

	it("keeps the global featured section visible when switching categories", async () => {
		const featuredSkill = createSkill({
			id: "global-featured",
			skillCode: "global.featured",
			name: "Global featured",
			isFeatured: true,
		})
		getSkillMarketCategoriesMock.mockResolvedValueOnce([
			{
				id: "10001",
				name: "Productivity",
				sortOrder: 100,
				skillCount: 1,
			},
		])
		getStoreSkillsMock.mockImplementation(({ is_featured }: { is_featured?: number }) =>
			Promise.resolve(
				createPage(is_featured === 1 ? [featuredSkill] : [], 1, is_featured === 1 ? 3 : 20),
			),
		)

		render(<SkillsLibrary />)

		const featuredSection = await screen.findByTestId("featured-skills-section")
		fireEvent.click(await screen.findByRole("tab", { name: "Productivity" }))

		await waitFor(() => {
			expect(getStoreSkillsMock).toHaveBeenCalledWith(
				expect.objectContaining({ category_ids: ["10001"] }),
			)
		})
		expect(featuredSection).toBeInTheDocument()
		expect(screen.getByTestId("featured-skills-section")).toBeInTheDocument()
	})

	it("opens the clicked featured object when the main list contains another object with the same id", async () => {
		const featuredSkill = createSkill({
			id: "shared-id",
			storeSkillId: "featured-store-id",
			skillCode: "featured.skill.code",
			name: "Featured object",
			isFeatured: true,
		})
		const mainListSkill = createSkill({
			id: "shared-id",
			storeSkillId: "main-store-id",
			skillCode: "main.skill.code",
			name: "Main-list object",
		})

		getStoreSkillsMock.mockImplementation(({ is_featured }: { is_featured?: number }) =>
			Promise.resolve(
				is_featured === 1
					? createPage([featuredSkill], 1, 3)
					: createPage([mainListSkill], 1, 20),
			),
		)

		render(<SkillsLibrary />)

		const featuredGrid = await screen.findByTestId("featured-skill-card-grid")
		await screen.findByTestId("skill-card-grid")

		const renderedCards = skillCardRenderMock.mock.calls.map(
			([props]) =>
				props as {
					skill: StoreSkillView
					showFeaturedTag?: boolean
				},
		)
		const featuredCard = renderedCards.find(
			({ skill, showFeaturedTag }) => showFeaturedTag && skill.name === "Featured object",
		)
		const mainCard = renderedCards.find(
			({ skill, showFeaturedTag }) => !showFeaturedTag && skill.name === "Main-list object",
		)
		if (!featuredCard || !mainCard) throw new Error("Expected both featured and main cards")

		expect(featuredCard.skill.id).toBe(mainCard.skill.id)
		expect(featuredCard.skill).not.toBe(mainCard.skill)

		fireEvent.click(within(featuredGrid).getByRole("button", { name: "Featured object" }))

		await waitFor(() => {
			const lastCall =
				skillDetailDialogRenderMock.mock.calls[
					skillDetailDialogRenderMock.mock.calls.length - 1
				]?.[0]
			expect(lastCall).toMatchObject({
				open: true,
				skillCode: "featured.skill.code",
			})
		})

		const selectedSkill = skillDetailDialogRenderMock.mock.calls.at(-1)?.[0]?.skillSummary
		expect(selectedSkill).toBe(featuredCard.skill)
		expect(selectedSkill).not.toBe(mainCard.skill)
	})

	it("shows the featured error and retries the initial request successfully", async () => {
		const recoveredSkill = createSkill({
			id: "recovered-featured",
			skillCode: "recovered.featured.code",
			name: "Recovered featured",
			isFeatured: true,
		})
		let featuredRequestCount = 0

		getStoreSkillsMock.mockImplementation(({ is_featured }: { is_featured?: number }) => {
			if (is_featured !== 1) return Promise.resolve(createPage([], 1, 20))

			featuredRequestCount += 1
			if (featuredRequestCount === 1) return Promise.reject(new Error("featured failed"))
			return Promise.resolve(createPage([recoveredSkill], 1, 3))
		})

		render(<SkillsLibrary />)

		expect(await screen.findByTestId("featured-skills-error")).toHaveTextContent(
			"Failed to load featured skills",
		)
		const retryButton = screen.getByTestId("featured-skills-refresh")
		expect(retryButton).toHaveTextContent("Retry")
		expect(retryButton).toBeEnabled()

		fireEvent.click(retryButton)

		const featuredGrid = await screen.findByTestId("featured-skill-card-grid")
		expect(
			within(featuredGrid).getByRole("button", { name: "Recovered featured" }),
		).toBeInTheDocument()
		expect(screen.queryByTestId("featured-skills-error")).not.toBeInTheDocument()
		expect(featuredRequestCount).toBe(2)
	})
})
