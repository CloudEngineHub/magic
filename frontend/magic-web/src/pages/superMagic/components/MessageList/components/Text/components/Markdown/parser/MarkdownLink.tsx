import { observer } from "mobx-react-lite"
import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import projectFilesStore from "@/stores/projectFiles"
import { cn } from "@/utils/cn"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import {
	isMarkdownFileHrefCandidate,
	parseMarkdownFileHref,
} from "@/pages/superMagic/utils/filePathMention"
import {
	resolveReferencedProjectAttachment,
	type ReferencedProjectAttachment,
} from "@/pages/superMagic/services/referencedProjectAttachmentResolver"
import { findAttachmentByPath } from "./helper"
import { normalizeInlineStyle } from "../normalizeInlineStyle"
import { FileReference, getFileExtensionFromPath } from "./FileReference"
import { IconExternalLink } from "@tabler/icons-react"

// 授权链接这类超长 URL 没有空格，nowrap + ellipsis 会把消息气泡撑出去。
const markdownLinkClassName =
	"min-w-0 max-w-full cursor-pointer overflow-hidden whitespace-normal break-all rounded bg-[#f0f6ff] px-1.5 py-0.5 text-xs font-normal leading-5 text-[#315cec] [overflow-wrap:anywhere] hover:bg-[#e0ecff]"

interface ParsedDomElement {
	attribs?: Record<string, string>
}

export interface MarkdownLinkProps {
	children?: ReactNode
	className?: unknown
	href?: unknown
	rel?: unknown
	target?: unknown
	title?: unknown
	domNode?: ParsedDomElement
}

interface ReferencedProjectResolution {
	href: string
	file: ReferencedProjectAttachment | null
}

function createReferencedProjectPreviewFile(file: ReferencedProjectAttachment) {
	return {
		...file,
		display_config: {
			...(file.display_config || {}),
			previewPolicy: {
				...(file.display_config?.previewPolicy || {}),
				standalone: true,
				syncWithAttachments: false,
				persistTab: false,
				restoreAsActive: false,
			},
		},
	}
}

export const MarkdownLink = observer((props: MarkdownLinkProps) => {
	const { children, href, rel, target, title } = props
	const { t } = useTranslation("super")
	const normalizedHref = typeof href === "string" ? href : ""
	const normalizedRel = typeof rel === "string" ? rel : undefined
	const normalizedTarget = typeof target === "string" ? target : undefined
	const normalizedTitle = typeof title === "string" ? title : undefined
	const rawAttributes = props.domNode?.attribs ?? {}
	const safeAttributes = Object.fromEntries(
		Object.entries(rawAttributes).filter(
			([name]) =>
				name === "id" ||
				name === "role" ||
				name.startsWith("data-") ||
				name.startsWith("aria-"),
		),
	)
	const normalizedStyle = normalizeInlineStyle(rawAttributes.style)
	const attachments = projectFilesStore.workspaceFilesList
	const fileTarget = parseMarkdownFileHref(normalizedHref)
	const workspacePath = fileTarget?.scope === "workspace" ? fileTarget.relativePath : null
	const referencedProjectId =
		fileTarget?.scope === "referenced-project" ? fileTarget.projectId : null
	const referencedProjectPath =
		fileTarget?.scope === "referenced-project" ? fileTarget.relativePath : null
	const fileInfo = workspacePath ? findAttachmentByPath(attachments, workspacePath) : undefined
	const [referencedProjectResolution, setReferencedProjectResolution] =
		useState<ReferencedProjectResolution | null>(null)

	useEffect(() => {
		if (!referencedProjectId || !referencedProjectPath) return

		let active = true
		void resolveReferencedProjectAttachment({
			scope: "referenced-project",
			projectId: referencedProjectId,
			relativePath: referencedProjectPath,
		}).then((file) => {
			if (active) setReferencedProjectResolution({ href: normalizedHref, file })
		})

		return () => {
			active = false
		}
	}, [normalizedHref, referencedProjectId, referencedProjectPath])

	const referencedProjectFile =
		referencedProjectResolution?.href === normalizedHref
			? referencedProjectResolution.file
			: null
	const resolvedFileInfo = fileInfo ?? referencedProjectFile

	const onClick = () => {
		if (!resolvedFileInfo?.file_id) return

		const fileData = referencedProjectFile
			? createReferencedProjectPreviewFile(referencedProjectFile)
			: resolvedFileInfo

		pubsub.publish(PubSubEvents.Open_File_Tab, {
			fileId: String(resolvedFileInfo.file_id),
			fileData,
		})
	}

	if (resolvedFileInfo) {
		return (
			<FileReference
				label={children}
				fileType={
					resolvedFileInfo.file_extension || getFileExtensionFromPath(normalizedHref)
				}
				onClick={onClick}
				title={typeof children === "string" ? children : normalizedHref}
			/>
		)
	}

	if (isMarkdownFileHrefCandidate(normalizedHref)) {
		const referencedProjectResolved =
			fileTarget?.scope !== "referenced-project" ||
			referencedProjectResolution?.href === normalizedHref
		return (
			<span {...safeAttributes} style={normalizedStyle}>
				<FileReference
					label={children}
					fileType={getFileExtensionFromPath(normalizedHref)}
					disabled
					title={
						referencedProjectResolved
							? t("common.fileNotFoundOrLoadFailed")
							: (normalizedTitle ?? normalizedHref)
					}
				/>
			</span>
		)
	}

	const isExternalLink = /^(?:https?:|mailto:)/i.test(normalizedHref)

	return (
		<a
			href={normalizedHref}
			rel={normalizedRel}
			target={normalizedTarget}
			className={cn(markdownLinkClassName, "!text-[#315cec]")}
			title={normalizedTitle ?? normalizedHref}
			data-testid="markdown-link-anchor"
			{...safeAttributes}
			style={normalizedStyle}
		>
			{isExternalLink ? (
				<IconExternalLink size={14} className="mr-1 inline shrink-0" />
			) : null}
			{children}
		</a>
	)
})
