<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Skill\Service;

use App\Application\SuperMagic\Skill\DTO\SkillPackageDTO;
use App\Application\SuperMagic\Skill\Import\SkillImportService;
use App\Domain\SuperMagic\Skill\Entity\SkillEntity;
use App\Domain\SuperMagic\Skill\Entity\SkillMarketEntity;
use App\Domain\SuperMagic\Skill\Entity\SkillVersionEntity;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\PublisherType;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\PublishStatus;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\PublishTargetType;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\ReviewStatus;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\SkillDataIsolation;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\SkillSourceType;
use App\Domain\SuperMagic\Skill\Service\SkillCategoryDomainService;
use App\Domain\SuperMagic\Skill\Service\SkillCategoryRelationDomainService;
use App\Domain\SuperMagic\Skill\Service\SkillMarketDomainService;
use App\Domain\SuperMagic\Skill\Service\SkillVersionDomainService;
use App\ErrorCode\SkillErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\Context\CoContext;
use App\Infrastructure\Util\Context\RequestContext;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\SuperMagic\Skill\DTO\Request\ImportOfficialSkillRequestDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Response\OfficialSkillImportPreviewDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Response\OfficialSkillImportResultDTO;

final class AdminOfficialSkillAppService extends AbstractSkillAppService
{
    private const IMPORT_TOKEN_PREFIX = 'official_skill_import_token:';

    private const LOCK_PREFIX = 'official_skill_import:';

    public function __construct(
        private readonly SkillImportService $skillImportService,
        private readonly SkillVersionDomainService $officialSkillVersionDomainService,
        private readonly SkillMarketDomainService $officialSkillMarketDomainService,
        private readonly SkillCategoryDomainService $officialSkillCategoryDomainService,
        private readonly SkillCategoryRelationDomainService $officialSkillCategoryRelationDomainService,
    ) {
    }

    public function parseImport(
        RequestContext $requestContext,
        string $fileKey
    ): OfficialSkillImportPreviewDTO {
        $authorization = $this->assertOfficialOrganization($requestContext);
        $organizationCode = $authorization->getOrganizationCode();
        $package = $this->skillImportService->parseByFileKey($organizationCode, $fileKey);
        $market = $this->officialSkillMarketDomainService->findOfficialSkillByPackageName($package->packageName);
        $isUpdate = $market !== null;

        $version = $market === null ? null
            : $this->officialSkillVersionDomainService->findSkillVersionByIdWithoutOrganizationFilter($market->getSkillVersionId());

        $code = $market?->getSkillCode() ?? SkillEntity::generateNewCode();

        $categoryIds = $market === null ? [] : $this->officialSkillCategoryRelationDomainService->getMarketCategoryIds($market->getId() ?? 0);

        $token = $this->skillImportService->generate(self::IMPORT_TOKEN_PREFIX, [
            'organization_code' => $organizationCode,
            'operator_id' => $authorization->getId(),
            'file_key' => $fileKey,
            'package_name' => $package->packageName,
            'skill_code' => $code,
            'package_description' => $package->packageDescription,
        ]);

        return new OfficialSkillImportPreviewDTO(
            importToken: $token,
            code: $code,
            packageName: $package->packageName,
            packageDescription: $package->packageDescription,
            isUpdate: $isUpdate,
            nameI18n: $market?->getNameI18n() ?: $this->buildDefaultNameI18n($package->packageName),
            descriptionI18n: $market?->getDescriptionI18n() ?: $this->buildDefaultDescriptionI18n($package->packageDescription),
            logo: $market?->getLogo() ?? '',
            id: $market === null ? '' : (string) $market->getId(),
            publisherType: $market?->getPublisherType()->value ?? PublisherType::OFFICIAL->value,
            isFeatured: $market?->isFeatured() ?? false,
            isHidden: $market?->isHidden() ?? false,
            sortOrder: $market?->getSortOrder() ?? 0,
            version: $this->resolveImportVersion($market, $version),
            categories: $this->buildCategories($categoryIds),
        );
    }

    public function import(
        RequestContext $requestContext,
        ImportOfficialSkillRequestDTO $requestDTO
    ): OfficialSkillImportResultDTO {
        $authorization = $this->assertOfficialOrganization($requestContext);
        $organizationCode = $authorization->getOrganizationCode();
        $package = $this->resolvePackage($authorization, $requestDTO);

        $lockKey = self::LOCK_PREFIX . $organizationCode . ':' . $package->packageName;
        return $this->skillImportService->execute(
            $lockKey,
            function () use ($organizationCode, $authorization, $package, $requestDTO): OfficialSkillImportResultDTO {
                $market = $this->officialSkillMarketDomainService->findOfficialSkillByPackageName($package->packageName);
                $isUpdate = $market !== null;
                $code = $market?->getSkillCode() ?? $package->skillCode ?? SkillEntity::generateNewCode();
                $version = $this->saveVersion($organizationCode, $authorization, $package, $requestDTO, $market, $code);
                $market = $this->saveMarket($organizationCode, $authorization, $requestDTO, $version, $market, $code);
                $this->officialSkillCategoryRelationDomainService->replaceMarketCategories(
                    $organizationCode,
                    (int) $market->getId(),
                    $requestDTO->getCategoryIdList()
                );

                return new OfficialSkillImportResultDTO(
                    $code,
                    $version->getVersion(),
                    $isUpdate ? 'updated' : 'created',
                    $market->getId(),
                    $version->getId()
                );
            },
            self::IMPORT_TOKEN_PREFIX,
            $requestDTO->getImportToken()
        );
    }

    private function buildDefaultNameI18n(string $packageName): array
    {
        return ['default' => $packageName];
    }

    private function buildDefaultDescriptionI18n(string $packageDescription): array
    {
        return ['default' => $packageDescription];
    }

    private function resolvePackage(MagicUserAuthorization $authorization, ImportOfficialSkillRequestDTO $requestDTO): SkillPackageDTO
    {
        if ($requestDTO->getImportToken() !== '') {
            $tokenData = $this->skillImportService->get(self::IMPORT_TOKEN_PREFIX, $requestDTO->getImportToken());
            if (($tokenData['organization_code'] ?? '') !== $authorization->getOrganizationCode()) {
                ExceptionBuilder::throw(SkillErrorCode::IMPORT_TOKEN_EXPIRED, 'skill.import_token_expired');
            }
            return new SkillPackageDTO(
                (string) $tokenData['file_key'],
                (string) ($tokenData['package_name'] ?? $tokenData['skill_code']),
                (string) ($tokenData['package_description'] ?? ''),
                isset($tokenData['skill_code']) ? (string) $tokenData['skill_code'] : null,
            );
        }

        return $this->skillImportService->parseByFileKey($authorization->getOrganizationCode(), $requestDTO->getFileKey());
    }

    private function saveVersion(
        string $organizationCode,
        MagicUserAuthorization $authorization,
        SkillPackageDTO $package,
        ImportOfficialSkillRequestDTO $requestDTO,
        ?SkillMarketEntity $market,
        string $code
    ): SkillVersionEntity {
        $dataIsolation = SkillDataIsolation::create($organizationCode, $authorization->getId());
        $dataIsolation->disabled();
        $version = $market === null ? new SkillVersionEntity() : $this->officialSkillVersionDomainService->findSkillVersionByIdWithoutOrganizationFilter($market->getSkillVersionId());
        $version ??= new SkillVersionEntity();
        if ($version->getId() !== null) {
            $this->officialSkillVersionDomainService->clearCurrentVersionByCode($dataIsolation, $code);
        }
        $version->setCode($code);
        $version->setOrganizationCode($organizationCode);
        $version->setCreatorId($authorization->getId());
        $version->setPackageName($package->packageName);
        $version->setPackageDescription($package->packageDescription);
        $version->setVersion($requestDTO->getVersion());
        $version->setNameI18n($requestDTO->getNameI18n());
        $version->setDescriptionI18n($requestDTO->getDescriptionI18n());
        $version->setSourceI18n($requestDTO->getSourceI18n());
        $version->setLogo($requestDTO->getLogo() !== '' ? $requestDTO->getLogo() : null);
        $version->setFileKey($package->fileKey);
        $version->setPublishStatus($requestDTO->getPublishStatus());
        $version->setReviewStatus(ReviewStatus::APPROVED);
        $version->setPublishTargetType(PublishTargetType::MARKET);
        $version->setVersionDescriptionI18n($requestDTO->getDescriptionI18n());
        $version->setPublisherUserId($authorization->getId());
        $version->setPublishedAt($requestDTO->getPublishStatus() === PublishStatus::PUBLISHED->value ? date('Y-m-d H:i:s') : null);
        $version->setIsCurrentVersion(true);
        $version->setSourceType(SkillSourceType::OFFICIAL);
        $version->setSourceId(null);
        $version->setSourceMeta(['imported_by' => $authorization->getId()]);
        $version->setProjectId(null);

        return $this->officialSkillVersionDomainService->saveSkillVersion($dataIsolation, $version);
    }

    private function saveMarket(
        string $organizationCode,
        MagicUserAuthorization $authorization,
        ImportOfficialSkillRequestDTO $requestDTO,
        SkillVersionEntity $version,
        ?SkillMarketEntity $market,
        string $code
    ): SkillMarketEntity {
        $market ??= new SkillMarketEntity();
        $market->setOrganizationCode($organizationCode);
        $market->setSkillCode($code);
        $market->setSkillVersionId((int) $version->getId());
        $market->setNameI18n($requestDTO->getNameI18n());
        $market->setDescriptionI18n($requestDTO->getDescriptionI18n());
        $market->setSearchText($version->getSearchText());
        $market->setLogo($requestDTO->getLogo() !== '' ? $requestDTO->getLogo() : null);
        $publisherType = PublisherType::from($requestDTO->getPublisherType());
        $market->setPublisherId($publisherType->isUser() ? $authorization->getId() : OfficialOrganizationUtil::getOfficialOrganizationCode());
        $market->setPublisherType($publisherType);
        $market->setPublishStatus($requestDTO->getPublishStatus());
        $market->setIsHidden($requestDTO->isHidden());
        $market->setIsFeatured($requestDTO->isFeatured());
        $market->setSortOrder($requestDTO->getSortOrder());

        return $this->officialSkillMarketDomainService->saveStoreSkill($market);
    }

    private function resolveImportVersion(?SkillMarketEntity $market, ?SkillVersionEntity $version): string
    {
        return $market === null ? '1.0.0' : ($version?->getVersion() ?? '');
    }

    /** @param array<int, int> $categoryIds @return array<int, array{id: string, name: string}> */
    private function buildCategories(array $categoryIds): array
    {
        if ($categoryIds === []) {
            return [];
        }

        $categories = [];
        foreach ($this->officialSkillCategoryDomainService->findByIds($categoryIds) as $category) {
            $categories[(int) $category->getId()] = [
                'id' => (string) $category->getId(),
                'name' => $category->getI18nName(CoContext::getLanguage()),
            ];
        }

        $result = [];
        foreach ($categoryIds as $categoryId) {
            if (isset($categories[$categoryId])) {
                $result[] = $categories[$categoryId];
            }
        }

        return $result;
    }

    private function assertOfficialOrganization(RequestContext $requestContext): MagicUserAuthorization
    {
        $authorization = $requestContext->getUserAuthorization();
        if (! OfficialOrganizationUtil::isOfficialOrganization($authorization->getOrganizationCode())) {
            ExceptionBuilder::throw(SkillErrorCode::OFFICIAL_ORGANIZATION_REQUIRED, 'skill.official_organization_required');
        }
        return $authorization;
    }
}
