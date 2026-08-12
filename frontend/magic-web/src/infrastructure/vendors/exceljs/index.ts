// 按需加载方式
export const loadExcelJS = () =>
	import(
		// @ts-ignore
		"exceljs/dist/exceljs.min"
	).then((m) => m.default)

export default loadExcelJS
