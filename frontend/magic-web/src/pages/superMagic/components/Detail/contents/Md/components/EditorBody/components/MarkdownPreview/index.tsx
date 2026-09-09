import { useEffect, useMemo, useState, type AnchorHTMLAttributes, type ComponentProps } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import { useTheme } from "@/models/config/hooks"
import { cn } from "@/utils/cn"
import { slugify } from "@/utils/slug"
import { parseImageSize } from "@/pages/superMagic/utils/image-url-resolver"
import type { ProjectImageUrlResolver } from "@/components/tiptap-node/project-image-node/project-image-node-extension"

// Infer the HAST contract from the installed processor without depending on a hoisted type package.
type Root = Parameters<ReturnType<typeof rehypeRaw>>[0]
type RootContent = Root["children"][number]

interface MarkdownPreviewProps {
	content: string
	className?: string
	documentFlow?: boolean
	urlResolver?: ProjectImageUrlResolver
	onLinkClick?: (
		event: MouseEvent,
		href: string,
		element: HTMLAnchorElement,
		anchor?: string,
	) => boolean
}

const markdownSanitizeSchema = {
	...defaultSchema,
	tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
	attributes: {
		...defaultSchema.attributes,
		img: [...(defaultSchema.attributes?.img ?? []), "width", "height"],
	},
}

function getHastNodeText(node: Root | RootContent): string {
	if (node.type === "text") return node.value
	if ("children" in node) return node.children.map(getHastNodeText).join("")
	return ""
}

function createHeadingIdPlugin() {
	return () => (tree: Root) => {
		const headingCounts = new Map<string, number>()

		const visit = (node: Root | RootContent) => {
			if (node.type === "element" && /^h[1-6]$/.test(node.tagName)) {
				const baseId = slugify(getHastNodeText(node)) || "heading"
				const count = headingCounts.get(baseId) ?? 0
				headingCounts.set(baseId, count + 1)
				node.properties = {
					...node.properties,
					id: count === 0 ? baseId : `${baseId}-${count + 1}`,
				}
			}

			if ("children" in node) node.children.forEach(visit)
		}

		visit(tree)
	}
}

function ResolvedMarkdownImage({
	src,
	title,
	onError,
	urlResolver,
	...props
}: ComponentProps<"img"> & {
	urlResolver?: MarkdownPreviewProps["urlResolver"]
}) {
	const [resolvedSrc, setResolvedSrc] = useState(urlResolver ? undefined : src)
	const [usedOriginalFallback, setUsedOriginalFallback] = useState(false)
	const imageSize = parseImageSize(`"${title ?? ""}"`)
	const resolverPath = (() => {
		if (!src || !title) return src
		const { width, height } = parseImageSize(`"${title}"`)
		if (width === null && height === null) return src
		return `${src} =${width ?? ""}x${height ?? ""}`
	})()

	useEffect(() => {
		let disposed = false
		// Leave src unset while resolving to avoid downloading the original before its variant.
		setResolvedSrc(urlResolver ? undefined : src)
		setUsedOriginalFallback(false)
		if (!src || !urlResolver) return () => undefined

		let requestVersion = 0
		const resolveImage = () => {
			// Attachment URLs can become available after the preview mounts. Use the same
			// readiness subscription as the editor and ignore superseded async responses.
			if (urlResolver.isReady?.() === false) return
			const version = ++requestVersion
			Promise.resolve()
				.then(() => urlResolver(resolverPath || src))
				.then((nextSrc) => {
					if (!disposed && version === requestVersion) setResolvedSrc(nextSrc ?? src)
				})
				.catch(() => {
					if (!disposed && version === requestVersion) setResolvedSrc(src)
				})
		}
		const unsubscribe = urlResolver.subscribe?.(resolveImage)
		resolveImage()

		return () => {
			disposed = true
			unsubscribe?.()
		}
	}, [resolverPath, src, urlResolver])

	return (
		<img
			{...props}
			width={props.width ?? imageSize.width ?? undefined}
			height={props.height ?? imageSize.height ?? undefined}
			src={resolvedSrc}
			onError={(event) => {
				if (!usedOriginalFallback && src && resolvedSrc !== src) {
					setUsedOriginalFallback(true)
					setResolvedSrc(src)
				}
				onError?.(event)
			}}
		/>
	)
}

function MarkdownPreview({
	content,
	className,
	documentFlow = false,
	urlResolver,
	onLinkClick,
}: MarkdownPreviewProps) {
	const { prefersColorScheme } = useTheme()
	const headingIdPlugin = useMemo(() => createHeadingIdPlugin(), [])
	const components = useMemo<Components>(
		() => ({
			a: ({ href = "", ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
				<a
					{...props}
					href={href}
					onClick={(event) => {
						if (!onLinkClick) return
						if (onLinkClick(event.nativeEvent, href, event.currentTarget)) {
							event.preventDefault()
						}
					}}
				/>
			),
			img: ({ node, ...props }) => {
				void node
				return <ResolvedMarkdownImage {...props} urlResolver={urlResolver} />
			},
			table: ({ node, ...props }) => {
				void node
				return (
					<div className="my-3 w-full overflow-x-auto">
						<table {...props} />
					</div>
				)
			},
			input: ({ node, checked, ...props }) => {
				void node
				return <input {...props} type="checkbox" checked={checked} readOnly />
			},
		}),
		[onLinkClick, urlResolver],
	)

	return (
		<div
			className={cn(
				"simple-markdown-preview tiptap-editor-root relative flex w-full flex-col overflow-x-hidden bg-background text-foreground",
				documentFlow ? "min-h-dvh overflow-visible" : "h-full overflow-y-auto",
				prefersColorScheme === "dark" && "dark",
				className,
			)}
			data-testid="markdown-preview"
		>
			<div
				className={cn(
					"simple-editor-content flex w-full flex-1 flex-col overflow-x-hidden",
					documentFlow ? "overflow-visible" : "overflow-y-visible",
				)}
			>
				<div
					className={cn(
						"tiptap ProseMirror simple-editor min-w-0 flex-1 px-6 pt-6 pb-[30vh] text-sm leading-6",
						"[&_a]:text-primary [&_a]:underline-offset-2 [&_a:hover]:underline",
						"[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-4",
						"[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5",
						"[&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold",
						"[&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold",
						"[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold",
						"[&_h4]:mb-2 [&_h4]:mt-3 [&_h4]:font-semibold",
						"[&_hr]:my-5 [&_hr]:border-border",
						"[&_img]:max-w-full [&_img]:rounded-md",
						"[&_li]:my-1 [&_ol]:my-3 [&_ol]:ml-6 [&_ol]:list-decimal",
						"[&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4",
						"[&_table]:min-w-full [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2",
						"[&_ul]:my-3 [&_ul]:ml-6 [&_ul]:list-disc",
						documentFlow ? "min-h-dvh" : "",
					)}
				>
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						rehypePlugins={[
							rehypeRaw,
							[rehypeSanitize, markdownSanitizeSchema],
							headingIdPlugin,
						]}
						urlTransform={(url) => url}
						components={components}
					>
						{content}
					</ReactMarkdown>
				</div>
			</div>
		</div>
	)
}

export type { MarkdownPreviewProps }
export default MarkdownPreview
