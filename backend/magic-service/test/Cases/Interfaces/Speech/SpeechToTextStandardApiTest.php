<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Interfaces\Speech;

use App\Application\Speech\Service\SpeechToTextStandardAppService;
use App\Infrastructure\ExternalAPI\Volcengine\DTO\SpeechRecognitionResultDTO;
use App\Infrastructure\Util\Context\RequestCoContext;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\Speech\Facade\Open\SpeechToTextStandardApi;
use GuzzleHttp\Psr7\Response;
use Hyperf\Context\Context;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\Redis\Redis;
use Mockery;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Log\LoggerInterface;
use ReflectionMethod;
use ReflectionProperty;

/**
 * @internal
 */
class SpeechToTextStandardApiTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        Context::destroy(ResponseInterface::class);
        Context::destroy('magic-api-key');
        Context::destroy('magic-user-authorization');

        parent::tearDown();
    }

    public function testVolcengineMetadataIsReturnedInHeadersAndRemovedFromBody(): void
    {
        Context::set(ResponseInterface::class, new Response());

        $api = new SpeechToTextStandardApi(Mockery::mock(RequestInterface::class));
        $result = $this->invokeSetVolcengineHeaders($api, [
            'audio_info' => null,
            'result' => null,
            'volcengine_log_id' => '2026062210060788E8E2F66A67BE11D2CA',
            'volcengine_status_code' => '45000151',
            'volcengine_message' => '[Invalid audio format] OperatorWrapper Process failed: invalid argument,audio convert failed',
        ]);

        $response = Context::get(ResponseInterface::class);
        $this->assertSame(['2026062210060788E8E2F66A67BE11D2CA'], $response->getHeader('X-Volcengine-Log-Id'));
        $this->assertSame(['45000151'], $response->getHeader('X-Volcengine-Status-Code'));
        $this->assertSame(
            ['[Invalid audio format] OperatorWrapper Process failed: invalid argument,audio convert failed'],
            $response->getHeader('X-Volcengine-Message')
        );
        $this->assertSame([
            'audio_info' => null,
            'result' => null,
        ], $result);
    }

    public function testQueryLargeModelReturnsVolcengineFailureBeforeUsageAccounting(): void
    {
        Context::set(ResponseInterface::class, new Response());
        RequestCoContext::setApiKey('test-access-token');

        $request = Mockery::mock(RequestInterface::class);
        $request->shouldReceive('all')->once()->andReturn(['type' => SpeechToTextStandardApi::VOLCENGINE_TYPE]);
        $request->shouldReceive('getServerParams')->once()->andReturn([]);
        $request->shouldReceive('getHeader')->with('x-forwarded-for')->once()->andReturn([]);
        $request->shouldReceive('getHeader')->with('x-real-ip')->once()->andReturn([]);
        $request->shouldReceive('getHeaders')->andReturn([]);

        $authorization = Mockery::mock(MagicUserAuthorization::class);
        $authorization->shouldReceive('getOrganizationCode')->andReturn('ORG001');
        $authorization->shouldReceive('getId')->andReturn('user001');
        RequestCoContext::setUserAuthorization($authorization);

        $appService = Mockery::mock(SpeechToTextStandardAppService::class);
        $appService->shouldReceive('queryLargeModelResult')
            ->once()
            ->andReturn(new SpeechRecognitionResultDTO([
                'volcengine_log_id' => '2026062210060788E8E2F66A67BE11D2CA',
                'volcengine_status_code' => '45000151',
                'volcengine_message' => '[Invalid audio format] OperatorWrapper Process failed: invalid argument,audio convert failed',
            ]));

        $api = new SpeechToTextStandardApi($request);
        $this->setProperty($api, 'speechToTextStandardAppService', $appService);
        $this->setProperty($api, 'redis', Mockery::mock(Redis::class)->shouldReceive('exists')->andReturn(false)->getMock());
        $this->setProperty($api, 'logger', Mockery::mock(LoggerInterface::class)->shouldReceive('info')->andReturnNull()->getMock());

        $result = $api->queryLargeModel($request, '927502956287008770');

        $response = Context::get(ResponseInterface::class);
        $this->assertSame(['2026062210060788E8E2F66A67BE11D2CA'], $response->getHeader('X-Volcengine-Log-Id'));
        $this->assertSame(['45000151'], $response->getHeader('X-Volcengine-Status-Code'));
        $this->assertSame(
            ['[Invalid audio format] OperatorWrapper Process failed: invalid argument,audio convert failed'],
            $response->getHeader('X-Volcengine-Message')
        );
        $this->assertSame([
            'status' => 'failed',
            'status_code' => '45000151',
            'message' => '[Invalid audio format] OperatorWrapper Process failed: invalid argument,audio convert failed',
            'log_id' => '2026062210060788E8E2F66A67BE11D2CA',
        ], $result);
    }

    private function invokeSetVolcengineHeaders(SpeechToTextStandardApi $api, array $result): array
    {
        $method = new ReflectionMethod($api, 'setVolcengineHeaders');
        $method->setAccessible(true);

        return $method->invoke($api, $result);
    }

    private function setProperty(object $object, string $property, mixed $value): void
    {
        $reflection = new ReflectionProperty($object, $property);
        $reflection->setAccessible(true);
        $reflection->setValue($object, $value);
    }
}
