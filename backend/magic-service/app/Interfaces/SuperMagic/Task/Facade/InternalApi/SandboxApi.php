<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Task\Facade\InternalApi;

use App\Application\SuperMagic\Task\Service\AgentAppService;
use App\Application\SuperMagic\Topic\Service\TopicAppService;
use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\Context\RequestContext;
use App\Interfaces\SuperMagic\Common\Support\Facade\AbstractApi;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
class SandboxApi extends AbstractApi
{
    public function __construct(
        protected RequestInterface $request,
        private readonly TopicAppService $topicAppService,
        private readonly AgentAppService $agentAppService,
    ) {
        parent::__construct($request);
    }

    /**
     * 检查沙箱镜像版本（当前版本 vs 最新版本）.
     * 沙箱调用此接口检查自身是否需要升级.
     */
    public function checkSandboxVersion(RequestContext $requestContext): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());
        $sandboxId = $this->getRequiredSandboxId();
        $topic = $this->topicAppService->getTopicBySandboxId($requestContext, $sandboxId);

        return $this->agentAppService->checkSandboxVersion((int) $topic->getId(), true, $sandboxId);
    }

    /**
     * 获取当前沙箱状态及镜像版本信息.
     */
    public function getSandboxInfo(RequestContext $requestContext): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());
        $sandboxId = $this->getRequiredSandboxId();
        $topic = $this->topicAppService->getTopicBySandboxId($requestContext, $sandboxId);

        return $this->agentAppService
            ->getSandboxInfo((int) $topic->getId(), $sandboxId)
            ->toArray();
    }

    /**
     * 沙箱自我升级接口.
     * 沙箱调用此接口将自身升级到最新 Agent 镜像.
     */
    public function upgradeSandbox(RequestContext $requestContext): array
    {
        $authorization = $this->getAuthorization();
        $requestContext->setUserAuthorization($authorization);
        $sandboxId = $this->getRequiredSandboxId();
        $topic = $this->topicAppService->getTopicBySandboxId($requestContext, $sandboxId);
        $dataIsolation = $this->createDataIsolation($requestContext);

        $newSandboxId = $this->agentAppService->upgradeSandbox($dataIsolation, (int) $topic->getId());

        return ['sandbox_id' => $newSandboxId];
    }

    /**
     * 无条件重启当前沙箱.
     */
    public function restartSandbox(RequestContext $requestContext): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());
        $sandboxId = $this->getRequiredSandboxId();
        $topic = $this->topicAppService->getTopicBySandboxId($requestContext, $sandboxId);
        $dataIsolation = $this->createDataIsolation($requestContext);

        $newSandboxId = $this->agentAppService->restartSandbox($dataIsolation, (int) $topic->getId());

        return ['sandbox_id' => $newSandboxId];
    }

    private function getRequiredSandboxId(): string
    {
        $sandboxId = trim((string) $this->request->input('sandbox_id', ''));
        if ($sandboxId === '') {
            ExceptionBuilder::throw(GenericErrorCode::ParameterMissing, 'sandbox_id is required');
        }

        return $sandboxId;
    }

    private function createDataIsolation(RequestContext $requestContext): DataIsolation
    {
        $authorization = $requestContext->getUserAuthorization();
        $dataIsolation = DataIsolation::create(
            $authorization->getOrganizationCode(),
            $authorization->getId()
        );
        $dataIsolation->setThirdPartyOrganizationCode($authorization->getOrganizationCode());

        return $dataIsolation;
    }
}
