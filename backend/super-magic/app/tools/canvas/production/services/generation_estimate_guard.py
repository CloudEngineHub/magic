"""真实生成前的积分预估确认门。"""

from app.tools.canvas.application.commands import GenerationParameters
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.production.estimation import (
    CostEstimateRepositoryInterface,
    CostEstimateRequestNormalizerRegistry,
)


class GenerationEstimateGuard:
    """校验 billable 内容的 estimate_id、item_ref 和请求指纹。"""

    def __init__(
        self,
        estimate_records: CostEstimateRepositoryInterface,
        normalizers: CostEstimateRequestNormalizerRegistry,
    ) -> None:
        """显式绑定预估凭证仓储和视频请求规范化器。"""
        self._estimate_records = estimate_records
        self._normalizers = normalizers

    async def validate(
        self,
        project_path: str,
        item_ref: str | None,
        production_rule: str | None,
        parameters: GenerationParameters,
    ) -> None:
        """对声明为可计费的内容规则执行通用确认校验。"""
        if not production_rule:
            raise CanvasDomainError(
                "POINT_ESTIMATE_UNAVAILABLE",
                "This billable generation capability has no configured content production rule.",
            )
        if not item_ref:
            raise CanvasDomainError("POINT_ESTIMATE_REQUIRED", "Billable generation requires a stable item_ref and estimate_id.")
        estimate_id = parameters.estimate_id
        if not estimate_id:
            raise CanvasDomainError("POINT_ESTIMATE_REQUIRED", "Estimate content points and obtain user confirmation before generation.")
        record = await self._estimate_records.get(estimate_id)
        if record is None:
            raise CanvasDomainError("POINT_ESTIMATE_NOT_FOUND", "The point estimate is missing or expired. Estimate again before generation.")
        if record.project_path != project_path or record.production_rule != production_rule:
            raise CanvasDomainError("POINT_ESTIMATE_MISMATCH", "The point estimate does not belong to this project or production rule.")
        record_item = record.get_item(item_ref)
        if record_item is None or record_item.status not in {"estimated", "not_billable"}:
            raise CanvasDomainError("POINT_ESTIMATE_MISMATCH", "The point estimate does not contain an eligible result for this item_ref.")
        current = self._normalizers.get(production_rule).normalize(project_path, item_ref, parameters)
        if current.request_fingerprint != record_item.request_fingerprint:
            raise CanvasDomainError("POINT_ESTIMATE_MISMATCH", "Video parameters changed after estimation. Estimate again before generation.")
