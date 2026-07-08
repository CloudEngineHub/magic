<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Application\SlidesTemplate;

use App\Application\SlidesTemplate\Service\AdminSlidesTemplateAppService;
use App\Application\SlidesTemplate\Service\SlidesTemplateAppService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateSourceType;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Domain\SlidesTemplate\Event\SlidesTemplateUsedEvent;
use App\Domain\SlidesTemplate\Service\SlidesTemplateCategoryDomainService;
use App\Domain\SlidesTemplate\Service\SlidesTemplateDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\SlidesTemplate\DTO\Request\AdminQuerySlidesTemplateRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\SaveSlidesTemplateRequest;
use Dtyq\CloudFile\Kernel\Struct\FileLink;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\TranslatorInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use ReflectionClass;
use RuntimeException;

/**
 * @internal
 */
class SlidesTemplateAppServiceTest extends TestCase
{
    private static bool $hadOriginalContainer = false;

    private static ?ContainerInterface $originalContainer = null;

    public static function setUpBeforeClass(): void
    {
        self::$hadOriginalContainer = ApplicationContext::hasContainer();
        self::$originalContainer = self::$hadOriginalContainer ? ApplicationContext::getContainer() : null;

        ApplicationContext::setContainer(new class implements ContainerInterface {
            public function get(string $id)
            {
                return match ($id) {
                    ConfigInterface::class => new class implements ConfigInterface {
                        public function get(string $key, mixed $default = null): mixed
                        {
                            return match ($key) {
                                'error_message' => [
                                    'exception_class' => BusinessException::class,
                                    'error_code_mapper' => [
                                        SlidesTemplateErrorCode::class => [47000, 47999],
                                    ],
                                ],
                                default => $default,
                            };
                        }

                        public function has(string $keys): bool
                        {
                            return $keys === 'error_message';
                        }

                        public function set(string $key, mixed $value): void
                        {
                        }
                    },
                    TranslatorInterface::class => new class implements TranslatorInterface {
                        public function trans(string $key, array $replace = [], ?string $locale = null): string
                        {
                            return $key;
                        }

                        public function transChoice(string $key, $number, array $replace = [], ?string $locale = null): string
                        {
                            return $key;
                        }

                        public function getLocale(): string
                        {
                            return 'zh_CN';
                        }

                        public function setLocale(string $locale)
                        {
                            return $this;
                        }
                    },
                    default => throw new RuntimeException('Unexpected container dependency: ' . $id),
                };
            }

            public function has(string $id): bool
            {
                return in_array($id, [ConfigInterface::class, TranslatorInterface::class], true);
            }
        });
    }

    public static function tearDownAfterClass(): void
    {
        $property = (new ReflectionClass(ApplicationContext::class))->getProperty('container');
        $property->setAccessible(true);
        $property->setValue(null, self::$hadOriginalContainer ? self::$originalContainer : null);

        self::$hadOriginalContainer = false;
        self::$originalContainer = null;
    }

    public function testQueriesUseCurrentAndOfficialEnabledTemplates(): void
    {
        $dataIsolation = $this->makeDataIsolation('CURRENT_ORG', ['OFFICIAL_ORG']);
        $request = new TestPublicQuerySlidesTemplateRequest(categoryCode: 'PPT-CATE-business');

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('queries')
            ->with(
                $this->callback(static fn (SlidesTemplateDataIsolation $actual): bool => $actual->isContainOfficialOrganization()
                    && $actual->getOrganizationCodes() === ['CURRENT_ORG', 'OFFICIAL_ORG']),
                $this->callback(static fn (SlidesTemplateQuery $query): bool => $query->getStatus() === SlidesTemplateStatus::Enabled->value
                    && $query->getCategoryCode() === 'PPT-CATE-business'),
                $this->callback(static fn (Page $page): bool => $page->getPage() === 1 && $page->getPageNum() === 20)
            )
            ->willReturn(['total' => 0, 'list' => []]);

        $service = new TestableSlidesTemplateAppService($domainService);
        $result = $service->queries($dataIsolation, $request);

        $this->assertSame(0, $result['total']);
        $this->assertSame([], $result['list']);
        $this->assertInstanceOf(Page::class, $result['page']);
        $this->assertSame(1, $result['page']->getPage());
        $this->assertSame(20, $result['page']->getPageNum());
        $this->assertSame([], $service->fileLinkCalls);
    }

    public function testGetTemplateFileUrlUsesTemplateOrganizationCode(): void
    {
        $dataIsolation = $this->makeDataIsolation('CURRENT_ORG', ['OFFICIAL_ORG']);
        $template = new SlidesTemplateEntity();
        $template->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-65f2c8a42d7b0-123456')
            ->setLabel(['zh_CN' => '职场白皮书', 'en_US' => 'Corporate Whitepaper'])
            ->setTemplateFileKey('slides/templates/business.zip')
            ->setThumbnailFileKey('slides/thumbnails/business.png');

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('findEnabledByCodeOrFail')
            ->with(
                $this->callback(static fn (SlidesTemplateDataIsolation $actual): bool => $actual->isContainOfficialOrganization()
                    && $actual->getOrganizationCodes() === ['CURRENT_ORG', 'OFFICIAL_ORG']),
                'PPT-65f2c8a42d7b0-123456'
            )
            ->willReturn($template);
        $domainService
            ->expects($this->once())
            ->method('incrementActualUsageCount')
            ->with(
                $this->callback(static fn (SlidesTemplateDataIsolation $actual): bool => $actual->isContainOfficialOrganization()
                    && $actual->getOrganizationCodes() === ['CURRENT_ORG', 'OFFICIAL_ORG']),
                'PPT-65f2c8a42d7b0-123456'
            );

        $service = new TestableSlidesTemplateAppService($domainService);
        $result = $service->getTemplateFileUrl($dataIsolation, 'PPT-65f2c8a42d7b0-123456');

        $this->assertSame($template, $result);
        $this->assertSame('https://signed.example/OFFICIAL_ORG/slides/templates/business.zip', $result->getTemplateFileUrl());
        $this->assertSame([
            ['OFFICIAL_ORG', ['slides/templates/business.zip']],
        ], $service->fileLinkCalls);
    }

    public function testQueriesResolveImageAssetsFromPublicBucket(): void
    {
        $dataIsolation = $this->makeDataIsolation('CURRENT_ORG', ['OFFICIAL_ORG']);
        $request = new TestPublicQuerySlidesTemplateRequest();

        $template = new SlidesTemplateEntity();
        $template->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-65f2c8a42d7b0-123456')
            ->setThumbnailFileKey('slides/thumbnails/business.png')
            ->setCollageFileKey('slides/collages/business.png')
            ->setPreviewImageFileKeys([
                'slides/previews/business-1.png',
                'slides/previews/business-2.png',
            ])
            ->setTemplateFileKey('slides/templates/business.zip');

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('queries')
            ->willReturn(['total' => 1, 'list' => [$template]]);

        $service = new TestableSlidesTemplateAppService($domainService);
        $result = $service->queries($dataIsolation, $request);

        $this->assertSame([$template], $result['list']);
        $this->assertSame('https://public.example/OFFICIAL_ORG/slides/thumbnails/business.png', $template->getThumbnailUrl());
        $this->assertSame('https://public.example/OFFICIAL_ORG/slides/collages/business.png', $template->getCollageUrl());
        $this->assertSame([
            'https://public.example/OFFICIAL_ORG/slides/previews/business-1.png',
            'https://public.example/OFFICIAL_ORG/slides/previews/business-2.png',
        ], $template->getPreviewImageUrls());
        $this->assertSame([
            ['OFFICIAL_ORG', [
                'slides/thumbnails/business.png',
                'slides/collages/business.png',
                'slides/previews/business-1.png',
                'slides/previews/business-2.png',
            ]],
        ], $service->publicFileLinkCalls);
        $this->assertSame([], $service->fileLinkCalls);
    }

    public function testGetTemplateFileUrlDispatchesTemplateUsedEventAfterUrlResolved(): void
    {
        $dataIsolation = $this->makeDataIsolation('CURRENT_ORG', ['OFFICIAL_ORG']);
        $template = new SlidesTemplateEntity();
        $template->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-65f2c8a42d7b0-123456')
            ->setLabel(['zh_CN' => '职场白皮书', 'en_US' => 'Corporate Whitepaper'])
            ->setTemplateFileKey('slides/templates/business.zip')
            ->setThumbnailFileKey('slides/thumbnails/business.png');

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('findEnabledByCodeOrFail')
            ->willReturn($template);

        $accessContext = [
            'topic_id' => 'topic-1',
            'project_id' => 'project-1',
            'task_id' => 'task-1',
        ];

        $service = new TestableSlidesTemplateAppService($domainService);
        $result = $service->getTemplateFileUrl($dataIsolation, 'PPT-65f2c8a42d7b0-123456', $accessContext);

        $this->assertSame($template, $result);
        $this->assertCount(1, $service->dispatchedEvents);
        $event = $service->dispatchedEvents[0];
        $this->assertInstanceOf(SlidesTemplateUsedEvent::class, $event);
        $this->assertSame($template, $event->getTemplate());
        $this->assertSame($accessContext, $event->getAccessContext());
        $this->assertSame('CURRENT_ORG', $event->getOrganizationCode());
        $this->assertSame('user-1', $event->getUserId());
        $this->assertSame('user-1', $event->getUserName());
    }

    public function testAdminDeleteRejectsNonOfficialOrganization(): void
    {
        $dataIsolation = $this->makeDataIsolation('CURRENT_ORG', ['OFFICIAL_ORG']);

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService->expects($this->never())->method('delete');

        $service = $this->makeAdminSlidesTemplateAppService($domainService);

        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(SlidesTemplateErrorCode::ONLY_OFFICIAL_ORGANIZATION_CAN_MANAGE->value);

        $service->delete($dataIsolation, 123);
    }

    public function testAdminCreateGeneratesCodeBeforeSaving(): void
    {
        $dataIsolation = $this->makeDataIsolation('OFFICIAL_ORG', ['OFFICIAL_ORG']);
        $request = $this->createMock(SaveSlidesTemplateRequest::class);
        $request->method('getLabel')->willReturn([
            'zh_CN' => '职场白皮书',
            'en_US' => 'Corporate Whitepaper',
        ]);
        $request->method('getDescription')->willReturn([
            'zh_CN' => '适用于企业汇报。',
            'en_US' => 'For business reviews.',
        ]);
        $request->method('getThumbnailFileKey')->willReturn('');
        $request->method('getCollageFileKey')->willReturn(null);
        $request->method('getTemplateFileKey')->willReturn('');
        $request->method('getPreviewUrl')->willReturn(null);
        $request->method('getStatus')->willReturn(SlidesTemplateStatus::Enabled->value);
        $request->method('getSort')->willReturn(100);
        $request->method('getBaseUsageCount')->willReturn(88);

        $capturedTemplate = null;
        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('create')
            ->with(
                $this->callback(static fn (SlidesTemplateDataIsolation $actual): bool => $actual->getCurrentOrganizationCode() === 'OFFICIAL_ORG'),
                $this->isInstanceOf(SlidesTemplateEntity::class)
            )
            ->willReturnCallback(static function (SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity) use (&$capturedTemplate): SlidesTemplateEntity {
                $capturedTemplate = $entity;
                return $entity->setId(123);
            });

        $service = $this->makeAdminSlidesTemplateAppService($domainService);
        $result = $service->create($dataIsolation, $request);

        $this->assertSame($capturedTemplate, $result);
        $this->assertMatchesRegularExpression('/^PPT-[0-9a-f]+-[0-9]+$/', $result->getCode());
        $this->assertSame('OFFICIAL_ORG', $result->getOrganizationCode());
        $this->assertSame('user-1', $result->getCreatedUid());
        $this->assertSame('user-1', $result->getUpdatedUid());
        $this->assertSame(100, $result->getSort());
        $this->assertSame(88, $result->getBaseUsageCount());
        $this->assertSame(0, $result->getActualUsageCount());
        $this->assertSame(SlidesTemplateSourceType::Custom, $result->getSourceType());
    }

    public function testAdminCreateUsesCustomCodeBeforeSaving(): void
    {
        $dataIsolation = $this->makeDataIsolation('OFFICIAL_ORG', ['OFFICIAL_ORG']);
        $request = $this->createMock(SaveSlidesTemplateRequest::class);
        $request->method('getCode')->willReturn('PPT-business-minimal');
        $request->method('getLabel')->willReturn([
            'zh_CN' => '职场白皮书',
            'en_US' => 'Corporate Whitepaper',
        ]);
        $request->method('getDescription')->willReturn([
            'zh_CN' => '适用于企业汇报。',
            'en_US' => 'For business reviews.',
        ]);
        $request->method('getThumbnailFileKey')->willReturn('');
        $request->method('getCollageFileKey')->willReturn(null);
        $request->method('getTemplateFileKey')->willReturn('');
        $request->method('getPreviewUrl')->willReturn(null);
        $request->method('getStatus')->willReturn(SlidesTemplateStatus::Enabled->value);
        $request->method('getSort')->willReturn(100);

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('create')
            ->with(
                $this->callback(static fn (SlidesTemplateDataIsolation $actual): bool => $actual->getCurrentOrganizationCode() === 'OFFICIAL_ORG'),
                $this->callback(static fn (SlidesTemplateEntity $entity): bool => $entity->getCode() === 'PPT-business-minimal')
            )
            ->willReturnCallback(static fn (SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): SlidesTemplateEntity => $entity->setId(123));

        $service = $this->makeAdminSlidesTemplateAppService($domainService);
        $result = $service->create($dataIsolation, $request);

        $this->assertSame('PPT-business-minimal', $result->getCode());
        $this->assertSame(SlidesTemplateSourceType::Custom, $result->getSourceType());
    }

    public function testAdminCreateStoresCategoryCodeAfterValidatingCategory(): void
    {
        $dataIsolation = $this->makeDataIsolation('OFFICIAL_ORG', ['OFFICIAL_ORG']);
        $request = $this->createMock(SaveSlidesTemplateRequest::class);
        $request->method('getCategoryCode')->willReturn('PPT-CATE-business');
        $request->method('getLabel')->willReturn([
            'zh_CN' => '职场白皮书',
            'en_US' => 'Corporate Whitepaper',
        ]);
        $request->method('getDescription')->willReturn([
            'zh_CN' => '适用于企业汇报。',
            'en_US' => 'For business reviews.',
        ]);
        $request->method('getThumbnailFileKey')->willReturn('');
        $request->method('getCollageFileKey')->willReturn(null);
        $request->method('getTemplateFileKey')->willReturn('');
        $request->method('getPreviewUrl')->willReturn(null);
        $request->method('getStatus')->willReturn(SlidesTemplateStatus::Enabled->value);
        $request->method('getSort')->willReturn(100);

        $category = new SlidesTemplateCategoryEntity();
        $category->setCode('PPT-CATE-business');

        $categoryDomainService = $this->createMock(SlidesTemplateCategoryDomainService::class);
        $categoryDomainService
            ->expects($this->once())
            ->method('findByCodeOrFail')
            ->with(
                $this->callback(static fn (SlidesTemplateDataIsolation $actual): bool => $actual->getCurrentOrganizationCode() === 'OFFICIAL_ORG'),
                'PPT-CATE-business'
            )
            ->willReturn($category);

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('create')
            ->with(
                $this->isInstanceOf(SlidesTemplateDataIsolation::class),
                $this->callback(static fn (SlidesTemplateEntity $entity): bool => $entity->getCategoryCode() === 'PPT-CATE-business')
            )
            ->willReturnCallback(static fn (SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): SlidesTemplateEntity => $entity->setId(123));

        $service = $this->makeAdminSlidesTemplateAppService($domainService, $categoryDomainService);
        $result = $service->create($dataIsolation, $request);

        $this->assertSame('PPT-CATE-business', $result->getCategoryCode());
    }

    public function testAdminQueriesResolveCategoriesForCurrentPage(): void
    {
        $dataIsolation = $this->makeDataIsolation('OFFICIAL_ORG', ['OFFICIAL_ORG']);
        $request = new TestAdminQuerySlidesTemplateRequest();

        $template = new SlidesTemplateEntity();
        $template->setId(123)
            ->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-65f2c8a42d7b0-12345678')
            ->setCategoryCode('PPT-CATE-business')
            ->setThumbnailFileKey('');

        $uncategorizedTemplate = new SlidesTemplateEntity();
        $uncategorizedTemplate->setId(124)
            ->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-65f2c8a42d7b0-87654321')
            ->setThumbnailFileKey('');

        $category = new SlidesTemplateCategoryEntity();
        $category->setId(456)
            ->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-CATE-business')
            ->setNameI18n(['zh_CN' => '商务', 'en_US' => 'Business']);

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('queries')
            ->with(
                $this->callback(static fn (SlidesTemplateDataIsolation $actual): bool => $actual->getCurrentOrganizationCode() === 'OFFICIAL_ORG'),
                $this->isInstanceOf(SlidesTemplateQuery::class),
                $this->callback(static fn (Page $page): bool => $page->getPage() === 1 && $page->getPageNum() === 20)
            )
            ->willReturn(['total' => 2, 'list' => [$template, $uncategorizedTemplate]]);

        $categoryDomainService = new TestSlidesTemplateCategoryDomainService([
            'PPT-CATE-business' => $category,
        ]);

        $service = $this->makeAdminSlidesTemplateAppService($domainService, $categoryDomainService);
        $result = $service->queries($dataIsolation, $request);

        $this->assertSame([$template, $uncategorizedTemplate], $result['list']);
        $this->assertSame(['PPT-CATE-business' => $category], $result['categories']);
        $this->assertCount(1, $categoryDomainService->findByCodesCalls);
        $this->assertSame(['PPT-CATE-business'], $categoryDomainService->findByCodesCalls[0]['codes']);
    }

    public function testAdminUpdateKeepsExistingSourceType(): void
    {
        $dataIsolation = $this->makeDataIsolation('OFFICIAL_ORG', ['OFFICIAL_ORG']);
        $request = $this->createMock(SaveSlidesTemplateRequest::class);
        $request->method('getLabel')->willReturn([
            'zh_CN' => '职场白皮书',
            'en_US' => 'Corporate Whitepaper',
        ]);
        $request->method('getDescription')->willReturn([
            'zh_CN' => '适用于企业汇报。',
            'en_US' => 'For business reviews.',
        ]);
        $request->method('getThumbnailFileKey')->willReturn('');
        $request->method('getCollageFileKey')->willReturn(null);
        $request->method('getTemplateFileKey')->willReturn('');
        $request->method('getPreviewUrl')->willReturn(null);
        $request->method('getStatus')->willReturn(SlidesTemplateStatus::Enabled->value);
        $request->method('getSort')->willReturn(100);
        $request->method('getBaseUsageCount')->willReturn(66);

        $existing = new SlidesTemplateEntity();
        $existing->setId(123)
            ->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-65f2c8a42d7b0-12345678')
            ->setSourceType(SlidesTemplateSourceType::System)
            ->setActualUsageCount(9)
            ->setCreatedUid('system');

        $capturedTemplate = null;
        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('findByIdOrFail')
            ->with($this->isInstanceOf(SlidesTemplateDataIsolation::class), 123)
            ->willReturn($existing);
        $domainService
            ->expects($this->once())
            ->method('update')
            ->willReturnCallback(static function (SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity) use (&$capturedTemplate): SlidesTemplateEntity {
                $capturedTemplate = $entity;
                return $entity;
            });

        $service = $this->makeAdminSlidesTemplateAppService($domainService);
        $result = $service->update($dataIsolation, 123, $request);

        $this->assertSame($capturedTemplate, $result);
        $this->assertSame(SlidesTemplateSourceType::System, $result->getSourceType());
        $this->assertSame('system', $result->getCreatedUid());
        $this->assertSame('user-1', $result->getUpdatedUid());
        $this->assertSame(66, $result->getBaseUsageCount());
        $this->assertSame(9, $result->getActualUsageCount());
    }

    private function makeDataIsolation(string $organizationCode, array $officialOrganizationCodes): SlidesTemplateDataIsolation
    {
        /** @var SlidesTemplateDataIsolation $dataIsolation */
        $dataIsolation = (new ReflectionClass(SlidesTemplateDataIsolation::class))->newInstanceWithoutConstructor();
        $dataIsolation->setCurrentOrganizationCode($organizationCode);
        $dataIsolation->setCurrentUserId('user-1');
        $dataIsolation->setMagicId('magic-1');
        $dataIsolation->setEnabled(true);
        $dataIsolation->setContainOfficialOrganization(false);
        $dataIsolation->setOnlyOfficialOrganization(false);
        $dataIsolation->setOfficialOrganizationCodes($officialOrganizationCodes);
        return $dataIsolation;
    }

    private function makeAdminSlidesTemplateAppService(
        SlidesTemplateDomainService $domainService,
        ?SlidesTemplateCategoryDomainService $categoryDomainService = null,
    ): AdminSlidesTemplateAppService {
        if ($categoryDomainService === null) {
            $categoryDomainService = $this->createMock(SlidesTemplateCategoryDomainService::class);
            $categoryDomainService->expects($this->never())->method('findByCodeOrFail');
        }

        return new AdminSlidesTemplateAppService($domainService, $categoryDomainService);
    }
}

class TestableSlidesTemplateAppService extends SlidesTemplateAppService
{
    public array $fileLinkCalls = [];

    public array $publicFileLinkCalls = [];

    public array $dispatchedEvents = [];

    public function getPrivateFileLinks(string $organizationCode, array $fileLinks): array
    {
        $this->fileLinkCalls[] = [$organizationCode, $fileLinks];

        $result = [];
        foreach ($fileLinks as $fileLink) {
            $result[$fileLink] = new FileLink(
                $fileLink,
                'https://signed.example/' . $organizationCode . '/' . $fileLink,
                time() + 3600
            );
        }
        return $result;
    }

    public function getPublicFileLinks(string $organizationCode, array $fileLinks): array
    {
        $this->publicFileLinkCalls[] = [$organizationCode, $fileLinks];

        $result = [];
        foreach ($fileLinks as $fileLink) {
            $result[$fileLink] = new FileLink(
                $fileLink,
                'https://public.example/' . $organizationCode . '/' . $fileLink,
                time() + 3600
            );
        }
        return $result;
    }

    protected function dispatchSlidesTemplateUsedEvent(SlidesTemplateUsedEvent $event): void
    {
        $this->dispatchedEvents[] = $event;
    }
}

class TestPublicQuerySlidesTemplateRequest extends PublicQuerySlidesTemplateRequest
{
    public function __construct(
        private readonly ?string $categoryCode = null,
        private readonly ?string $keyword = null,
        private readonly int $page = 1,
        private readonly int $pageSize = 20,
    ) {
    }

    public function getKeyword(): ?string
    {
        return $this->keyword;
    }

    public function getCategoryCode(): ?string
    {
        return $this->categoryCode;
    }

    public function getPage(): int
    {
        return $this->page;
    }

    public function getPageSize(): int
    {
        return $this->pageSize;
    }
}

class TestAdminQuerySlidesTemplateRequest extends AdminQuerySlidesTemplateRequest
{
    public function __construct()
    {
    }

    public function getPage(): int
    {
        return 1;
    }

    public function getPageSize(): int
    {
        return 20;
    }

    public function getKeyword(): ?string
    {
        return null;
    }

    public function getCode(): ?string
    {
        return null;
    }

    public function getCategoryCode(): ?string
    {
        return null;
    }

    public function getStatus(): ?int
    {
        return null;
    }
}

class TestSlidesTemplateCategoryDomainService extends SlidesTemplateCategoryDomainService
{
    public array $findByCodesCalls = [];

    /**
     * @param array<string, SlidesTemplateCategoryEntity> $categoriesByCode
     */
    public function __construct(
        private readonly array $categoriesByCode,
    ) {
    }

    /**
     * @return SlidesTemplateCategoryEntity[]
     */
    public function findByCodes(SlidesTemplateDataIsolation $dataIsolation, array $codes): array
    {
        $this->findByCodesCalls[] = [
            'dataIsolation' => $dataIsolation,
            'codes' => $codes,
        ];

        $categories = [];
        foreach ($codes as $code) {
            if (isset($this->categoriesByCode[$code])) {
                $categories[] = $this->categoriesByCode[$code];
            }
        }
        return $categories;
    }
}
