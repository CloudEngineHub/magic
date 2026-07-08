import { Outlet } from "react-router-dom"
import { RoutePath } from "@/constants/routes"
import type { PropsWithChildren } from "react"
import { Suspense, useEffect } from "react"
import MagicSpin from "@/components/base/MagicSpin"
import { useLocation } from "react-router"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"

interface VectorKnowledgeLayoutProps extends PropsWithChildren {}

export default function VectorKnowledgeLayout({ children }: VectorKnowledgeLayoutProps) {
	const navigate = useNavigate()

	const { pathname } = useLocation()

	// 向量知识库拥有独立列表页，避免入口复用 flow 父布局。
	useEffect(() => {
		if (
			!pathname.includes(RoutePath.VectorKnowledgeDetail) &&
			!pathname.includes(RoutePath.VectorKnowledgeCreate) &&
			!pathname.includes(RoutePath.VectorKnowledgeList)
		) {
			navigate({
				name: RouteName.VectorKnowledge,
			})
		}
	}, [pathname, navigate])

	return <Suspense fallback={<MagicSpin />}>{children || <Outlet />}</Suspense>
}
