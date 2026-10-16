<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Result;

use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Constant\ResponseCode;

/**
 * 沙箱列表结果类
 * 对应网关的 GET /api/v1/sandboxes（按状态过滤的沙箱清单）.
 */
class SandboxListResult extends GatewayResult
{
    /**
     * @var array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}>
     */
    private array $sandboxes = [];

    /**
     * 从API响应创建沙箱列表结果.
     */
    public static function fromApiResponse(array $response): self
    {
        $result = new self(
            $response['code'] ?? ResponseCode::ERROR,
            $response['message'] ?? 'Unknown error',
            $response['data'] ?? []
        );

        $data = $response['data'] ?? [];
        $sandboxes = is_array($data) ? ($data['sandboxes'] ?? []) : [];
        if (! is_array($sandboxes)) {
            return $result;
        }

        foreach ($sandboxes as $sandbox) {
            if (! is_array($sandbox) || ! isset($sandbox['sandbox_id'])) {
                continue;
            }
            $result->sandboxes[] = [
                'sandbox_id' => (string) $sandbox['sandbox_id'],
                'status' => (string) ($sandbox['status'] ?? ''),
                'project_id' => (string) ($sandbox['project_id'] ?? ''),
                'topic_id' => (string) ($sandbox['topic_id'] ?? ''),
                'warm_pool' => (bool) ($sandbox['warm_pool'] ?? false),
                'bound' => (bool) ($sandbox['bound'] ?? false),
                // pod 创建时间（RFC3339 UTC）：老网关不返回该字段时为空串，调用方按“未知”处理。
                'created_at' => (string) ($sandbox['created_at'] ?? ''),
            ];
        }

        return $result;
    }

    /**
     * 获取沙箱列表.
     *
     * @return array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}>
     */
    public function getSandboxes(): array
    {
        return $this->sandboxes;
    }

    public function getTotal(): int
    {
        if ($this->sandboxes !== []) {
            return count($this->sandboxes);
        }

        $total = $this->getDataValue('total');
        return is_numeric($total) ? (int) $total : 0;
    }

    /**
     * 状态分布，用于运维日志快速判断清单构成.
     *
     * @return array<string, int>
     */
    public function getStatusCounts(): array
    {
        $counts = [];
        foreach ($this->sandboxes as $sandbox) {
            $status = $sandbox['status'] !== '' ? $sandbox['status'] : 'Unknown';
            $counts[$status] = ($counts[$status] ?? 0) + 1;
        }

        return $counts;
    }
}
