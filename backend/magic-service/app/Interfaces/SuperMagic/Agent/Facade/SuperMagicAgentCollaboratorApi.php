<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Agent\Facade;

use App\Application\SuperMagic\Agent\Collaboration\AgentResourceAdapter;
use App\Application\SuperMagic\Common\Collaboration\Service\ResourceCollaborationAppService;
use App\Interfaces\SuperMagic\Common\Support\Facade\AbstractApi;
use App\Interfaces\SuperMagic\Project\DTO\Request\BatchUpdateMembersRequestDTO;
use App\Interfaces\SuperMagic\Project\DTO\Request\CreateMembersRequestDTO;
use App\Interfaces\SuperMagic\Project\DTO\Request\UpdateProjectMembersRequestDTO;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;
use Hyperf\HttpServer\Contract\RequestInterface;

/**
 * Agent 协作者接口。
 *
 * 对外暴露 Agent 协作者的查询、新增、删除和改权能力。
 */
#[ApiResponse('low_code')]
class SuperMagicAgentCollaboratorApi extends AbstractApi
{
    #[Inject]
    protected ResourceCollaborationAppService $resourceCollaborationAppService;

    #[Inject]
    protected AgentResourceAdapter $agentResourceAdapter;

    /**
     * 注入 Agent 协作者接口所需的请求对象。
     */
    public function __construct(protected RequestInterface $request)
    {
        parent::__construct($request);
    }

    /**
     * 查询 Agent 协作者列表。
     */
    public function index(string $code): array
    {
        return $this->resourceCollaborationAppService->getCollaborators(
            $this->agentResourceAdapter,
            $this->getAuthorization(),
            $code
        )->toArray();
    }

    /**
     * 新增 Agent 协作者。
     */
    public function store(string $code): array
    {
        $requestDTO = CreateMembersRequestDTO::fromRequest($this->request);
        return $this->resourceCollaborationAppService->addCollaborators(
            $this->agentResourceAdapter,
            $this->getAuthorization(),
            $code,
            $requestDTO->getMembers()
        )->toArray();
    }

    /**
     * 更新 Agent 协作者角色。
     */
    public function update(string $code): array
    {
        $requestDTO = BatchUpdateMembersRequestDTO::fromRequest($this->request);
        $this->resourceCollaborationAppService->updateCollaboratorRoles(
            $this->agentResourceAdapter,
            $this->getAuthorization(),
            $code,
            $requestDTO->getMembers()
        );

        return [];
    }

    /**
     * 删除 Agent 协作者。
     */
    public function destroy(string $code): array
    {
        $requestDTO = UpdateProjectMembersRequestDTO::fromRequest($this->request);
        $this->resourceCollaborationAppService->removeCollaborators(
            $this->agentResourceAdapter,
            $this->getAuthorization(),
            $code,
            $requestDTO->getMembers()
        );

        return [];
    }
}
