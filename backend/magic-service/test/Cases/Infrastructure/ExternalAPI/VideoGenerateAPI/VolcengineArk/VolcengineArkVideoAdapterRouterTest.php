<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArk;

use App\Domain\ModelGateway\Entity\ValueObject\QueueExecutorConfig;
use App\Domain\ModelGateway\Entity\ValueObject\VideoOperationStatus;
use App\Domain\ModelGateway\Entity\VideoQueueOperationEntity;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArk\Adapter\AbstractSeedanceVideoAdapter;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArk\Adapter\Seedance20MiniFastVideoAdapter;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArk\Adapter\Seedance20VideoAdapter;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArk\Adapter\Seedance25VideoAdapter;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArk\Adapter\VolcengineArkVideoAdapterRouter;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArk\Capability\Seedance20GenerationCapabilityProvider;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArk\Capability\Seedance20MiniFastGenerationCapabilityProvider;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArk\Capability\Seedance25GenerationCapabilityProvider;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArkSeedanceVideoAdapter;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VolcengineArkVideoClient;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use Hyperf\Guzzle\ClientFactory;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * 三分拆分后 router 的分发行为，以及与保留单体类的逐字等价性。
 *
 * 单体类 `VolcengineArkSeedanceVideoAdapter` 是回滚位，因此这里同时断言两件事：
 * 一是 router 把模型路由到了正确家族，二是拆分没有改变任何对外输出。
 * 后者用 `assertSame` 比较数组，连键顺序一起比对，避免生成参数顺序漂移到前端。
 *
 * @internal
 */
final class VolcengineArkVideoAdapterRouterTest extends TestCase
{
    private const MINI_FAST_MODEL = 'doubao-seedance-2-0-fast-260128';

    private const TWO_MODEL = 'doubao-seedance-2-0-260128';

    private const TWO_FIVE_MODEL = 'doubao-seedance-2-5-260xxx';

    private const UNKNOWN_MODEL = 'doubao-other-video-260128';

    /**
     * @dataProvider seedanceFamilyProvider
     */
    public function testRouterDispatchesEachFamilyToItsOwnAdapter(string $model, string $family): void
    {
        $router = $this->createRouter();

        $this->assertTrue($router->supportsModel($model, ''));
        $this->assertTrue($router->supportsModel('', $model));

        $expected = $this->createFamilyAdapter($family)->resolveGenerationConfig($model, $model);
        $actual = $router->resolveGenerationConfig($model, $model);

        $this->assertNotNull($expected);
        $this->assertNotNull($actual);
        $this->assertSame($expected->toArray(), $actual->toArray());
    }

    public function testFamilyAdaptersClaimOnlyTheirOwnModels(): void
    {
        $expectations = [
            'mini_fast' => [self::MINI_FAST_MODEL => true, self::TWO_MODEL => false, self::TWO_FIVE_MODEL => false],
            'two' => [self::MINI_FAST_MODEL => false, self::TWO_MODEL => true, self::TWO_FIVE_MODEL => false],
            'two_five' => [self::MINI_FAST_MODEL => false, self::TWO_MODEL => false, self::TWO_FIVE_MODEL => true],
        ];

        foreach ($expectations as $family => $cases) {
            $adapter = $this->createFamilyAdapter($family);

            foreach ($cases as $model => $supported) {
                $this->assertSame(
                    $supported,
                    $adapter->supportsModel($model, ''),
                    sprintf('%s family should %s claim %s', $family, $supported ? '' : 'not', $model),
                );
            }
        }
    }

    public function testRouterThrowsRuntimeExceptionForUnknownModelIdentifier(): void
    {
        $router = $this->createRouter();

        $this->assertFalse($router->supportsModel(self::UNKNOWN_MODEL, ''));

        $this->expectException(RuntimeException::class);
        $router->buildProviderPayload($this->createOperation(self::UNKNOWN_MODEL, $this->generateRequest(self::UNKNOWN_MODEL)));
    }

    public function testConnectivityTestDelegatesToResolvedFamilyAdapter(): void
    {
        $httpClient = $this->createMock(Client::class);
        $httpClient->expects($this->once())
            ->method('post')
            ->willThrowException(new RequestException(
                'invalid parameter',
                new Request('POST', 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'),
                new Response(400, [], json_encode([
                    'error' => ['code' => 'InvalidParameter', 'message' => 'duration invalid'],
                ], JSON_THROW_ON_ERROR)),
            ));

        $clientFactory = $this->createMock(ClientFactory::class);
        $clientFactory->expects($this->once())
            ->method('create')
            ->willReturn($httpClient);

        $router = $this->createRouter($clientFactory);

        $this->assertTrue($router->testConnection($this->config(), self::TWO_FIVE_MODEL));
    }

    public function testConnectivityTestThrowsForUnknownModelVersion(): void
    {
        $router = $this->createRouter();

        $this->expectException(RuntimeException::class);
        $router->testConnection($this->config(), self::UNKNOWN_MODEL);
    }

    public function testResolveHasAudioOutputDelegatesAndFallsBackForUnknownModel(): void
    {
        $router = $this->createRouter();
        $request = $this->generateRequest(self::TWO_FIVE_MODEL);

        foreach ([self::MINI_FAST_MODEL, self::TWO_MODEL, self::TWO_FIVE_MODEL] as $model) {
            $this->assertTrue($router->resolveHasAudioOutput($model, $model, $request));
        }

        // 三族内与保留的单体类一致（单体类无条件返回 true）；
        // 未命中三族时按 DashScope / Gemini 两个 router 的既有惯例回落 false，不再声称支持。
        $this->assertTrue($this->createMonolithAdapter()->resolveHasAudioOutput(self::UNKNOWN_MODEL, '', []));
        $this->assertFalse($router->resolveHasAudioOutput(self::UNKNOWN_MODEL, '', []));
    }

    /**
     * 拆分后在能力声明上做了两处有意增强（样片模式开关、首尾帧比例约束），
     * 比对前先剔除，其余结构仍必须与回滚位逐字一致（含键顺序）。
     *
     * @dataProvider seedanceFamilyProvider
     */
    public function testGenerationConfigMatchesMonolithForEachFamily(string $model, string $family): void
    {
        $monolithConfig = $this->createMonolithAdapter()->resolveGenerationConfig($model, $model);
        $familyConfig = $this->createFamilyAdapter($family)->resolveGenerationConfig($model, $model);

        $this->assertNotNull($monolithConfig);
        $this->assertNotNull($familyConfig);
        $this->assertSame(
            $monolithConfig->toArray(),
            $this->stripIntentionalEnhancements($familyConfig->toArray()),
        );
    }

    /**
     * @dataProvider seedanceFamilyProvider
     */
    public function testGeneratePayloadMatchesMonolithForEachFamily(string $model, string $family): void
    {
        $this->assertPayloadMatchesMonolith($model, $family, $this->generateRequest($model));
    }

    /**
     * @dataProvider seedanceFamilyProvider
     */
    public function testVideoEditPayloadMatchesMonolithForEachFamily(string $model, string $family): void
    {
        $this->assertPayloadMatchesMonolith($model, $family, $this->videoEditRequest($model));
    }

    /**
     * 首帧内容映射仍与回滚位逐字一致；该请求不带比例，因此不触碰有意差异点。
     *
     * @dataProvider seedanceFamilyProvider
     */
    public function testKeyframePayloadMatchesMonolithForEachFamily(string $model, string $family): void
    {
        $this->assertPayloadMatchesMonolith($model, $family, $this->keyframeRequest($model));
    }

    /**
     * 需求二：只要请求带首帧就不下发 ratio，并把调用方传入的比例记为未生效。
     *
     * 回滚位仍会无条件下发 ratio，这正是线上 400 InvalidParameter.TaskTypeConstraint 的成因，
     * 这里把两者的差异显式固化下来。
     *
     * @dataProvider seedanceFamilyProvider
     */
    public function testFirstFrameSuppressesAspectRatioForEachFamily(string $model, string $family): void
    {
        $familyOperation = $this->createOperation($model, $this->keyframeWithAspectRatioRequest($model));
        $familyPayload = $this->createFamilyAdapter($family)->buildProviderPayload($familyOperation);

        $this->assertArrayNotHasKey('ratio', $familyPayload);
        $this->assertContains('generation.aspect_ratio', $familyOperation->getIgnoredParams());
        $this->assertNotContains('generation.aspect_ratio', $familyOperation->getAcceptedParams());

        $monolithPayload = $this->createMonolithAdapter()->buildProviderPayload(
            $this->createOperation($model, $this->keyframeWithAspectRatioRequest($model)),
        );
        $this->assertSame('16:9', $monolithPayload['ratio']);
    }

    /**
     * 需求二：keyframe_guided 模式声明不支持比例，前端据此隐藏比例分区。
     *
     * @dataProvider seedanceFamilyProvider
     */
    public function testKeyframeGuidedDeclaresNoAspectRatioForEachFamily(string $model, string $family): void
    {
        $config = $this->createFamilyAdapter($family)->resolveGenerationConfig($model, $model);

        $this->assertNotNull($config);
        $this->assertSame(
            [],
            $config->toArray()['input_modes']['keyframe_guided']['generation_constraints']['aspect_ratios'],
        );
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function seedanceFamilyProvider(): array
    {
        return [
            '2.0 mini/fast' => [self::MINI_FAST_MODEL, 'mini_fast'],
            '2.0' => [self::TWO_MODEL, 'two'],
            '2.5' => [self::TWO_FIVE_MODEL, 'two_five'],
        ];
    }

    /**
     * 需求一：只有 Seedance 2.5 声明样片模式开关，其余家族不出现该键。
     */
    public function testOnlyTwoPointFiveDeclaresDraftSwitch(): void
    {
        $draftSwitch = $this->createFamilyAdapter('two_five')
            ->resolveGenerationConfig(self::TWO_FIVE_MODEL, self::TWO_FIVE_MODEL)
            ?->toArray()['generation']['draft'];

        $this->assertIsArray($draftSwitch);
        $this->assertSame('switch', $draftSwitch['type']);
        $this->assertFalse($draftSwitch['default']);
        $this->assertNotSame('', $draftSwitch['name']);
        $this->assertNotSame('', $draftSwitch['description']);

        $others = ['mini_fast' => self::MINI_FAST_MODEL, 'two' => self::TWO_MODEL];
        foreach ($others as $family => $model) {
            $config = $this->createFamilyAdapter($family)->resolveGenerationConfig($model, $model);

            $this->assertNotNull($config);
            $this->assertArrayNotHasKey('draft', $config->toArray()['generation']);
        }
    }

    /**
     * 需求一：draft 映射到方舟顶层 draft 布尔位，且不再被当成未处理参数；
     * 未传时不出现该键。非 2.5 家族的裁剪发生在领域层，见 VideoQueueDomainServiceTest。
     */
    public function testDraftIsMappedIntoPayloadOnlyWhenRequested(): void
    {
        $adapter = $this->createFamilyAdapter('two_five');

        $withDraft = $this->createOperation(self::TWO_FIVE_MODEL, $this->draftRequest(self::TWO_FIVE_MODEL));
        $payload = $adapter->buildProviderPayload($withDraft);

        $this->assertTrue($payload['draft']);
        $this->assertContains('generation.draft', $withDraft->getAcceptedParams());
        $this->assertNotContains('generation.draft', $withDraft->getIgnoredParams());

        $withoutDraft = $this->createOperation(self::TWO_FIVE_MODEL, $this->generateRequest(self::TWO_FIVE_MODEL));
        $this->assertArrayNotHasKey('draft', $adapter->buildProviderPayload($withoutDraft));
    }

    /**
     * @param array<string, mixed> $rawRequest
     */
    private function assertPayloadMatchesMonolith(string $model, string $family, array $rawRequest): void
    {
        $monolithOperation = $this->createOperation($model, $rawRequest);
        $familyOperation = $this->createOperation($model, $rawRequest);

        $monolithPayload = $this->createMonolithAdapter()->buildProviderPayload($monolithOperation);
        $familyPayload = $this->createFamilyAdapter($family)->buildProviderPayload($familyOperation);

        $this->assertSame($monolithPayload, $familyPayload);
        $this->assertSame($monolithOperation->getAcceptedParams(), $familyOperation->getAcceptedParams());
        $this->assertSame($monolithOperation->getIgnoredParams(), $familyOperation->getIgnoredParams());
    }

    /**
     * 剔除拆分后有意新增的两处能力声明，使其余结构可以与回滚位逐字比对。
     *
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    private function stripIntentionalEnhancements(array $config): array
    {
        unset(
            $config['generation']['draft'],
            $config['input_modes']['keyframe_guided']['generation_constraints'],
        );

        return $config;
    }

    private function createRouter(?ClientFactory $clientFactory = null): VolcengineArkVideoAdapterRouter
    {
        return new VolcengineArkVideoAdapterRouter(
            new Seedance20MiniFastVideoAdapter(
                new Seedance20MiniFastGenerationCapabilityProvider(),
                $this->createArkClient($clientFactory),
            ),
            new Seedance20VideoAdapter(
                new Seedance20GenerationCapabilityProvider(),
                $this->createArkClient($clientFactory),
            ),
            new Seedance25VideoAdapter(
                new Seedance25GenerationCapabilityProvider(),
                $this->createArkClient($clientFactory),
            ),
        );
    }

    private function createFamilyAdapter(string $family, ?ClientFactory $clientFactory = null): AbstractSeedanceVideoAdapter
    {
        return match ($family) {
            'mini_fast' => new Seedance20MiniFastVideoAdapter(
                new Seedance20MiniFastGenerationCapabilityProvider(),
                $this->createArkClient($clientFactory),
            ),
            'two' => new Seedance20VideoAdapter(
                new Seedance20GenerationCapabilityProvider(),
                $this->createArkClient($clientFactory),
            ),
            'two_five' => new Seedance25VideoAdapter(
                new Seedance25GenerationCapabilityProvider(),
                $this->createArkClient($clientFactory),
            ),
            default => throw new InvalidArgumentException(sprintf('unknown seedance family: %s', $family)),
        };
    }

    private function createMonolithAdapter(?ClientFactory $clientFactory = null): VolcengineArkSeedanceVideoAdapter
    {
        return new VolcengineArkSeedanceVideoAdapter($this->createArkClient($clientFactory));
    }

    private function createArkClient(?ClientFactory $clientFactory = null): VolcengineArkVideoClient
    {
        return new VolcengineArkVideoClient($clientFactory ?? $this->createMock(ClientFactory::class));
    }

    /**
     * @param array<string, mixed> $rawRequest
     */
    private function createOperation(string $model, array $rawRequest): VideoQueueOperationEntity
    {
        return new VideoQueueOperationEntity(
            id: 'op-ark-router-' . $model,
            endpoint: 'video:' . $model,
            model: $model,
            modelVersion: $model,
            providerModelId: $model,
            providerCode: 'VolcengineArk',
            providerName: 'volcengineark',
            organizationCode: 'org-1',
            userId: 'user-1',
            status: VideoOperationStatus::QUEUED,
            seq: 1,
            rawRequest: $rawRequest,
            createdAt: date(DATE_ATOM),
            heartbeatAt: date(DATE_ATOM),
        );
    }

    /**
     * 覆盖各类参考素材、比例与执行参数的完整生成请求。
     *
     * 这里刻意不带 frames：首帧存在时不下发 ratio 是拆分后与回滚位的有意差异，
     * 会让逐字比对失去意义；帧相关行为改由 keyframeRequest() 与专门用例覆盖。
     *
     * @return array<string, mixed>
     */
    private function generateRequest(string $model): array
    {
        return [
            'model_id' => $model,
            'task' => 'generate',
            'prompt' => '{{image_1}} 跟随 {{video_1}}，再配合 {{audio_1}} 替换天空为晚霞',
            'inputs' => [
                'reference_images' => [
                    ['uri' => 'https://example.com/ref.png'],
                ],
                'reference_videos' => [
                    ['uri' => 'https://example.com/source.mp4'],
                ],
                'reference_audios' => [
                    ['uri' => 'https://example.com/voice.wav'],
                ],
                'mask' => ['uri' => 'https://example.com/mask.png'],
            ],
            'generation' => [
                'camera_fixed' => true,
                'aspect_ratio' => '16:9',
                'duration_seconds' => 5,
                'resolution' => '720p',
                'seed' => 7,
                'watermark' => true,
                'return_last_frame' => true,
                'generate_audio' => true,
            ],
            'callbacks' => [
                'webhook_url' => 'https://callback.example.com/video',
            ],
            'execution' => [
                'service_tier' => 'flex',
                'expires_after_seconds' => 7200,
            ],
        ];
    }

    /**
     * 视频编辑请求：2.5 会额外声明子任务类型，另两个家族不会，用于覆盖该分支的等价性。
     *
     * @return array<string, mixed>
     */
    private function videoEditRequest(string $model): array
    {
        return [
            'model_id' => $model,
            'task' => 'edit',
            'input_mode' => 'video_edit',
            'prompt' => '{{video_1}} 再加一只橘猫',
            'inputs' => [
                'reference_videos' => [
                    ['uri' => 'https://example.com/source.mp4'],
                ],
            ],
            'generation' => [
                'resolution' => '720p',
                'duration_seconds' => 5,
                'aspect_ratio' => '16:9',
            ],
        ];
    }

    private function config(): QueueExecutorConfig
    {
        return new QueueExecutorConfig('https://ark.cn-beijing.volces.com/api/v3', 'secret', 3, 20);
    }

    /**
     * 首尾帧生成请求：frames 用领域层归一化后的形态（role + uri 的列表），不带比例，
     * 用于比对帧内容映射的等价性。
     *
     * @return array<string, mixed>
     */
    private function keyframeRequest(string $model): array
    {
        return [
            'model_id' => $model,
            'task' => 'generate',
            'prompt' => 'animate these frames',
            'inputs' => [
                'frames' => [
                    ['role' => 'start', 'uri' => 'https://example.com/start.png'],
                    ['role' => 'end', 'uri' => 'https://example.com/end.png'],
                ],
            ],
            'generation' => [
                'duration_seconds' => 5,
                'resolution' => '720p',
            ],
        ];
    }

    /**
     * 首帧 + 显式比例：需求二要修的场景。
     *
     * @return array<string, mixed>
     */
    private function keyframeWithAspectRatioRequest(string $model): array
    {
        $request = $this->keyframeRequest($model);
        $request['generation']['aspect_ratio'] = '16:9';

        return $request;
    }

    /**
     * @return array<string, mixed>
     */
    private function draftRequest(string $model): array
    {
        $request = $this->generateRequest($model);
        $request['generation']['draft'] = true;

        return $request;
    }
}
