<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Application\SlidesTemplate;

use App\Application\SlidesTemplate\Service\AdminSlidesTemplateAppService;
use App\Application\SlidesTemplate\Service\SlidesTemplateAppService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateSourceType;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Domain\SlidesTemplate\Service\SlidesTemplateDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Core\ValueObject\Page;
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
        $request = $this->createMock(PublicQuerySlidesTemplateRequest::class);
        $request->method('getKeyword')->willReturn(null);
        $request->method('getPage')->willReturn(1);
        $request->method('getPageSize')->willReturn(20);

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('queries')
            ->with(
                $this->callback(static fn (SlidesTemplateDataIsolation $actual): bool => $actual->isContainOfficialOrganization()
                    && $actual->getOrganizationCodes() === ['CURRENT_ORG', 'OFFICIAL_ORG']),
                $this->callback(static fn (SlidesTemplateQuery $query): bool => $query->getStatus() === SlidesTemplateStatus::Enabled->value),
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

        $service = new TestableSlidesTemplateAppService($domainService);
        $result = $service->getTemplateFileUrl($dataIsolation, 'PPT-65f2c8a42d7b0-123456');

        $this->assertSame($template, $result);
        $this->assertSame('https://signed.example/OFFICIAL_ORG/slides/templates/business.zip', $result->getTemplateFileUrl());
        $this->assertSame([
            ['OFFICIAL_ORG', ['slides/templates/business.zip']],
        ], $service->fileLinkCalls);
    }

    public function testAdminDeleteRejectsNonOfficialOrganization(): void
    {
        $dataIsolation = $this->makeDataIsolation('CURRENT_ORG', ['OFFICIAL_ORG']);

        $domainService = $this->createMock(SlidesTemplateDomainService::class);
        $domainService->expects($this->never())->method('delete');

        $service = new AdminSlidesTemplateAppService($domainService);

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

        $service = new AdminSlidesTemplateAppService($domainService);
        $result = $service->create($dataIsolation, $request);

        $this->assertSame($capturedTemplate, $result);
        $this->assertMatchesRegularExpression('/^PPT-[0-9a-f]+-[0-9]+$/', $result->getCode());
        $this->assertSame('OFFICIAL_ORG', $result->getOrganizationCode());
        $this->assertSame('user-1', $result->getCreatedUid());
        $this->assertSame('user-1', $result->getUpdatedUid());
        $this->assertSame(100, $result->getSort());
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

        $service = new AdminSlidesTemplateAppService($domainService);
        $result = $service->create($dataIsolation, $request);

        $this->assertSame('PPT-business-minimal', $result->getCode());
        $this->assertSame(SlidesTemplateSourceType::Custom, $result->getSourceType());
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

        $existing = new SlidesTemplateEntity();
        $existing->setId(123)
            ->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-65f2c8a42d7b0-12345678')
            ->setSourceType(SlidesTemplateSourceType::System)
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

        $service = new AdminSlidesTemplateAppService($domainService);
        $result = $service->update($dataIsolation, 123, $request);

        $this->assertSame($capturedTemplate, $result);
        $this->assertSame(SlidesTemplateSourceType::System, $result->getSourceType());
        $this->assertSame('system', $result->getCreatedUid());
        $this->assertSame('user-1', $result->getUpdatedUid());
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
}

class TestableSlidesTemplateAppService extends SlidesTemplateAppService
{
    public array $fileLinkCalls = [];

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
}
