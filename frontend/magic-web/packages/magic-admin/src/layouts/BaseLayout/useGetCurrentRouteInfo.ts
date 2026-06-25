import { useLocation } from "react-router-dom"
import { useMemo } from "react"
import { getMatchedRouteChain } from "@admin/utils/routeMeta"
import { routes } from "@admin/routes"

export const useGetCurrentRouteInfo = () => {
	const { pathname } = useLocation()
	/* 根据路由项的 hidden 属性，判断是否隐藏顶部菜单 */
	const routeChain = useMemo(() => getMatchedRouteChain(routes, pathname), [pathname])
	const currentRouteItems = useMemo(() => routeChain[routeChain.length - 1] ?? null, [routeChain])

	/* 根据路由项的 hidden 属性，判断是否隐藏顶部菜单 */
	const hiddenMenu = useMemo(() => {
		return currentRouteItems && currentRouteItems?.hiddenMenu
	}, [currentRouteItems])

	return {
		currentRouteItems,
		routeChain,
		hiddenMenu,
	}
}
