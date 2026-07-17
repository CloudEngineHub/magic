import type { ReactNode } from "react"

interface HeaderTrailingActionProps {
	children: ReactNode
}

export default function HeaderTrailingAction({ children }: HeaderTrailingActionProps) {
	return <div className="absolute right-1 top-0 flex h-8 shrink-0 items-center">{children}</div>
}
