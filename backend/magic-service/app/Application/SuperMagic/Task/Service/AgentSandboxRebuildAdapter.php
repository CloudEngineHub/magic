<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Task\Service;

use App\Application\SuperMagic\Task\Contract\SandboxRebuildPortInterface;
use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\SuperMagic\Task\Service\AgentDomainService;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Exception\SandboxOperationException;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Constant\ResponseCode;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;

/**
 * 用 AgentAppService 既有的重启流程实现重建端口.
 *
 * 两个关键约束：
 * 1. 重建必须跳过温池（allowWarmPool=false）。镜像发布会先把老 pod 删掉，
 *    若这时从温池领一个更早构建的 pod，等于把刚删掉的老镜像原样换回来。
 * 2. 删除必须幂等：清单里的 pod 可能已被 GC 或前一轮重启删掉，
 *    网关返回 NOT_FOUND 时视为已完成。
 */
readonly class AgentSandboxRebuildAdapter implements SandboxRebuildPortInterface
{
    private LoggerInterface $logger;

    public function __construct(
        private AgentAppService $agentAppService,
        private AgentDomainService $agentDomainService,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get('sandbox');
    }

    public function deleteSandbox(string $sandboxId): void
    {
        if ($sandboxId === '') {
            return;
        }

        try {
            $this->agentDomainService->stopSandbox($sandboxId);
        } catch (SandboxOperationException $e) {
            if (ResponseCode::isNotFound($e->getCode())) {
                $this->logger->info('[Sandbox][Restart] Sandbox already gone, nothing to delete', [
                    'sandbox_id' => $sandboxId,
                ]);
                return;
            }
            throw $e;
        }
    }

    public function rebuild(int $topicId, string $userId, string $organizationCode): string
    {
        $dataIsolation = DataIsolation::create($organizationCode, $userId);
        $dataIsolation->setThirdPartyOrganizationCode($organizationCode);

        return $this->agentAppService->restartSandbox($dataIsolation, $topicId, allowWarmPool: false);
    }
}
