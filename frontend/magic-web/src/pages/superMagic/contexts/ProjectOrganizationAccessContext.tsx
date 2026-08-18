import { createContext, useContext } from "react"
import type { User } from "@/types/user"
import type { ReactNode } from "react"

export type ProjectOrganizationAccessStatus = "loading" | "ready" | "switch-required" | "switching"

export interface ProjectOrganizationAccessContextValue {
	status: ProjectOrganizationAccessStatus
	targetOrganization: User.MagicOrganization | null
	targetUserInfo: User.UserInfo | null
	handleSwitchOrganization: () => Promise<void>
}

const ProjectOrganizationAccessContext =
	createContext<ProjectOrganizationAccessContextValue | null>(null)

interface ProjectOrganizationAccessProviderProps {
	children: ReactNode
	value: ProjectOrganizationAccessContextValue
}

/** Shares the parent layout's access check with the guarded project Outlet. */
export function ProjectOrganizationAccessProvider({
	children,
	value,
}: ProjectOrganizationAccessProviderProps) {
	return (
		<ProjectOrganizationAccessContext.Provider value={value}>
			{children}
		</ProjectOrganizationAccessContext.Provider>
	)
}

export function useProjectOrganizationAccessContext() {
	const context = useContext(ProjectOrganizationAccessContext)
	if (!context) {
		throw new Error("ProjectOrganizationAccessGuard must be rendered inside MainLayout")
	}
	return context
}
