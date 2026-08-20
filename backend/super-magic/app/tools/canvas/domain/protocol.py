"""Canvas 3.0 Element 与 Content 的协议字段目录。"""

SUPPORTED_ELEMENT_TYPES = {
    "frame", "group", "image", "text", "rectangle", "ellipse", "triangle", "star",
    "video", "audio", "storyboard", "video-edit",
}
BASE_ELEMENT_FIELDS = {
    "id", "name", "type", "visible", "locked", "opacity", "x", "y", "width", "height",
    "scaleX", "scaleY", "zIndex", "interactionConfig", "contents", "activeContentId", "mainContentId",
}
CONTENT_FIELDS = {
    "frame": set(),
    "group": set(),
    "image": {"src", "status", "errorMessage", "generateImageRequest", "imageGenerationTaskMeta", "crop"},
    "video": {"src", "status", "errorMessage", "generateVideoRequest", "videoGenerationResultMeta"},
    "audio": {"src"},
    "text": {"content", "defaultStyle"},
    "rectangle": {"fill", "stroke", "strokeWidth", "cornerRadius"},
    "ellipse": {"fill", "stroke", "strokeWidth"},
    "triangle": {"fill", "stroke", "strokeWidth"},
    "star": {"fill", "stroke", "strokeWidth", "cornerRadius", "sides", "innerRadiusRatio"},
    "storyboard": {"generationConfig", "shots"},
    "video-edit": {"videoSequence", "output"},
}
