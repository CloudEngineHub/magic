<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\File\Service;

use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Exception\SandboxOperationException;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Result\SandboxStatusResult;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\SandboxGatewayInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;

/**
 * Agent消息应用服务
 * 提供高级Agent通信功能，包括自动初始化和状态管理.
 */
class AgentFileAppService
{
    private LoggerInterface $logger;

    public function __construct(
        LoggerFactory $loggerFactory,
        private readonly SandboxGatewayInterface $gateway,
    ) {
        $this->logger = $loggerFactory->get('sandbox');
    }

    /**
     * 获取沙箱状态
     *
     * @param string $sandboxId 沙箱ID
     * @return SandboxStatusResult 沙箱状态结果
     */
    public function getSandboxStatus(string $sandboxId): SandboxStatusResult
    {
        $this->logger->info('[Sandbox][App] Getting sandbox status', [
            'sandbox_id' => $sandboxId,
        ]);

        $result = $this->gateway->getSandboxStatus($sandboxId);

        if (! $result->isSuccess()) {
            $this->logger->error('[Sandbox][App] Failed to get sandbox status', [
                'sandbox_id' => $sandboxId,
                'error' => $result->getMessage(),
                'code' => $result->getCode(),
            ]);
            throw new SandboxOperationException('Get sandbox status', $result->getMessage(), $result->getCode());
        }

        $this->logger->info('[Sandbox][App] Sandbox status retrieved', [
            'sandbox_id' => $sandboxId,
            'status' => $result->getStatus(),
        ]);

        return $result;
    }
}
