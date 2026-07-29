<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\VolcengineArk;

use App\ErrorCode\ImageGenerateErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\AbstractImageGenerate;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\ImageGenerateType;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Request\ImageGenerateRequest;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\ImageGenerateResponse;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\ImageUsage;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\OpenAIFormatResponse;
use Exception;
use Hyperf\Retry\Annotation\Retry;

class VolcengineArkModel extends AbstractImageGenerate
{
    protected VolcengineArkAPI $api;

    public function __construct(array $serviceProviderConfig)
    {
        $apiUrl = $serviceProviderConfig['url'];
        $apiKey = $serviceProviderConfig['api_key'];
        $proxyUrl = $serviceProviderConfig['proxy_url'] ?? null;

        if (empty($apiKey)) {
            throw new Exception('VolcengineArk API Key 配置缺失');
        }

        // 如果没有配置URL，使用默认端点
        if (empty($apiUrl)) {
            $this->api = new VolcengineArkAPI($apiKey, proxyUrl: $proxyUrl);
        } else {
            $this->api = new VolcengineArkAPI($apiKey, $apiUrl, proxyUrl: $proxyUrl);
        }
    }

    public function generateImageRaw(ImageGenerateRequest $imageGenerateRequest): array
    {
        return $this->generateImageRawInternal($imageGenerateRequest);
    }

    public function setAK(string $ak)
    {
        // VolcengineArk 不使用AK/SK，这里为空实现
    }

    public function setSK(string $sk)
    {
        // VolcengineArk 不使用AK/SK，这里为空实现
    }

    public function setApiKey(string $apiKey)
    {
        $this->api->setApiKey($apiKey);
    }

    public function generateImageRawWithWatermark(ImageGenerateRequest $imageGenerateRequest): array
    {
        $rawData = $this->generateImageRaw($imageGenerateRequest);

        return $this->processVolcengineArkRawDataWithWatermark($rawData, $imageGenerateRequest);
    }

    /**
     * 生成图像并返回OpenAI格式响应 - V2一体化版本.
     */
    public function generateImageOpenAIFormat(ImageGenerateRequest $imageGenerateRequest): OpenAIFormatResponse
    {
        // 1. 预先创建响应对象
        $response = new OpenAIFormatResponse([
            'created' => time(),
            'provider' => $this->getProviderName(),
            'data' => [],
        ]);

        // 2. 参数验证
        if (! $imageGenerateRequest instanceof VolcengineArkRequest) {
            $this->logger->error('VolcengineArk OpenAI格式生图：无效的请求类型', ['class' => get_class($imageGenerateRequest)]);
            return $response; // 返回空数据响应
        }

        // 3. 单次请求使用厂商组图能力返回多张图片
        $count = $imageGenerateRequest->getGenerateNum();
        try {
            $result = $this->requestImageGenerationV2($imageGenerateRequest);
            $this->validateVolcengineArkResponse($result);
            $this->addImageDataToResponse($response, $result, $imageGenerateRequest);
        } catch (Exception $e) {
            $response->setProviderErrorCode($e->getCode());
            $response->setProviderErrorMessage($e->getMessage());

            $this->logger->error('VolcengineArk OpenAI格式生图：请求失败', [
                'error_code' => $e->getCode(),
                'error_message' => $e->getMessage(),
            ]);
        }

        // 4. 记录最终结果
        $this->logger->info('VolcengineArk OpenAI格式生图：处理完成', [
            '请求图片数' => $count,
            '成功图片数' => count($response->getData()),
            '是否有错误' => $response->hasError(),
            '错误码' => $response->getProviderErrorCode(),
            '错误消息' => $response->getProviderErrorMessage(),
        ]);

        return $response;
    }

    public function getProviderName(): string
    {
        return 'volcengine_ark';
    }

    protected function generateImageInternal(ImageGenerateRequest $imageGenerateRequest): ImageGenerateResponse
    {
        $rawResults = $this->generateImageRawInternal($imageGenerateRequest);

        // 从原生结果中提取图片URL
        $imageData = [];
        $index = 0;
        foreach ($rawResults as $result) {
            // 检查嵌套的数据结构：result['data']['data'][*]['url']
            if (empty($result['data']['data']) || ! is_array($result['data']['data'])) {
                continue;
            }
            foreach ($result['data']['data'] as $item) {
                if (! empty($item['url'])) {
                    $imageData[$index] = $item['url'];
                    ++$index;
                }
            }
        }

        if (empty($imageData)) {
            $this->logger->error('VolcengineArk文生图：所有图片生成均失败', ['rawResults' => $rawResults]);
            ExceptionBuilder::throw(ImageGenerateErrorCode::NO_VALID_IMAGE);
        }

        ksort($imageData);
        $imageData = array_values($imageData);

        return new ImageGenerateResponse(ImageGenerateType::URL, $imageData);
    }

    protected function getAlertPrefix(): string
    {
        return 'VolcengineArk API';
    }

    protected function checkBalance(): float
    {
        // VolcengineArk API 目前没有余额查询接口，返回默认值
        return 999.0;
    }

    #[Retry(
        maxAttempts: self::GENERATE_RETRY_COUNT,
        base: self::GENERATE_RETRY_TIME
    )]
    protected function requestImageGeneration(VolcengineArkRequest $imageGenerateRequest): array
    {
        $prompt = $this->buildPromptForRequest($imageGenerateRequest);
        $referImages = $imageGenerateRequest->getReferImages();

        // 构建API payload
        $payload = [
            'model' => $imageGenerateRequest->getModel(),
            'prompt' => $prompt,
            'size' => $imageGenerateRequest->getSize(),
            'response_format' => $imageGenerateRequest->getResponseFormat(),
            'watermark' => $imageGenerateRequest->getWatermark(),
            'stream' => $imageGenerateRequest->getStream(),
        ];

        if ($imageGenerateRequest->getSequentialImageGeneration()) {
            $payload['sequential_image_generation'] = $imageGenerateRequest->getSequentialImageGeneration();
        }

        // 如果设置了组图功能选项，则添加 sequential_image_generation_options
        $sequentialOptions = $imageGenerateRequest->getSequentialImageGenerationOptions();
        if (! empty($sequentialOptions)) {
            $payload['sequential_image_generation_options'] = $sequentialOptions;
        }

        // 如果指定了输出图片格式，则添加 output_format 参数
        $outputFormat = $imageGenerateRequest->getOutputFormat();
        if (! empty($outputFormat)) {
            $payload['output_format'] = $outputFormat;
        }

        // 如果有参考图像，则添加image字段（支持多张图片）
        if (! empty($referImages)) {
            if (count($referImages) === 1) {
                $payload['image'] = $referImages[0];
            } else {
                $payload['image'] = $referImages;
            }
        }
        try {
            return $this->api->generateImage($payload);
        } catch (Exception $e) {
            $this->logger->warning('VolcengineArk图片生成：调用图片生成接口失败', ['error' => $e->getMessage()]);
            ExceptionBuilder::throw(ImageGenerateErrorCode::GENERAL_ERROR, $e->getMessage());
        }
    }

    /**
     * V2版本：纯粹的API调用，不处理异常.
     */
    protected function requestImageGenerationV2(VolcengineArkRequest $imageGenerateRequest): array
    {
        $prompt = $this->buildPromptForRequest($imageGenerateRequest);
        $referImages = $imageGenerateRequest->getReferImages();

        // 构建API payload
        $payload = [
            'model' => $imageGenerateRequest->getModel(),
            'prompt' => $prompt,
            'size' => $imageGenerateRequest->getSize(),
            'response_format' => $imageGenerateRequest->getResponseFormat(),
            'watermark' => $imageGenerateRequest->getWatermark(),
            'stream' => $imageGenerateRequest->getStream(),
        ];

        if ($imageGenerateRequest->getSequentialImageGeneration()) {
            $payload['sequential_image_generation'] = $imageGenerateRequest->getSequentialImageGeneration();
        }

        // 如果设置了组图功能选项，则添加 sequential_image_generation_options
        $sequentialOptions = $imageGenerateRequest->getSequentialImageGenerationOptions();
        if (! empty($sequentialOptions)) {
            $payload['sequential_image_generation_options'] = $sequentialOptions;
        }

        // 如果指定了输出图片格式，则添加 output_format 参数
        $outputFormat = $imageGenerateRequest->getOutputFormat();
        if (! empty($outputFormat)) {
            $payload['output_format'] = $outputFormat;
        }

        // 如果有参考图像，则添加image字段（支持多张图片）
        if (! empty($referImages)) {
            if (count($referImages) === 1) {
                $payload['image'] = $referImages[0];
            } else {
                $payload['image'] = $referImages;
            }
        }

        // 直接调用API，异常自然向上抛
        return $this->api->generateImage($payload);
    }

    private function buildPromptForRequest(VolcengineArkRequest $imageGenerateRequest): string
    {
        $prompt = trim($imageGenerateRequest->getPrompt());
        $generateNum = $imageGenerateRequest->getGenerateNum();
        if ($generateNum <= 1) {
            return $prompt;
        }

        $countInstruction = sprintf('要求返回%d张图', $generateNum);
        if ($prompt === '') {
            return $countInstruction;
        }

        return $prompt . "\n" . $countInstruction;
    }

    /**
     * 验证火山方舟API响应数据格式.
     */
    private function validateVolcengineArkResponse(array $result): void
    {
        if (empty($result['data']) || ! is_array($result['data']) || empty($result['data'][0]['url'])) {
            throw new Exception('火山方舟响应数据格式错误');
        }
    }

    /**
     * 将火山方舟图片数据添加到OpenAI响应对象中.
     */
    private function addImageDataToResponse(
        OpenAIFormatResponse $response,
        array $volcengineResult,
        ImageGenerateRequest $imageGenerateRequest
    ): void {
        // 使用Redis锁确保并发安全
        $lockOwner = $this->lockResponse($response);
        try {
            // 从火山方舟响应中提取数据
            if (empty($volcengineResult['data']) || ! is_array($volcengineResult['data'])) {
                return;
            }

            $currentData = $response->getData();
            $currentUsage = $response->getUsage() ?? new ImageUsage();
            $addedImageCount = 0;

            foreach ($volcengineResult['data'] as $item) {
                if (! empty($item['url'])) {
                    // 处理水印
                    $processedUrl = $item['url'];
                    try {
                        $processedUrl = $this->watermarkProcessor->addWatermarkToUrl($item['url'], $imageGenerateRequest);
                    } catch (Exception $e) {
                        $this->logger->error('VolcengineArk添加图片数据：水印处理失败', [
                            'error' => $e->getMessage(),
                            'url' => $item['url'],
                        ]);
                        // 水印处理失败时使用原始URL
                    }

                    $currentData[] = [
                        'url' => $processedUrl,
                        'size' => $item['size'] ?? null,
                    ];
                    ++$addedImageCount;
                }
            }

            // 累计usage信息
            if (! empty($volcengineResult['usage']) && is_array($volcengineResult['usage'])) {
                $this->accumulateUsage($currentUsage, $volcengineResult['usage'], $addedImageCount);
            }

            // 更新响应对象
            $response->setData($currentData);
            $response->setUsage($currentUsage);
        } finally {
            // 确保锁一定会被释放
            $this->unlockResponse($response, $lockOwner);
        }
    }

    private function accumulateUsage(ImageUsage $currentUsage, array $usage, int $fallbackGeneratedImages): void
    {
        $tokenUsage = $this->extractTokenUsage($usage);
        $currentUsage->addTokenUsage(
            $tokenUsage['prompt_tokens'],
            $tokenUsage['completion_tokens'],
            $tokenUsage['thoughts_tokens'],
            $tokenUsage['total_tokens']
        );
        $currentUsage->addGeneratedImages($this->resolveGeneratedImages($usage, $fallbackGeneratedImages));
    }

    /**
     * @return array{prompt_tokens: int, completion_tokens: int, thoughts_tokens: int, total_tokens: int}
     */
    private function extractTokenUsage(array $usage): array
    {
        // 火山方舟生图 usage 当前可能返回 input/output，也可能接近 OpenAI 的 prompt/completion，统一转成内部 token 结构。
        $promptTokens = (int) ($usage['prompt_tokens'] ?? $usage['input_tokens'] ?? 0);
        $completionTokens = (int) ($usage['completion_tokens'] ?? $usage['output_tokens'] ?? 0);
        $thoughtsTokens = (int) ($usage['thoughts_tokens'] ?? 0);
        $totalTokens = (int) ($usage['total_tokens'] ?? 0);

        if ($totalTokens <= 0 && ($promptTokens > 0 || $completionTokens > 0 || $thoughtsTokens > 0)) {
            $totalTokens = $promptTokens + $completionTokens + $thoughtsTokens;
        }
        if ($promptTokens <= 0 && $totalTokens > 0 && $completionTokens > 0) {
            $promptTokens = max(0, $totalTokens - $completionTokens - $thoughtsTokens);
        }
        if ($completionTokens <= 0 && $totalTokens > 0 && $promptTokens > 0) {
            $completionTokens = max(0, $totalTokens - $promptTokens - $thoughtsTokens);
        }

        return [
            'prompt_tokens' => $promptTokens,
            'completion_tokens' => $completionTokens,
            'thoughts_tokens' => $thoughtsTokens,
            'total_tokens' => $totalTokens,
        ];
    }

    private function resolveGeneratedImages(array $usage, int $fallbackGeneratedImages): int
    {
        return (int) ($usage['generated_images'] ?? $usage['image_count'] ?? $fallbackGeneratedImages);
    }

    private function generateImageRawInternal(ImageGenerateRequest $imageGenerateRequest): array
    {
        if (! $imageGenerateRequest instanceof VolcengineArkRequest) {
            $this->logger->error('VolcengineArk文生图：无效的请求类型', ['class' => get_class($imageGenerateRequest)]);
            ExceptionBuilder::throw(ImageGenerateErrorCode::GENERAL_ERROR);
        }

        try {
            $result = $this->requestImageGeneration($imageGenerateRequest);
            $this->validateVolcengineArkResponse($result);
        } catch (Exception $e) {
            $this->logger->error('VolcengineArk文生图：图片生成失败', [
                'error' => $e->getMessage(),
            ]);
            ExceptionBuilder::throw(ImageGenerateErrorCode::NO_VALID_IMAGE, $e->getMessage());
        }

        return [
            [
                'data' => $result,
            ],
        ];
    }

    /**
     * 为火山引擎Ark原始数据添加水印.
     */
    private function processVolcengineArkRawDataWithWatermark(array $rawData, ImageGenerateRequest $imageGenerateRequest): array
    {
        foreach ($rawData as $index => &$result) {
            if (! isset($result['data']['data']) || empty($result['data']['data'])) {
                continue;
            }

            try {
                // VolcengineArk 返回的是 URL 格式，使用URL水印处理
                foreach ($result['data']['data'] as $i => &$item) {
                    if (isset($item['url'])) {
                        $item['url'] = $this->watermarkProcessor->addWatermarkToUrl($item['url'], $imageGenerateRequest);
                    }
                }
                unset($item);
            } catch (Exception $e) {
                $this->logger->error('VolcengineArk图片水印处理失败', [
                    'index' => $index,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $rawData;
    }
}
