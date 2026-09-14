<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Chat\Service\Mention\Normalizer;

use App\Application\Chat\Service\Mention\AbstractMentionNormalizer;
use App\Application\SuperMagic\Project\Service\PublishedMicroAppResolver;
use App\Application\SuperMagic\Task\Service\ReferencedProjectAccessKind;
use App\Application\SuperMagic\Task\Service\ReferencedProjectCollaborationAccess;
use App\Domain\SuperMagic\Project\Entity\MicroAppEntity;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use Hyperf\Logger\LoggerFactory;

/**
 * @micro_app mention 规范化：补全 app_name / project_id。
 *
 * 仅项目创建者/协作者可补全，供 Planner 走协作挂载。
 * 前端 @微应用 只传 app_id / app_name，project_id 必须在这里补。
 */
class MicroAppMentionNormalizer extends AbstractMentionNormalizer
{
    public function __construct(
        LoggerFactory $loggerFactory,
        private readonly PublishedMicroAppResolver $publishedMicroAppResolver,
        private readonly ReferencedProjectCollaborationAccess $collaborationAccess,
    ) {
        parent::__construct($loggerFactory);
    }

    protected function enrich(array $item, BaseDataIsolation $dataIsolation): array
    {
        $appId = (int) ($item['app_id'] ?? ($item['id'] ?? 0));
        if ($appId <= 0) {
            return [];
        }

        $publishedMicroApp = $this->publishedMicroAppResolver->findPublished($appId);
        if ($publishedMicroApp === null) {
            return [];
        }

        [$record] = $publishedMicroApp;
        $userId = $dataIsolation->getCurrentUserId();
        $organizationCode = $dataIsolation->getCurrentOrganizationCode();

        if (! $this->collaborationAccess->canAccess($record->getProjectId(), $userId, $organizationCode)) {
            return [];
        }

        return [
            ...$this->enrichedFields($record, $appId, $item),
            'access_kind' => ReferencedProjectAccessKind::Collaboration->value,
        ];
    }

    /**
     * @param array<string, mixed> $item
     * @return array<string, string>
     */
    private function enrichedFields(MicroAppEntity $record, int $appId, array $item): array
    {
        $appName = $this->publishedMicroAppResolver->getProjectNameFromRecord($record);
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
