<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\File\Service;

use App\Application\SuperMagic\Common\Service\AbstractAppService;
use App\Domain\SuperMagic\File\Service\FileEditingDomainService;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
use App\Domain\SuperMagic\Project\Entity\ValueObject\MemberRole;
use App\Infrastructure\Util\Context\RequestContext;

/**
 * 文件编辑状态应用服务
 */
class FileEditingAppService extends AbstractAppService
{
    public function __construct(
        private readonly FileEditingDomainService $fileEditingDomainService,
        private readonly TaskFileDomainService $taskFileDomainService,
    ) {
    }

    /**
     * 加入编辑.
     */
    public function joinEditing(RequestContext $requestContext, int $fileId): void
    {
        $userAuthorization = $requestContext->getUserAuthorization();

        // 权限检查
        $fileEntity = $this->taskFileDomainService->getFileEntityById($fileId);
        $projectEntity = $this->getAccessibleProjectForTaskFile(
            $fileEntity,
            $userAuthorization,
            MemberRole::EDITOR,
        );
        $organizationCode = $projectEntity?->getUserOrganizationCode()
            ?? $fileEntity->getOrganizationCode();

        // 委托Domain层处理业务逻辑
        $this->fileEditingDomainService->joinEditing($fileId, $userAuthorization->getId(), $organizationCode);
    }

    /**
     * 离开编辑.
     */
    public function leaveEditing(RequestContext $requestContext, int $fileId): void
    {
        $userAuthorization = $requestContext->getUserAuthorization();

        // 权限检查
        $fileEntity = $this->taskFileDomainService->getFileEntityById($fileId);
        $projectEntity = $this->getAccessibleProjectForTaskFile(
            $fileEntity,
            $userAuthorization,
            MemberRole::EDITOR,
        );
        $organizationCode = $projectEntity?->getUserOrganizationCode()
            ?? $fileEntity->getOrganizationCode();

        // 委托Domain层处理业务逻辑
        $this->fileEditingDomainService->leaveEditing($fileId, $userAuthorization->getId(), $organizationCode);
    }

    /**
     * 获取编辑用户数量.
     */
    public function getEditingUsers(RequestContext $requestContext, int $fileId): int
    {
        $userAuthorization = $requestContext->getUserAuthorization();

        // 权限检查
        $fileEntity = $this->taskFileDomainService->getFileEntityById($fileId);
        $projectEntity = $this->getAccessibleProjectForTaskFile(
            $fileEntity,
            $userAuthorization,
            MemberRole::VIEWER,
        );
        $organizationCode = $projectEntity?->getUserOrganizationCode()
            ?? $fileEntity->getOrganizationCode();

        // 委托Domain层查询编辑用户数量
        return $this->fileEditingDomainService->getEditingUsersCount($fileId, $organizationCode);
    }
}
