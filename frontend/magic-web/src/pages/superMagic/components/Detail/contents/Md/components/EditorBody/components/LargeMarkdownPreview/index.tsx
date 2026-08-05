import {
	forwardRef,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type AnchorHTMLAttributes,
	type ComponentProps,
	type HTMLAttributes,
} from "react"
import type { Element as HastElement, Root, RootContent } from "hast"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { cn } from "@/lib/utils"
import { useTheme } from "@/models/config/hooks"
import { parseAnchorLink, scrollToAnchor, slugify } from "@/utils/slug"
import {
	getVirtualMarkdownChunkContent,
	splitMarkdownIntoVirtualChunks,
	type VirtualMarkdownChunk,
} from "../../largeMarkdown"

interface LargeMarkdownPreviewProps {
	content: string
	className?: string
	documentFlow?: boolean
	urlResolver?: (relativePath: string) => string | Promise<string>
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

const VirtualMarkdownList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
	function VirtualMarkdownList({ className, style, ...props }, ref) {
		// ReactMarkdown inserts newline text nodes between block elements. TipTap's
		// pre-wrap style makes those nodes occupy an extra visual line in every chunk.
		return (
			<div
				ref={ref}
				className={cn("tiptap ProseMirror simple-editor", className)}
				style={{ ...style, whiteSpace: "normal" }}
				{...props}
			/>
		)
	},
)

function getHastNodeText(node: Root | RootContent): string {
	if (node.type === "text") return node.value
	if ("children" in node) return node.children.map(getHastNodeText).join("")
	return ""
}

function createHeadingIdPlugin(headingSlugs: string[]) {
	return () => (tree: Root) => {
		let headingIndex = 0

		const visit = (node: Root | RootContent) => {
			if (node.type === "element" && /^h[1-6]$/.test(node.tagName)) {
				const element = node as HastElement
				const fallbackSlug = slugify(getHastNodeText(element))
				element.properties = {
					...element.properties,
					id: headingSlugs[headingIndex] || fallbackSlug || undefined,
				}
				headingIndex += 1
			}

			if ("children" in node) node.children.forEach(visit)
		}

		visit(tree)
	}
}

function ResolvedMarkdownImage({
	src,
	urlResolver,
	...props
}: ComponentProps<"img"> & {
	urlResolver?: (relativePath: string) => string | Promise<string>
}) {
	const [resolvedSrc, setResolvedSrc] = useState(src)

	useEffect(() => {
		let disposed = false
		setResolvedSrc(src)
		if (!src || !urlResolver) return () => undefined

		Promise.resolve(urlResolver(src))
			.then((nextSrc) => {
				if (!disposed) setResolvedSrc(nextSrc)
			})
			.catch(() => {
				if (!disposed) setResolvedSrc(src)
			})

		return () => {
			disposed = true
		}
	}, [src, urlResolver])

	return <img {...props} src={resolvedSrc} />
}

interface MarkdownChunkProps {
	chunk: VirtualMarkdownChunk
	content: string
	urlResolver?: LargeMarkdownPreviewProps["urlResolver"]
	onAnchorClick: (href: string) => boolean
	onLinkClick?: LargeMarkdownPreviewProps["onLinkClick"]
}

function MarkdownChunk({
	chunk,
	content,
	urlResolver,
	onAnchorClick,
	onLinkClick,
}: MarkdownChunkProps) {
	const headingIdPlugin = useMemo(
		() => createHeadingIdPlugin(chunk.headingSlugs),
		[chunk.headingSlugs],
	)
	const components = useMemo<Components>(
		() => ({
			a: ({ href = "", ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
				<a
					{...props}
					href={href}
					onClick={(event) => {
						if (onAnchorClick(href)) {
							event.preventDefault()
							return
						}
						if (!onLinkClick) return
						event.preventDefault()
						onLinkClick(event.nativeEvent, href, event.currentTarget)
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
					<div className="tableWrapper">
						<table {...props} />
					</div>
				)
			},
			input: ({ node, checked, ...props }) => {
				void node
				return <input {...props} type="checkbox" checked={checked} readOnly />
			},
		}),
		[onAnchorClick, onLinkClick, urlResolver],
	)

	return (
		<div data-markdown-chunk-id={chunk.id}>
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
				{getVirtualMarkdownChunkContent(content, chunk)}
			</ReactMarkdown>
		</div>
	)
}

export default function LargeMarkdownPreview({
	content,
	className,
	documentFlow = false,
	urlResolver,
	onLinkClick,
}: LargeMarkdownPreviewProps) {
	const chunks = useMemo(() => splitMarkdownIntoVirtualChunks(content), [content])
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const { prefersColorScheme } = useTheme()
	const headingChunkIndex = useMemo(() => {
		const index = new Map<string, number>()
		chunks.forEach((chunk, chunkIndex) => {
			chunk.headingSlugs.forEach((slug) => {
				if (!index.has(slug)) index.set(slug, chunkIndex)
			})
		})
		return index
	}, [chunks])

	const handleAnchorClick = useCallback(
		(href: string) => {
			if (!href.startsWith("#")) return false
			const { anchor } = parseAnchorLink(href)
			const chunkIndex = headingChunkIndex.get(anchor)
			if (chunkIndex === undefined) return false

			virtuosoRef.current?.scrollToIndex({ index: chunkIndex, align: "start" })
			// The target heading is mounted only after Virtuoso reaches its chunk.
			requestAnimationFrame(() => requestAnimationFrame(() => scrollToAnchor(anchor, 80)))
			return true
		},
		[headingChunkIndex],
	)

	return (
		<div
			className={cn(
				"simple-editor-wrapper tiptap-editor-root",
				prefersColorScheme === "dark" && "dark",
				documentFlow && "simple-editor-document-flow",
				className,
			)}
			data-testid="large-markdown-preview"
		>
			<div className="simple-editor-content">
				<Virtuoso
					ref={virtuosoRef}
					style={documentFlow ? undefined : { height: "100%" }}
					data={chunks}
					useWindowScroll={documentFlow}
					overscan={800}
					components={{ List: VirtualMarkdownList }}
					itemContent={(_index, chunk) => (
						<MarkdownChunk
							chunk={chunk}
							content={content}
							urlResolver={urlResolver}
							onAnchorClick={handleAnchorClick}
							onLinkClick={onLinkClick}
						/>
					)}
				/>
			</div>
		</div>
	)
}

export type { LargeMarkdownPreviewProps }
