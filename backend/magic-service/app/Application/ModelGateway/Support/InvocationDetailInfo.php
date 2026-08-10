<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\ModelGateway\Support;

use Throwable;

/**
 * 模型网关侧 invocation 详情结构（与审计落库 detail_info 键名一致，便于下游投影）.
 */
final class InvocationDetailInfo
{
    /**
     * 失败原因文案最大字符数（多字节安全），防止异常 message 过长撑爆 JSON / packet。
     */
    public const MAX_FAILURE_REASON_LENGTH = 8192;

    /**
     * 最多记录两层下级异常，避免异常链过深导致审计详情膨胀。
     */
    public const MAX_PREVIOUS_EXCEPTION_DEPTH = 2;

    /**
     * @param array<string, mixed> $extras 非空时写入 extras 子键，避免污染固定字段
     */
    public static function forModel(
        string $appId,
        string $sourceId,
        string $providerModelId,
        array $extras = []
    ): array {
        $detail = [
            'app_id' => $appId,
            'source_id' => $sourceId,
            'provider_model_id' => $providerModelId,
        ];
        if ($extras !== []) {
            $detail['extras'] = $extras;
        }

        return $detail;
    }

    /**
     * @param array<string, mixed> $extras 非空时写入 extras 子键
     */
    public static function forTool(
        string $appId,
        string $sourceId,
        string $engine,
        string $target,
        array $extras = []
    ): array {
        $detail = [
            'app_id' => $appId,
            'source_id' => $sourceId,
            'engine' => $engine,
            'target' => $target,
        ];
        if ($extras !== []) {
            $detail['extras'] = $extras;
        }

        return $detail;
    }

    /**
     * 将失败原因写入 extras（含截断），失败审计路径应始终带该键，无文案则为空串。
     *
     * @param array<string, mixed> $extras
     * @return array<string, mixed>
     */
    public static function withFailureReason(array $extras, string $reason): array
    {
        $extras['failure_reason'] = self::truncateFailureReason($reason);

        return $extras;
    }

    /**
     * 将已经提取的下级异常链写入 extras。
     *
     * @param array<string, mixed> $extras
     * @param array<int, array<string, int|string>> $previousExceptions
     * @return array<string, mixed>
     */
    public static function withPreviousExceptions(array $extras, array $previousExceptions): array
    {
        if ($previousExceptions !== []) {
            $extras['previous_exceptions'] = $previousExceptions;
        }

        return $extras;
    }

    /**
     * 从当前异常开始提取下级异常，当前异常本身仍由 failure_reason 记录。
     *
     * @return array<int, array{depth: int, class: string, code: int, message: string}>
     */
    public static function extractPreviousExceptions(
        Throwable $throwable,
        int $maxDepth = self::MAX_PREVIOUS_EXCEPTION_DEPTH
    ): array {
        $depthLimit = min(max($maxDepth, 0), self::MAX_PREVIOUS_EXCEPTION_DEPTH);
        $previousExceptions = [];
        $previous = $throwable->getPrevious();

        for ($depth = 1; $previous !== null && $depth <= $depthLimit; ++$depth) {
            $previousExceptions[] = [
                'depth' => $depth,
                'class' => $previous::class,
                'code' => $previous->getCode(),
                'message' => self::truncateFailureReason($previous->getMessage()),
            ];
            $previous = $previous->getPrevious();
        }

        return $previousExceptions;
    }

    public static function truncateFailureReason(string $reason): string
    {
        if (mb_strlen($reason, 'UTF-8') <= self::MAX_FAILURE_REASON_LENGTH) {
            return $reason;
        }

        return mb_substr($reason, 0, self::MAX_FAILURE_REASON_LENGTH, 'UTF-8');
    }
}
