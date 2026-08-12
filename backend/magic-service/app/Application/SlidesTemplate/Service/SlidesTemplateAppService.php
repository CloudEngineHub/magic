<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Domain\Audit\ResourceAccess\Service\ResourceAccessLogDomainService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateCodeAvailability;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateQueryScope;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagMatch;
use App\Domain\SlidesTemplate\Service\SlidesTemplateCategoryDomainService;
use App\Domain\SlidesTemplate\Service\SlidesTemplateDomainService;
use App\Domain\SlidesTemplate\Service\SlidesTemplateFavoriteDomainService;
use App\Domain\SlidesTemplate\Service\SlidesTemplateTagDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\PublishSlidesTemplateFromProjectRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\QueryFavoriteSlidesTemplateRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\QueryUsedSlidesTemplateRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\SaveUserSlidesTemplateRequest;
use Dtyq\CloudFile\Kernel\Struct\FileLink;
use Qbhy\HyperfAuth\Authenticatable;

class SlidesTemplateAppService extends AbstractSlidesTemplateAppService
{
    private const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'];

    public function __construct(
        SlidesTemplateDomainService $slidesTemplateDomainService,
        private readonly SlidesTemplateTagDomainService $slidesTemplateTagDomainService,
        private readonly SlidesTemplateCategoryDomainService $slidesTemplateCategoryDomainService,
        private readonly SlidesTemplateFavoriteDomainService $slidesTemplateFavoriteDomainService,
        private readonly ResourceAccessLogDomainService $resourceAccessLogDomainService,
        private readonly SlidesTemplateProjectPublishService $slidesTemplateProjectPublishService,
    ) {
        parent::__construct($slidesTemplateDomainService);
    }

    /** @return array{page: Page, list: SlidesTemplateEntity[], favorite_codes: array<string, bool>} */
    public function queries(Authenticatable|BaseDataIsolation $authorization, PublicQuerySlidesTemplateRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        $query = $this->createPublicQuery($request);
        $page = $this->createListPage($request->getPage(), $request->getPageSize());
        $page->setTotal(false);
        $result = $this->slidesTemplateDomainService->queries($dataIsolation, $query, $page);
        $this->resolveListImageUrls($result['list']);
        $this->slidesTemplateTagDomainService->fillTemplateTags($dataIsolation, $result['list']);

        return [
            'page' => $page,
            'list' => $result['list'],
            'favorite_codes' => $this->getFavoriteCodes($dataIsolation, $query),
        ];
    }

    public function count(Authenticatable|BaseDataIsolation $authorization, PublicQuerySlidesTemplateRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        $query = $this->createPublicQuery($request);
        $query->setScope(SlidesTemplateQueryScope::Official);
        $query->setStatus(SlidesTemplateStatus::Enabled->value);
        return $this->slidesTemplateDomainService->getCount($dataIsolation, $query);
    }

    public function detail(Authenticatable|BaseDataIsolation $authorization, string $code): SlidesTemplateEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        $template = $this->slidesTemplateDomainService->findByCodeOrFail($dataIsolation, $code);
        $this->slidesTemplateDomainService->assertUserAccessible($dataIsolation, $template);
        $this->resolveAssetUrls([$template], includeTemplateFileUrl: false);
        $this->slidesTemplateTagDomainService->fillTemplateTags($dataIsolation, [$template]);
        return $template;
    }

    public function save(Authenticatable|BaseDataIsolation $authorization, SaveUserSlidesTemplateRequest $request): SlidesTemplateEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        $this->assertOfficialCategory($dataIsolation, $request->getCategoryCode());
        $this->assertOfficialTags($dataIsolation, $request->getTagCodes());
        $this->assertTemplateFileIsArchive($request->getTemplateFileKey());
        $this->assertPrivateFileExists($dataIsolation->getCurrentOrganizationCode(), $request->getTemplateFileKey());
        $this->assertPublicFilesExist($dataIsolation->getCurrentOrganizationCode(), [
            $request->getThumbnailFileKey(),
            $request->getCollageFileKey(),
            ...$request->getPreviewImageFileKeys(),
        ]);

        $entity = new SlidesTemplateEntity();
        $entity->setCode($request->getCode() ?? '')
            ->setCategoryCode($request->getCategoryCode())
            ->setLabel($request->getLabel())
            ->setDescription($request->getDescription())
            ->setThumbnailFileKey($request->getThumbnailFileKey())
            ->setCollageFileKey($request->getCollageFileKey())
            ->setPreviewImageFileKeys($request->getPreviewImageFileKeys())
            ->setTemplateFileKey($request->getTemplateFileKey())
            ->setPreviewUrl($request->getPreviewUrl());
        $saved = $this->slidesTemplateDomainService->saveUserTemplate(
            $dataIsolation,
            $entity,
            $request->hasStatus() ? SlidesTemplateStatus::from($request->getStatus()) : null,
            $request->hasTagCodes() ? $request->getTagCodes() : null,
        );
        $this->resolveAssetUrls([$saved], false);
        $this->slidesTemplateTagDomainService->fillTemplateTags($dataIsolation, [$saved]);
        return $saved;
    }

    public function publishFromProject(
        Authenticatable|BaseDataIsolation $authorization,
        PublishSlidesTemplateFromProjectRequest $request
    ): SlidesTemplateEntity {
        if (! $authorization instanceof MagicUserAuthorization) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::USER_TEMPLATE_ACCESS_DENIED);
        }

        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        $payload = $this->slidesTemplateProjectPublishService->publishFromProjectWorkspace(
            $authorization,
            $dataIsolation,
            $request->getProjectId(),
            $request->getDirectoryId(),
            $request->getCode(),
        );

        $this->assertOfficialCategory($dataIsolation, $payload['category_code']);
        $this->assertOfficialTags($dataIsolation, $payload['tag_codes']);
        $this->assertTemplateFileIsArchive($payload['template_file_key']);
        $this->assertPrivateFileExists($dataIsolation->getCurrentOrganizationCode(), $payload['template_file_key']);
        $this->assertPublicFilesExist($dataIsolation->getCurrentOrganizationCode(), [
            $payload['thumbnail_file_key'],
            $payload['collage_file_key'],
            ...$payload['preview_image_file_keys'],
        ]);

        $entity = new SlidesTemplateEntity();
        $entity->setCode($payload['code'])
            ->setCategoryCode($payload['category_code'])
            ->setLabel($payload['label'])
            ->setDescription($payload['description'])
            ->setThumbnailFileKey($payload['thumbnail_file_key'])
            ->setCollageFileKey($payload['collage_file_key'])
            ->setPreviewImageFileKeys($payload['preview_image_file_keys'])
            ->setTemplateFileKey($payload['template_file_key'])
            // preview_url 暂不从项目工作区 manifest 写入
            ->setProjectId($payload['project_id'])
            ->setProjectDirectoryId($payload['project_directory_id']);

        $saved = $this->slidesTemplateDomainService->saveUserTemplate(
            $dataIsolation,
            $entity,
            null,
            $payload['tag_codes'],
        );
        $this->resolveAssetUrls([$saved], false);
        $this->slidesTemplateTagDomainService->fillTemplateTags($dataIsolation, [$saved]);
        return $saved;
    }

    /** @return array{page: Page, list: SlidesTemplateEntity[], favorite_codes: array<string, bool>} */
    public function favorites(Authenticatable|BaseDataIsolation $authorization, QueryFavoriteSlidesTemplateRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        $query = $this->createPublicQuery($request);
        $query->setScope(SlidesTemplateQueryScope::All);
        $page = $this->createListPage($request->getPage(), $request->getPageSize());
        $page->setTotal(false);
        $result = $this->slidesTemplateDomainService->queriesFavorites($dataIsolation, $query, $page);
        $this->resolveListImageUrls($result['list']);
        $this->slidesTemplateTagDomainService->fillTemplateTags($dataIsolation, $result['list']);
        return ['page' => $page, 'list' => $result['list'], 'favorite_codes' => $this->codes($result['list'])];
    }

    /** @return array{page: Page, list: SlidesTemplateEntity[], favorite_codes: array<string, bool>, latest_used_at_by_code: array<string, null|string>} */
    public function used(Authenticatable|BaseDataIsolation $authorization, QueryUsedSlidesTemplateRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        $page = $this->createListPage($request->getPage(), $request->getPageSize());
        $page->setTotal(false);
        $usage = $this->resourceAccessLogDomainService->queriesRecentlyUsedResources(
            $dataIsolation->getCurrentOrganizationCode(),
            $dataIsolation->getCurrentUserId(),
            'slides_template',
            'use',
            $page,
            false
        );
        $codes = array_column($usage['list'], 'resource_code');
        $templates = $this->slidesTemplateDomainService->findByCodes($dataIsolation, $codes);
        $templatesByCode = [];
        foreach ($templates as $template) {
            $templatesByCode[$template->getCode()] = $template;
        }
        $list = [];
        $latestUsedAtByCode = [];
        foreach ($usage['list'] as $usageItem) {
            $template = $templatesByCode[$usageItem['resource_code']] ?? null;
            if ($template instanceof SlidesTemplateEntity) {
                $list[] = $template;
                $latestUsedAtByCode[$template->getCode()] = $usageItem['latest_used_at'];
            }
        }
        $this->resolveListImageUrls($list);
        $this->slidesTemplateTagDomainService->fillTemplateTags($dataIsolation, $list);
        return [
            'page' => $page,
            'list' => $list,
            'favorite_codes' => $this->getFavoriteCodes($dataIsolation, new SlidesTemplateQuery()),
            'latest_used_at_by_code' => $latestUsedAtByCode,
        ];
    }

    public function availability(Authenticatable|BaseDataIsolation $authorization, string $code): SlidesTemplateCodeAvailability
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        return $this->slidesTemplateDomainService->getCodeAvailabilityForUser($dataIsolation, $code);
    }

    public function favorite(Authenticatable|BaseDataIsolation $authorization, string $code): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        $template = $this->slidesTemplateDomainService->findByCodeOrFail($dataIsolation, $code);
        $this->slidesTemplateDomainService->assertUserAccessible($dataIsolation, $template);
        $this->slidesTemplateFavoriteDomainService->favorite($dataIsolation, $code);
    }

    public function unfavorite(Authenticatable|BaseDataIsolation $authorization, string $code): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->slidesTemplateFavoriteDomainService->unfavorite($dataIsolation, $code);
    }

    private function createPublicQuery(PublicQuerySlidesTemplateRequest $request): SlidesTemplateQuery
    {
        $query = new SlidesTemplateQuery();
        $query->setScope($request->getScope());
        $query->setKeyword($request->getKeyword());
        $query->setCode($request->getCode());
        $query->setCategoryCode($request->getCategoryCode());
        $query->setTagCodes($request->getTagCodes());
        $query->setTagMatch(SlidesTemplateTagMatch::tryFrom($request->getTagMatch()) ?? SlidesTemplateTagMatch::Any);
        if ($query->getScope() === SlidesTemplateQueryScope::Official) {
            $query->setStatus(SlidesTemplateStatus::Enabled->value);
        }
        return $query;
    }

    private function getFavoriteCodes(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query): array
    {
        $page = Page::createNoPage();
        $result = $this->slidesTemplateDomainService->queriesFavorites($dataIsolation, clone $query, $page);
        return $this->codes($result['list']);
    }

    private function codes(array $templates): array
    {
        $codes = [];
        foreach ($templates as $template) {
            if ($template instanceof SlidesTemplateEntity) {
                $codes[$template->getCode()] = true;
            }
        }
        return $codes;
    }

    private function assertOfficialCategory(SlidesTemplateDataIsolation $dataIsolation, ?string $code): void
    {
        if ($code === null) {
            return;
        }
        $category = $this->slidesTemplateCategoryDomainService->findByCodeOrFail($dataIsolation, $code);
        if (! in_array($category->getOrganizationCode(), $dataIsolation->getOfficialOrganizationCodes(), true)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::CATEGORY_NOT_OFFICIAL);
        }
    }

    private function assertOfficialTags(SlidesTemplateDataIsolation $dataIsolation, array $codes): void
    {
        if ($codes === []) {
            return;
        }
        $tags = $this->slidesTemplateTagDomainService->findEnabledByCodesOrFail($dataIsolation, $codes);
        foreach ($tags as $tag) {
            if (! in_array($tag->getOrganizationCode(), $dataIsolation->getOfficialOrganizationCodes(), true)) {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_NOT_OFFICIAL);
            }
        }
    }

    private function assertTemplateFileIsArchive(string $fileKey): void
    {
        if (! in_array(strtolower(pathinfo($fileKey, PATHINFO_EXTENSION)), self::ARCHIVE_EXTENSIONS, true)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::VALIDATE_FAILED, 'slides_template.template_file_must_be_archive');
        }
    }

    private function assertPrivateFileExists(string $organizationCode, string $fileKey): void
    {
        $links = $this->getPrivateFileLinks($organizationCode, [$fileKey]);
        if (! (($links[$fileKey] ?? null) instanceof FileLink) || trim($links[$fileKey]->getUrl()) === '') {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TEMPLATE_FILE_ACCESS_DENIED);
        }
    }

    private function assertPublicFilesExist(string $organizationCode, array $fileKeys): void
    {
        $fileKeys = array_values(array_unique(array_filter(
            $fileKeys,
            static fn (?string $fileKey): bool => $fileKey !== null && $fileKey !== ''
        )));
        $links = $this->getPublicFileLinks($organizationCode, $fileKeys);
        foreach ($fileKeys as $fileKey) {
            $fileLink = $links[$fileKey] ?? null;
            if (! $fileLink instanceof FileLink || trim($fileLink->getUrl()) === '') {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::VALIDATE_FAILED, 'slides_template.thumbnail_file_url_generate_failed');
            }
        }
    }
}
