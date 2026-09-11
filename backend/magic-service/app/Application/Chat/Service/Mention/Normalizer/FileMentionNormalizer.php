<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Chat\Service\Mention\Normalizer;

use App\Application\Chat\Service\Mention\MentionNormalizerInterface;
use App\Application\SuperMagic\File\Service\FileReferenceAppService;
use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\MentionType;
use App\Domain\SuperMagic\File\Entity\ValueObject\FileSpaceType;
use App\ErrorCode\SuperAgentErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\SuperMagic\File\DTO\Request\FileReferenceSelectorDTO;
use App\Interfaces\SuperMagic\File\DTO\Response\FileReferenceDTO;
use App\Interfaces\SuperMagic\File\DTO\Response\FileReferenceStatus;

/**
 * 引用按真实记录鉴权并重建路径；鉴权失败不能透传客户端声明的个人文件路径。
 */
final class FileMentionNormalizer implements MentionNormalizerInterface
{
    public function __construct(private readonly FileReferenceAppService $references)
    {
    }

    public function normalize(array $item, BaseDataIsolation $dataIsolation): array
    {
        return $this->normalizeMany([$item], $dataIsolation)[0];
    }

    /** @param array<int, array<string, mixed>> $items */
    public function normalizeMany(array $items, BaseDataIsolation $dataIsolation): array
    {
        $selectors = [];
        $indices = [];
        foreach ($items as $index => $item) {
            $id = $item['file_id'] ?? $item['directory_id'] ?? null;
            $selector = FileReferenceSelectorDTO::fromInput(['file_id' => $id]);
            $requiresIdentity = in_array($item['type'] ?? '', [
                MentionType::USER_FILE->value,
                MentionType::USER_DIRECTORY->value,
                MentionType::MEMORY_FILE->value,
                MentionType::MEMORY_DIRECTORY->value,
            ], true) || (string) ($item['project_id'] ?? '') === '0'
                || (string) ($item['source_project_id'] ?? '') === '0';

            if (! $selector->isValid()) {
                if ($requiresIdentity) {
                    ExceptionBuilder::throw(SuperAgentErrorCode::FILE_PERMISSION_DENIED, 'file.file_permission_denied');
                }
                // 历史项目目录可能只保存路径；保留既有项目权限与挂载处理。
                continue;
            }
            $indices[] = $index;
            $selectors[] = $selector;
        }
        if ($selectors === []) {
            return $items;
        }

        $authorization = (new MagicUserAuthorization())
            ->setId($dataIsolation->getCurrentUserId())
            ->setOrganizationCode($dataIsolation->getCurrentOrganizationCode());
        $results = $this->references->resolve($authorization, $selectors);
        foreach ($results as $position => $result) {
            if ($result->status !== FileReferenceStatus::Resolved || $result->reference === null) {
                ExceptionBuilder::throw(SuperAgentErrorCode::FILE_PERMISSION_DENIED, 'file.file_permission_denied');
            }
            $index = $indices[$position];
            $items[$index] = $this->applyReference($items[$index], $result->reference);
        }

        return $items;
    }

    private function applyReference(array $item, FileReferenceDTO $reference): array
    {
        $isUser = $reference->spaceType === FileSpaceType::USER;
        $path = ($isUser ? '~/' : '') . $reference->spaceRelativePath;
        // 用户结果使用白名单构造，旧 project_id、source_*、pending_project_copy 不得遗留。
        $result = $isUser ? [] : $item;
        if (! $isUser) {
            $result['project_id'] = $reference->projectId;
        }
        if ($reference->isDirectory) {
            return array_merge($result, [
                'type' => ($isUser ? MentionType::USER_DIRECTORY : MentionType::PROJECT_DIRECTORY)->value,
                'directory_id' => $reference->fileId,
                'directory_name' => $reference->fileName,
                'directory_path' => rtrim($path, '/') . '/',
            ]);
        }
        return array_merge($result, [
            'type' => ($isUser ? MentionType::USER_FILE : MentionType::PROJECT_FILE)->value,
            'file_id' => $reference->fileId,
            'file_name' => $reference->fileName,
            'file_path' => $path,
            'file_extension' => $reference->fileExtension,
        ]);
    }
}
