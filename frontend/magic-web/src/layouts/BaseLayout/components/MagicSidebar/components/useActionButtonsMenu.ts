import { type LucideIcon, Trash2 } from "lucide-react"
import { useMemo } from "react"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
type ActionButtonItem = {
	id: string
	label: string
	icon: LucideIcon
	onClick: () => void
}

export function useActionButtonsMenu(): ActionButtonItem[] {
	const navigate = useNavigate()
	return useMemo<ActionButtonItem[]>(
		() => [
			{
				id: "recycle-bin",
				icon: Trash2,
				label: "footer.recycleBin",
				onClick: () => navigate({ name: RouteName.RecycleBin }),
			},
		],
		[navigate],
	)
}
