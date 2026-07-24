import { useGSAP } from "@gsap/react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useRef, type RefObject } from "react"

gsap.registerPlugin(useGSAP, ScrollTrigger)

interface MicroAppFloatingBackdropProps {
	scrollContainerRef: RefObject<HTMLElement | null>
	heroRef: RefObject<HTMLElement | null>
	active?: boolean
	mobile?: boolean
}

/**
 * 背景只提供编辑画布的参考线和纸张层次，不承载功能说明，避免干扰标题与输入。
 */
export default function MicroAppFloatingBackdrop({
	scrollContainerRef,
	heroRef,
	active = false,
	mobile = false,
}: MicroAppFloatingBackdropProps) {
	const scopeRef = useRef<HTMLDivElement>(null)

	useGSAP(
		() => {
			const scroller = scrollContainerRef.current
			const hero = heroRef.current
			if (!scroller || !hero) return

			const media = gsap.matchMedia()
			media.add("(prefers-reduced-motion: no-preference)", () => {
				const grid = scopeRef.current?.querySelector<HTMLElement>(".micro-app-editor-grid")
				const wash = scopeRef.current?.querySelector<HTMLElement>(".micro-app-color-wash")
				const outline =
					scopeRef.current?.querySelector<HTMLElement>(".micro-app-outline-word")
				if (!grid || !wash || !outline) return

				gsap.timeline({
					scrollTrigger: {
						trigger: hero,
						scroller,
						start: "top top",
						end: "bottom top",
						scrub: 1,
					},
				})
					.to(grid, { y: -48, ease: "none" }, 0)
					.to(wash, { y: -86, x: mobile ? 0 : 28, scale: 1.08, ease: "none" }, 0)
					.to(outline, { y: -36, x: mobile ? 0 : -44, ease: "none" }, 0)
			})

			return () => media.revert()
		},
		{ dependencies: [mobile], revertOnUpdate: true, scope: scopeRef },
	)

	return (
		<div
			ref={scopeRef}
			className="pointer-events-none absolute inset-0 overflow-hidden"
			aria-hidden
		>
			<div className="absolute inset-0 bg-[#f8f8f5] dark:bg-[#101116]" />
			<div
				className={`micro-app-color-wash absolute -right-[12%] -top-[18%] size-[680px] rounded-full bg-[radial-gradient(circle,rgba(134,119,255,0.14),rgba(120,197,255,0.08)_42%,transparent_70%)] blur-2xl transition-opacity duration-500 ${
					active ? "opacity-100" : "opacity-70"
				}`}
			/>
			<div className="absolute -left-[14%] top-[42%] size-[520px] rounded-full bg-[radial-gradient(circle,rgba(123,232,174,0.13),transparent_68%)] blur-3xl" />
			<div className="micro-app-editor-grid absolute inset-0 bg-[linear-gradient(rgba(23,32,55,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(23,32,55,0.045)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,black_72%,transparent)] dark:opacity-30" />
			<div className="absolute inset-x-0 top-[132px] h-px bg-[#172037]/10 dark:bg-white/10" />
			<div className="absolute bottom-0 left-[5%] top-0 w-px bg-[#172037]/[0.06] dark:bg-white/[0.06]" />
			<div className="absolute bottom-0 right-[5%] top-0 w-px bg-[#172037]/[0.06] dark:bg-white/[0.06]" />
			<div className="micro-app-outline-word absolute bottom-[3%] right-[2%] whitespace-nowrap text-[168px] font-semibold leading-none tracking-[-0.08em] text-transparent opacity-[0.035] [-webkit-text-stroke:1px_#172037] dark:opacity-[0.06] dark:[-webkit-text-stroke:1px_#ffffff]">
				MICRO APP
			</div>
		</div>
	)
}
