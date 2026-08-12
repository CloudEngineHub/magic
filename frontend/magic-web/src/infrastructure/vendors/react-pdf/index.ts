// 按需加载方式
export { Document, Page } from "react-pdf"
export type { DocumentProps, PageProps } from "react-pdf"

export const loadReactPdf = () =>
	import("react-pdf").then((m) => {
		// 初始化 worker 配置
		if (m.pdfjs?.GlobalWorkerOptions) {
			m.pdfjs.GlobalWorkerOptions.workerSrc = "/packages/pdfjs/pdf.worker.min.mjs"
		}
		return m.pdfjs
	})

export default loadReactPdf
