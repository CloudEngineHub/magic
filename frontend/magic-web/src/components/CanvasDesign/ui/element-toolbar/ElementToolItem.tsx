import RichTextFillColor from "./text/RichTextFillColor/index"
import StrokeColor from "./shape/StrokeColor/index"
import SizeEditButton from "./size/SizeEditButton/index"
import FrameCreateButton from "./frame/FrameCreateButton/index"
import FrameRemoveButton from "./frame/FrameRemoveButton/index"
import RichTextFontFamily from "./text/RichTextFontFamily/index"
import RichTextFontStyle from "./text/RichTextFontStyle/index"
import RichTextFontSize from "./text/RichTextFontSize/index"
import RichTextTextAlign from "./text/RichTextTextAlign/index"
import ElementAlign from "./layout/ElementAlign/index"
import ElementDistribute from "./layout/ElementDistribute/index"
import ShapeStyle from "./shape/ShapeStyle/index"
import DownloadButton from "./download/DownloadButton/index"
import RichTextAdvancedButton from "./text/RichTextAdvancedButton/index"
import TextContentOptimizationButton from "./text/TextContentOptimizationButton/index"
import ImagePromptExtractionButton from "./image/ImagePromptExtractionButton/index"
import ImageConvertHightButton from "./image/ImageConvertHightButton/index"
import ImageConvertHight from "./image/ImageConvertHight/index"
import ImageCropButton from "./image/ImageCropButton/index"
import ImageExtendButton from "./image/ImageExtendButton/index"
import ImageRemoveBackgroundButton from "./image/ImageRemoveBackgroundButton/index"
import ImageEraserButton from "./image/ImageEraserButton/index"
import VideoOriginalSizeButton from "./video/VideoOriginalSizeButton/index"
import { ElementToolTypeEnum } from "../../public/props"
import type { ElementToolType } from "../../public/props"

export default function ElementToolItem({ type }: { type: ElementToolType }) {
	switch (type) {
		case ElementToolTypeEnum.RichTextFillColor:
			return <RichTextFillColor />
		case ElementToolTypeEnum.StrokeColor:
			return <StrokeColor />
		case ElementToolTypeEnum.SizeEditButton:
			return <SizeEditButton />
		case ElementToolTypeEnum.FrameCreateButton:
			return <FrameCreateButton />
		case ElementToolTypeEnum.FrameRemoveButton:
			return <FrameRemoveButton />
		case ElementToolTypeEnum.RichTextFontFamily:
			return <RichTextFontFamily />
		case ElementToolTypeEnum.RichTextFontStyle:
			return <RichTextFontStyle />
		case ElementToolTypeEnum.RichTextFontSize:
			return <RichTextFontSize />
		case ElementToolTypeEnum.RichTextTextAlign:
			return <RichTextTextAlign />
		case ElementToolTypeEnum.ElementAlign:
			return <ElementAlign />
		case ElementToolTypeEnum.ElementDistribute:
			return <ElementDistribute />
		case ElementToolTypeEnum.ShapeStyle:
			return <ShapeStyle />
		case ElementToolTypeEnum.DownloadButton:
			return <DownloadButton />
		case ElementToolTypeEnum.RichTextAdvancedButton:
			return <RichTextAdvancedButton />
		case ElementToolTypeEnum.TextContentOptimizationButton:
			return <TextContentOptimizationButton />
		case ElementToolTypeEnum.ImagePromptExtractionButton:
			return <ImagePromptExtractionButton />
		case ElementToolTypeEnum.ImageConvertHightButton:
			return <ImageConvertHightButton />
		case ElementToolTypeEnum.ImageConvertHight:
			return <ImageConvertHight />
		case ElementToolTypeEnum.ImageCropButton:
			return <ImageCropButton />
		case ElementToolTypeEnum.ImageExtendButton:
			return <ImageExtendButton />
		case ElementToolTypeEnum.ImageRemoveBackgroundButton:
			return <ImageRemoveBackgroundButton />
		case ElementToolTypeEnum.ImageEraserButton:
			return <ImageEraserButton />
		case ElementToolTypeEnum.VideoOriginalSizeButton:
			return <VideoOriginalSizeButton />
		default:
			return null
	}
}
