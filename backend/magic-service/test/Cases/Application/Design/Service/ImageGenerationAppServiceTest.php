<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Design\Service;

use App\Application\Design\Service\ImageGenerationAppService;
use App\Application\SuperMagic\Common\Contract\UserAiWatermarkPolicyInterface;
use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\Design\Entity\ValueObject\ImageGenerationType;
use App\Domain\Design\Repository\Facade\ImageGenerationRepositoryInterface;
use App\Domain\Design\Service\ImageGenerationDomainService;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\File\Service\FileDomainService;
use App\Domain\Provider\Entity\AiAbilityEntity;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\Provider\Entity\ValueObject\ProviderDataIsolation;
use App\Domain\Provider\Entity\ValueObject\Status;
use App\Domain\Provider\Service\AiAbilityDomainService;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
use App\Domain\SuperMagic\Project\Service\ProjectDomainService;
use App\ErrorCode\DesignErrorCode;
use App\ErrorCode\MagicApiErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseOrganizationInfoManager;
use App\Infrastructure\Core\DataIsolation\BaseSubscriptionManager;
use App\Infrastructure\Core\DataIsolation\BaseThirdPlatformDataIsolationManager;
use App\Infrastructure\Core\DataIsolation\OrganizationInfoManagerInterface;
use App\Infrastructure\Core\DataIsolation\SubscriptionManagerInterface;
use App\Infrastructure\Core\DataIsolation\ThirdPlatformDataIsolationManagerInterface;
use App\Infrastructure\Core\Exception\BusinessException;
use Hyperf\Codec\Packer\PhpSerializerPacker;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\TranslatorInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Qbhy\HyperfAuth\Authenticatable;
use RuntimeException;
use Throwable;

/**
 * @internal
 */
final class ImageGenerationAppServiceTest extends TestCase
{
    public static function setUpBeforeClass(): void
    {
        if (ApplicationContext::hasContainer()) {
            return;
        }

        ApplicationContext::setContainer(new class implements ContainerInterface {
            public function make(string $id, array $parameters = []): mixed
            {
                return $this->get($id);
            }

            public function get(string $id): mixed
            {
                return match ($id) {
                    ConfigInterface::class => new class implements ConfigInterface {
                        public function get(string $key, mixed $default = null): mixed
                        {
                            return match ($key) {
                                'app_env' => 'test',
                                'service_provider.office_organization' => null,
                                'error_message' => [
                                    'exception_class' => BusinessException::class,
                                    'error_code_mapper' => [
                                        MagicApiErrorCode::class => [4000, 4999],
                                        DesignErrorCode::class => [14000, 14999],
                                    ],
                                ],
                                default => $default,
                            };
                        }

                        public function has(string $keys): bool
                        {
                            return in_array($keys, ['app_env', 'service_provider.office_organization', 'error_message'], true);
                        }

                        public function set(string $key, mixed $value): void
                        {
                        }
                    },
                    PhpSerializerPacker::class => new PhpSerializerPacker(),
                    TranslatorInterface::class => new class implements TranslatorInterface {
                        public function trans(string $key, array $replace = [], ?string $locale = null): string
                        {
                            foreach ($replace as $replaceKey => $replaceValue) {
                                $key = str_replace(':' . $replaceKey, (string) $replaceValue, $key);
                            }
                            return $key;
                        }

                        public function transChoice(string $key, $number, array $replace = [], ?string $locale = null): string
                        {
                            return (string) $this->trans($key, $replace, $locale);
                        }

                        public function getLocale(): string
                        {
                            return 'zh_CN';
                        }

                        public function setLocale(string $locale)
                        {
                        }
                    },
                    ThirdPlatformDataIsolationManagerInterface::class => new BaseThirdPlatformDataIsolationManager(),
                    SubscriptionManagerInterface::class => new BaseSubscriptionManager(),
                    OrganizationInfoManagerInterface::class => new BaseOrganizationInfoManager(),
                    default => throw new RuntimeException('Unsupported service: ' . $id),
                };
            }

            public function has(string $id): bool
            {
                return in_array($id, [
                    ConfigInterface::class,
                    PhpSerializerPacker::class,
                    TranslatorInterface::class,
                    ThirdPlatformDataIsolationManagerInterface::class,
                    SubscriptionManagerInterface::class,
                    OrganizationInfoManagerInterface::class,
                ], true);
            }
        });
    }

    public function testGenerateEraserDoesNotRequireAbilityModelId(): void
    {
        $entity = new ImageGenerationEntity();
        $service = $this->createServiceWithAbility(AiAbilityCode::ImageEraser, $this->createAbilityConfigWithoutModelId());

        $result = $this->withoutUnexpectedException(
            fn () => $service->generateEraser($this->createMock(Authenticatable::class), $entity)
        );

        $this->assertSame($entity, $result);
        $this->assertSame(ImageGenerationType::ERASER, $entity->getType());
        $this->assertSame('design_image_eraser', $entity->getModelId());
        $this->assertSame('', $entity->getPrompt());
    }

    public function testGenerateExpandDoesNotRequireAbilityModelIdAndKeepsRequestPrompt(): void
    {
        $entity = new ImageGenerationEntity();
        $entity->setPrompt('  keep user prompt  ');
        $service = $this->createServiceWithAbility(AiAbilityCode::ImageExpand, $this->createAbilityConfigWithoutModelId());

        $result = $this->withoutUnexpectedException(
            fn () => $service->generateExpandImage($this->createMock(Authenticatable::class), $entity)
        );

        $this->assertSame($entity, $result);
        $this->assertSame(ImageGenerationType::EXPAND, $entity->getType());
        $this->assertSame('design_image_expand', $entity->getModelId());
        $this->assertSame('keep user prompt', $entity->getPrompt());
    }

    private function createServiceWithAbility(AiAbilityCode $expectedCode, array $config): ImageGenerationAppService
    {
        $aiAbilityDomainService = $this->createMock(AiAbilityDomainService::class);
        $aiAbilityDomainService->expects($this->once())
            ->method('getByCode')
            ->with($this->isInstanceOf(ProviderDataIsolation::class), $this->identicalTo($expectedCode))
            ->willReturn($this->createAbility($expectedCode, $config));

        return new class(new ImageGenerationDomainService($this->createMock(ImageGenerationRepositoryInterface::class)), $this->createMock(ProjectDomainService::class), new FileDomainService($this->createMock(CloudFileRepositoryInterface::class)), $this->createMock(TaskFileDomainService::class), $aiAbilityDomainService, $this->createMock(UserAiWatermarkPolicyInterface::class)) extends ImageGenerationAppService {
            public function generateImage(Authenticatable $authenticatable, ImageGenerationEntity $entity): ImageGenerationEntity
            {
                return $entity;
            }
        };
    }

    private function withoutUnexpectedException(callable $callback): mixed
    {
        try {
            return $callback();
        } catch (Throwable $throwable) {
            $this->fail('擦除/扩图能力已启用且 provider 可用时，不应因为缺少顶层 model_id 抛异常：' . $throwable->getMessage());
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function createAbilityConfigWithoutModelId(): array
    {
        return [
            'providers' => [
                [
                    'provider' => 'jimeng',
                    'enable' => true,
                    'concurrent' => '1',
                ],
            ],
        ];
    }

    /**
     * @param array<string, mixed> $config
     */
    private function createAbility(AiAbilityCode $code, array $config): AiAbilityEntity
    {
        $entity = new AiAbilityEntity();
        $entity->setCode($code);
        $entity->setStatus(Status::Enabled);
        $entity->setConfig($config);

        return $entity;
    }
}
