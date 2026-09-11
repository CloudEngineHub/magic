<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Chat\Service\Mention\Normalizer;

use App\Application\Chat\Service\Mention\AbstractMentionNormalizer;
use App\Application\SuperMagic\Project\Service\MicroAppProjectAppService;
use App\Application\SuperMagic\Project\Service\PublishedMicroAppResolver;
use App\Domain\SuperMagic\Project\Repository\Facade\MicroAppRepositoryInterface;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use Hyperf\Logger\LoggerFactory;

/**
 * @micro_app mention 规范化：补全 app_name / project_id。
 *
 * 失败时保留原始 mention，super-magic 端 micro_app_handler 会跳过 scope 注入。
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

        if ($this->publishedMicroAppResolver->findPublished($appId) === null) {
            return [];
        }

        $project = $this->microAppProjectAppService->getAccessibleProject(
            $record->getProjectId(),
            $dataIsolation->getCurrentUserId(),
            $dataIsolation->getCurrentOrganizationCode(),
        );

        $appName = trim($project->getProjectName());
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
