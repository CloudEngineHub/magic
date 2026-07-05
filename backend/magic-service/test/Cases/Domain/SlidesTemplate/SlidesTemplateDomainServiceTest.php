<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Domain\SlidesTemplate;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateSourceType;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateRepositoryInterface;
use App\Domain\SlidesTemplate\Service\SlidesTemplateDomainService;
use App\Infrastructure\Core\ValueObject\Page;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
class SlidesTemplateDomainServiceTest extends TestCase
{
    public function testCreateBuildsSearchTextBeforeSaving(): void
    {
        $repository = new CapturingSlidesTemplateRepository();
        $service = new SlidesTemplateDomainService($repository);

        $template = $this->makeTemplate();
        $service->create($this->makeDataIsolation(), $template);

        $this->assertSame(
            'ppt-business-minimal system 职场白皮书 corporate whitepaper 适用于企业汇报 for business reviews',
            $repository->savedEntity?->toArray()['search_text'] ?? null
        );
    }

    public function testUpdateRebuildsSearchTextBeforeSaving(): void
    {
        $repository = new CapturingSlidesTemplateRepository();
        $repository->entityToFind = $this->makeTemplate()->setId(123);
        $service = new SlidesTemplateDomainService($repository);

        $template = $this->makeTemplate()
            ->setId(123)
            ->setLabel([
                'zh_CN' => '季度总结',
                'en_US' => 'Quarterly Review',
            ]);

        $service->update($this->makeDataIsolation(), $template);

        $this->assertSame(
            'ppt-business-minimal system 季度总结 quarterly review 适用于企业汇报 for business reviews',
            $repository->savedEntity?->toArray()['search_text'] ?? null
        );
    }

    private function makeTemplate(): SlidesTemplateEntity
    {
        $template = new SlidesTemplateEntity();
        $template->setCode('PPT-BUSINESS-MINIMAL')
            ->setSourceType(SlidesTemplateSourceType::System)
            ->setLabel([
                'zh_CN' => '职场白皮书',
                'en_US' => 'Corporate Whitepaper',
            ])
            ->setDescription([
                'zh_CN' => '适用于企业汇报',
                'en_US' => 'For business reviews',
            ]);

        return $template;
    }

    private function makeDataIsolation(): SlidesTemplateDataIsolation
    {
        /** @var SlidesTemplateDataIsolation $dataIsolation */
        $dataIsolation = (new ReflectionClass(SlidesTemplateDataIsolation::class))->newInstanceWithoutConstructor();
        $dataIsolation->setCurrentOrganizationCode('OFFICIAL_ORG');
        $dataIsolation->setCurrentUserId('user-1');
        $dataIsolation->setMagicId('magic-1');
        $dataIsolation->setEnabled(true);
        return $dataIsolation;
    }
}

class CapturingSlidesTemplateRepository implements SlidesTemplateRepositoryInterface
{
    public ?SlidesTemplateEntity $savedEntity = null;

    public ?SlidesTemplateEntity $entityToFind = null;

    public function findById(SlidesTemplateDataIsolation $dataIsolation, int|string $id): ?SlidesTemplateEntity
    {
        return $this->entityToFind;
    }

    public function findByCode(SlidesTemplateDataIsolation $dataIsolation, string $code): ?SlidesTemplateEntity
    {
        return $this->entityToFind;
    }

    public function queries(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query, Page $page): array
    {
        return ['total' => 0, 'list' => []];
    }

    public function save(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): SlidesTemplateEntity
    {
        $this->savedEntity = $entity;
        return $entity;
    }

    public function updateStatus(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $status, string $updatedUid): bool
    {
        return true;
    }

    public function updateSort(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $sort, string $updatedUid): bool
    {
        return true;
    }

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): bool
    {
        return true;
    }
}
