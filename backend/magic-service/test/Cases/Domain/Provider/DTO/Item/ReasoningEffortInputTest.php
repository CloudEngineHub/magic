<?php

declare(strict_types=1);

namespace HyperfTest\Cases\Domain\Provider\DTO\Item;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\SuperAgentExtra;
use App\Domain\Provider\DTO\Item\ModelConfigItem;
use App\Domain\ModelGateway\Entity\Dto\CompletionDTO;
use Hyperf\Odin\Api\Request\ChatCompletionRequest;
use Hyperf\Odin\Exception\InvalidArgumentException;
use App\ErrorCode\ServiceProviderErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\TranslatorInterface;
use Hyperf\Odin\Api\Request\ReasoningEffort;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use ReflectionProperty;

/** 使用 mock 异常与翻译依赖验证配置和消息边界，不启动应用。 */
class ReasoningEffortInputTest extends TestCase
{
    private ?ContainerInterface $previousContainer = null;

    /** 替换异常处理所需依赖，隔离真实配置和翻译资源。 */
    protected function setUp(): void
    {
        $this->previousContainer = ApplicationContext::hasContainer() ? ApplicationContext::getContainer() : null;
        $config = $this->createMock(ConfigInterface::class);
        $config->method('get')->willReturn(['error_code_mapper' => [ServiceProviderErrorCode::class => [0, PHP_INT_MAX]]]);
        $translator = $this->createMock(TranslatorInterface::class);
        $translator->method('trans')->willReturnCallback(static fn (string $key): string => $key);
        $container = $this->createMock(ContainerInterface::class);
        $container->method('get')->willReturnMap([[ConfigInterface::class, $config], [TranslatorInterface::class, $translator]]);
        ApplicationContext::setContainer($container);
    }

    /** 恢复测试之前的容器，避免污染其他用例。 */
    protected function tearDown(): void
    {
        (new ReflectionProperty(ApplicationContext::class, 'container'))->setValue(null, $this->previousContainer);
    }

    /** 七档透传且默认与明确关闭不同，动态逻辑模型标识不被替换。 */
    public function testMessageAcceptsAllLevelsAndDefault(): void
    {
        $extra = new SuperAgentExtra();
        foreach (ReasoningEffort::values() as $level) {
            $extra->setModel(['model_id' => 'mock-auto', 'reasoning_effort' => $level]);
            $this->assertSame($level, $extra->getReasoningEffort());
            $this->assertSame('mock-auto', $extra->getModelId());
        }
        $extra->setModel(['model_id' => 'mock-auto']);
        $this->assertNull($extra->getReasoningEffort());
    }

    /** 后台配置仍限定七档，用于管理前台可选项。 */
    public function testInvalidInputIsRejectedOnlyInAdminConfig(): void
    {
        foreach (['unknown', '', 1, false, []] as $value) {
            try {
                (new ModelConfigItem())->setReasoningEffortLevels([$value]);
                $this->fail('Invalid admin reasoning level must be rejected');
            } catch (BusinessException $exception) {
                $this->assertSame(ServiceProviderErrorCode::InvalidParameter->value, $exception->getCode());
            }
        }
    }

    /** 消息与网关 DTO 原样透传未知档位及类型，不转换成默认或较低档位。 */
    public function testRequestValuesPassThroughMessageAndGateway(): void
    {
        foreach (['mock-future-level', '', 1, false, [], ['mock' => true], null] as $value) {
            $extra = new SuperAgentExtra(['model' => ['model_id' => 'mock-model', 'reasoning_effort' => $value]]);
            $completion = new CompletionDTO(['reasoning_effort' => $extra->getReasoningEffort()]);
            $this->assertSame($value, $extra->getReasoningEffort());
            $this->assertSame($value, $completion->getReasoningEffort());
            $this->assertSame($value, $completion->toArray()['reasoning_effort']);
        }
    }

    /** 最终校验仍由 Odin 执行，取消中间校验不会改变 SDK 的合法性判断。 */
    public function testOdinStillValidatesUnrecognizedLevel(): void
    {
        $completion = new CompletionDTO(['reasoning_effort' => 'mock-future-level']);
        $request = new ChatCompletionRequest([]);
        $this->expectException(InvalidArgumentException::class);
        $request->setReasoningEffort($completion->getReasoningEffort());
    }
}
