import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { AtSign, Crosshair, Images, UsersRound } from "lucide-react"
import { cn } from "@/lib/utils"

export type BrandFieldIllustrationVariant = "author" | "position" | "audience" | "assets"

const FIELD_ICON: Record<BrandFieldIllustrationVariant, LucideIcon> = {
	author: AtSign,
	position: Crosshair,
	audience: UsersRound,
	assets: Images,
}

interface BrandFieldRowProps {
	illustration: BrandFieldIllustrationVariant
	header: ReactNode
	children: ReactNode
	className?: string
	"data-testid"?: string
	isActive?: boolean
}

export function BrandFieldRow({
	illustration,
	header,
	children,
	className,
	"data-testid": dataTestId,
	isActive = false,
}: BrandFieldRowProps) {
	const Icon = FIELD_ICON[illustration]

	return (
		<div
			className={cn(
				"group relative overflow-hidden px-5 py-4 transition-all duration-200",
				isActive ? "" : "hover:border-zinc-300 hover:shadow-sm",
				className,
			)}
			data-testid={dataTestId}
		>
			<div className="relative flex flex-col gap-2">
				<div className={cn("flex min-h-8 min-w-0 items-center")}>
					<Icon
						size={16}
						strokeWidth={2}
						className={cn(
							"shrink-0 transition-colors duration-300",
							isActive ? "text-amber-500" : "text-zinc-400 group-hover:text-zinc-500",
						)}
					/>
					<div
						className={cn(
							"transition-all duration-300",
							isActive ? "translate-x-2" : "",
						)}
					>
						{header}
					</div>
				</div>
				<div className="min-w-0">{children}</div>
			</div>
		</div>
	)
}
