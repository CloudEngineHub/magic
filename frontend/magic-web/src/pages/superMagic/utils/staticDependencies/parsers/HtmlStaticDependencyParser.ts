import { collectFileIdsFromHtml } from "@/pages/superMagic/components/Detail/contents/HTML/htmlProcessor"
import { BaseStaticDependencyParser } from "../BaseStaticDependencyParser"
import { getStaticDependencyDirectoryPath, getStaticDependencyFileExtension } from "../pathUtils"
import type { StaticDependencyAttachment, StaticDependencyResolveContext } from "../types"

export class HtmlStaticDependencyParser extends BaseStaticDependencyParser {
	protected readonly fileType = "html" as const

	supports(file: StaticDependencyAttachment): boolean {
		return (
			!file.is_directory && ["html", "htm"].includes(getStaticDependencyFileExtension(file))
		)
	}

	protected collectDependencies(context: StaticDependencyResolveContext) {
		return {
			dependencyFileIds: Array.from(
				collectFileIdsFromHtml({
					content: context.content,
					attachments: context.attachments,
					html_relative_path: getStaticDependencyDirectoryPath(
						context.file.relative_file_path,
					),
					displayConfig: context.file.display_config,
				}),
			),
		}
	}
}
