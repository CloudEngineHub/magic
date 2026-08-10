<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Design\Tool\ImageGeneration\Handler;

use App\Application\Design\Tool\ImageGeneration\Handler\DesignEraserImageTaskHandler;
use App\Application\Design\Tool\ImageGeneration\Handler\DesignExpandImageTaskHandler;
use App\Application\ModelGateway\Service\ImageEraserAppService;
use App\Application\ModelGateway\Service\ImageExpandAppService;
use App\Domain\Design\Entity\DesignDataIsolation;
use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\File\Service\FileDomainService;
use App\Domain\ModelGateway\Entity\Dto\ImageEraserRequestDTO;
use App\Domain\ModelGateway\Entity\Dto\ImageExpandRequestDTO;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
use App\ErrorCode\MagicApiErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseOrganizationInfoManager;
use App\Infrastructure\Core\DataIsolation\BaseSubscriptionManager;
use App\Infrastructure\Core\DataIsolation\BaseThirdPlatformDataIsolationManager;
use App\Infrastructure\Core\DataIsolation\OrganizationInfoManagerInterface;
use App\Infrastructure\Core\DataIsolation\SubscriptionManagerInterface;
use App\Infrastructure\Core\DataIsolation\ThirdPlatformDataIsolationManagerInterface;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\OpenAIFormatResponse;
use Dtyq\CloudFile\Kernel\Struct\FileLink;
use Hyperf\Codec\Packer\PhpSerializerPacker;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\TranslatorInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use RuntimeException;

/**
 * @internal
 */
final class DesignEraserExpandImageTaskHandlerTest extends TestCase
{
    public static function setUpBeforeClass(): void
    {
        if (! defined('MAGIC_ACCESS_TOKEN')) {
            define('MAGIC_ACCESS_TOKEN', 'test-magic-access-token');
        }

        if (! ApplicationContext::hasContainer()) {
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
    }

    public function testEraserHandlerCallsDedicatedImageEraserService(): void
    {
        $dataIsolation = DesignDataIsolation::create('ORG001', '10001');
        $entity = $this->createEntity([
            '/images/input.png',
            'design-mark/eraser-mask.png',
        ], [
            'dilate_size' => 15,
            'quality' => 'M',
        ]);

        $imageEraserAppService = $this->createMock(ImageEraserAppService::class);
        $imageEraserAppService->expects($this->once())
            ->method('erase')
            ->with($this->callback(function (ImageEraserRequestDTO $dto): bool {
                $dto->valid();

                return $dto->getAccessToken() === 'test-magic-access-token'
                    && $dto->getImageUrl() === 'https://sandbox.example.com/input.png'
                    && $dto->getMaskUrl() === 'https://private.example.com/eraser-mask.png'
                    && $dto->getDilateSize() === 15;
            }))
            ->willReturn($this->createGatewayResponse('https://result.example.com/erased.png'));

        $handler = new DesignEraserImageTaskHandler(
            $this->createFileDomainService(),
            $this->createTaskFileDomainService(),
            $imageEraserAppService,
        );

        $response = $handler->handle($dataIsolation, $entity, '/ORG001/project_123/workspace');

        $this->assertSame('https://result.example.com/erased.png', $response?->getData()[0]['url'] ?? null);
    }

    public function testExpandHandlerCallsDedicatedImageExpandServiceWithCanvasAndMask(): void
    {
        $dataIsolation = DesignDataIsolation::create('ORG001', '10001');
        $entity = $this->createEntity([
            '/images/source.png',
            'design-mark/expand-canvas.png',
            'design-mark/expand-mask.png',
        ], [
            'scale' => 7,
            'top' => 0.1,
            'bottom' => 0.1,
            'left' => 0.2,
            'right' => 0.2,
            'max_height' => 1920,
            'max_width' => 1920,
        ], 'expand naturally');

        $imageExpandAppService = $this->createMock(ImageExpandAppService::class);
        $imageExpandAppService->expects($this->once())
            ->method('expand')
            ->with($this->callback(function (ImageExpandRequestDTO $dto): bool {
                $dto->valid();

                return $dto->getAccessToken() === 'test-magic-access-token'
                    && $dto->getImageUrl() === 'https://private.example.com/expand-canvas.png'
                    && $dto->getMaskUrl() === 'https://private.example.com/expand-mask.png'
                    && $dto->getCustomPrompt() === 'expand naturally'
                    && $dto->getScale() === 7.0
                    && $dto->getMaxWidth() === 1920;
            }))
            ->willReturn($this->createGatewayResponse('https://result.example.com/expanded.png'));

        $handler = new DesignExpandImageTaskHandler(
            $this->createFileDomainService(),
            $this->createTaskFileDomainService(),
            $imageExpandAppService,
        );

        $response = $handler->handle($dataIsolation, $entity, '/ORG001/project_123/workspace');

        $this->assertSame('https://result.example.com/expanded.png', $response?->getData()[0]['url'] ?? null);
    }

    /**
     * @param list<string> $referenceImages
     * @param array<string, mixed> $config
     */
    private function createEntity(array $referenceImages, array $config, ?string $prompt = null): ImageGenerationEntity
    {
        $entity = new ImageGenerationEntity();
        $entity->setProjectId(123);
        $entity->setReferenceImages($referenceImages);
        $entity->setImageGenerationConfig($config);
        $entity->setPrompt($prompt);

        return $entity;
    }

    private function createGatewayResponse(string $url): OpenAIFormatResponse
    {
        return new OpenAIFormatResponse([
            'created' => time(),
            'data' => [
                ['url' => $url],
            ],
        ]);
    }

    private function createTaskFileDomainService(): TaskFileDomainService
    {
        $service = $this->createMock(TaskFileDomainService::class);
        $service->method('findEntityByRelativePath')
            ->willReturnCallback(static function (int $projectId, string $relativePath): ?TaskFileEntity {
                if ($projectId !== 123 || ! in_array($relativePath, ['/images/input.png', '/images/source.png'], true)) {
                    return null;
                }

                $taskFile = new TaskFileEntity();
                $fileName = basename($relativePath);
                $taskFile->setFileKey('ORG001/project_123/workspace/images/' . $fileName);
                $taskFile->setFileSize(0);

                return $taskFile;
            });

        return $service;
    }

    private function createFileDomainService(): FileDomainService
    {
        $repository = $this->createMock(CloudFileRepositoryInterface::class);
        $repository->method('getLinks')
            ->willReturnCallback(static function (
                string $organizationCode,
                array $filePaths,
                ?StorageBucketType $bucketType = null,
                array $downloadNames = [],
                array $options = [],
            ): array {
                if ($organizationCode !== 'ORG001') {
                    return [];
                }

                $links = [];
                foreach ($filePaths as $filePath) {
                    $link = match ([$bucketType?->value, $filePath]) {
                        [StorageBucketType::SandBox->value, 'ORG001/project_123/workspace/images/input.png'] => new FileLink($filePath, 'https://sandbox.example.com/input.png', 3600),
                        [StorageBucketType::SandBox->value, 'ORG001/project_123/workspace/images/source.png'] => new FileLink($filePath, 'https://sandbox.example.com/source.png', 3600),
                        [StorageBucketType::Private->value, 'design-mark/eraser-mask.png'] => new FileLink($filePath, 'https://private.example.com/eraser-mask.png', 3600),
                        [StorageBucketType::Private->value, 'design-mark/expand-canvas.png'] => new FileLink($filePath, 'https://private.example.com/expand-canvas.png', 3600),
                        [StorageBucketType::Private->value, 'design-mark/expand-mask.png'] => new FileLink($filePath, 'https://private.example.com/expand-mask.png', 3600),
                        default => null,
                    };
                    if ($link !== null) {
                        $links[$filePath] = $link;
                    }
                }

                return $links;
            });

        return new FileDomainService($repository);
    }
}
