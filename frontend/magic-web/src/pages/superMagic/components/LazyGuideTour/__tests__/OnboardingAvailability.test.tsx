import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { canHostHomeOnboarding, useCanHostHomeOnboarding } from "../onboardingAvailability"

/**
 * The rule that decides whether new-user onboarding exists here at all.
 *
 * It is asked across two facts the feature cannot share state between — a private deployment answers
 * from the environment synchronously, a team organization only once the organization list has
 * landed — so it is stated once, as a predicate, and held here in both halves: the truth table on
 * its own, and the hook that puts the two answers together.
 *
 * The organization is mocked rather than taken from the store, because what this file is about is
 * the rule. Whether the store's answer reaches the hook *by itself* is a property of
 * `useOrganization`'s subscription, and is not something a mock of it can be asked.
 */
const { deployment, organization } = vi.hoisted(() => ({
	deployment: { privateDeployment: false },
	organization: { organizationListReady: true, isPersonalOrganization: true },
}))

/*
 * Only `isPrivateDeployment` is replaced; the rest of the environment module is real so the imports
 * around it keep working.
 */
vi.mock("@/utils/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/env")>()),
	isPrivateDeployment: () => deployment.privateDeployment,
}))

vi.mock("@/models/user/hooks", () => ({
	useOrganization: () => organization,
}))

/** The three facts the rule is built from, in the combinations that matter. */
function facts(input: {
	privateDeployment?: boolean
	organizationListReady?: boolean
	personalOrganization?: boolean
}) {
	return {
		privateDeployment: input.privateDeployment ?? false,
		organizationListReady: input.organizationListReady ?? true,
		personalOrganization: input.personalOrganization ?? true,
	}
}

beforeEach(() => {
	// The SaaS personal organization: the one environment the feature is for. Every case that wants
	// another one moves exactly the fact it is about.
	deployment.privateDeployment = false
	organization.organizationListReady = true
	organization.isPersonalOrganization = true
})

describe("canHostHomeOnboarding", () => {
	it("is off on a private deployment whatever the organization says", () => {
		// The deployment is asked first and it is final: an account on one never gets the feature,
		// so the organization's kind cannot bring it back.
		expect(canHostHomeOnboarding(facts({ privateDeployment: true }))).toBe(false)
		expect(
			canHostHomeOnboarding(
				facts({
					privateDeployment: true,
					organizationListReady: false,
					personalOrganization: false,
				}),
			),
		).toBe(false)
	})

	it("is off in a team organization", () => {
		expect(canHostHomeOnboarding(facts({ personalOrganization: false }))).toBe(false)
	})

	it("waits for the organization list rather than guessing", () => {
		// Before the list lands the store reads `isPersonalOrganization: false` for everybody, so
		// the two rows below are indistinguishable from each other — and the only safe answer to
		// both is to wait.
		expect(
			canHostHomeOnboarding(
				facts({ organizationListReady: false, personalOrganization: false }),
			),
		).toBe(false)
		expect(
			canHostHomeOnboarding(
				facts({ organizationListReady: false, personalOrganization: true }),
			),
		).toBe(false)
	})

	it("is on for a SaaS personal organization", () => {
		expect(canHostHomeOnboarding(facts({}))).toBe(true)
	})
})

describe("useCanHostHomeOnboarding", () => {
	it("answers from the environment and the organization together", () => {
		organization.organizationListReady = false
		organization.isPersonalOrganization = false

		const { result, rerender } = renderHook(() => useCanHostHomeOnboarding())
		expect(result.current).toBe(false)

		// The list lands and says "personal organization": the gate has to open without the page
		// being remounted, because the store is written long after the first paint.
		organization.organizationListReady = true
		organization.isPersonalOrganization = true
		rerender()
		expect(result.current).toBe(true)

		// And it closes again the other way round — the same page, a different organization.
		organization.isPersonalOrganization = false
		rerender()
		expect(result.current).toBe(false)
	})

	it("stays shut on a private deployment even for a personal organization", () => {
		deployment.privateDeployment = true

		const { result } = renderHook(() => useCanHostHomeOnboarding())
		expect(result.current).toBe(false)
	})
})
