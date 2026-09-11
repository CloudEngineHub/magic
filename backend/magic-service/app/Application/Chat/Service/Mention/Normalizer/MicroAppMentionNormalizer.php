<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Chat\Service\Mention\Normalizer;

use App\Application\Chat\Service\Mention\AbstractMentionNormalizer;
use App\Application\SuperMagic\Project\Service\MicroAppProjectAppService;
use App\Application\SuperMagic\Project\Service\PublishedMicroAppResolver;
use App\Domain\SuperMagic\Common\Share\Constant\ShareAccessType;
use App\Domain\SuperMagic\Project\Repository\Facade\MicroAppRepositoryInterface;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use Hyperf\Logger\LoggerFactory;
use Throwable;

/**
 * @micro_app mention 规范化：补全 app_name / project_id。
 *
 * 已发布且当前用户可访问时补全 app_name / project_id。
 * 组织分享可见但不是项目成员时，仍按分享权限补全，不要求协作成员身份。
 */
class MicroAppMentionNormalizer extends AbstractMentionNormalizer
{
    public function __construct(
        LoggerFactory $loggerFactory,
        private readonly MicroAppRepositoryInterface $microAppRepository,
        private readonly MicroAppProjectAppService $microAppProjectAppService,
        private readonly PublishedMicroAppResolver $publishedMicroAppResolver,
    ) {
        parent::__construct($loggerFactory);
    }

    protected function enrich(array $item, BaseDataIsolation $dataIsolation): array
    {
        $appId = (int) ($item['app_id'] ?? ($item['id'] ?? 0));
        if ($appId <= 0) {
            return [];
        }

        $record = $this->microAppRepository->findById($appId);
        if ($record === null) {
            return [];
        }

        $publishedMicroApp = $this->publishedMicroAppResolver->findPublished($appId);
        if ($publishedMicroApp === null) {
            return [];
        }

        [, $shareEntity] = $publishedMicroApp;
        $userId = $dataIsolation->getCurrentUserId();
        $organizationCode = $dataIsolation->getCurrentOrganizationCode();
        $appName = '';

        try {
            $project = $this->microAppProjectAppService->getAccessibleProject(
                $record->getProjectId(),
                $userId,
                $organizationCode,
            );
            $appName = trim($project->getProjectName());
        } catch (Throwable) {
            if (
                $shareEntity->getShareType() === ShareAccessType::PasswordProtected->value
                || ! $this->publishedMicroAppResolver->canAccessShare($shareEntity, $userId, $organizationCode)
            ) {
                return [];
            }
        }

        if ($appName === '') {
            $appName = $this->publishedMicroAppResolver->getProjectName($appId);
        }
        if ($appName === '') {
            $appName = (string) ($item['app_name'] ?? $appId);
        }

        return [
            'app_id' => (string) $appId,
            'app_name' => $appName,
            'project_id' => (string) $record->getProjectId(),
        ];
    }
}
