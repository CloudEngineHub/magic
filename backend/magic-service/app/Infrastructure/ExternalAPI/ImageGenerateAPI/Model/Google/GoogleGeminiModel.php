<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\Google;

use App\Domain\Provider\DTO\Item\GoogleProviderConfigItem;
use App\ErrorCode\ImageGenerateErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\AbstractImageGenerate;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\ImageGenerateType;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\Google\Client\GoogleGeminiInterface;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Request\ImageGenerateRequest;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\ImageGenerateResponse;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\ImageUsage;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\OpenAIFormatResponse;
use App\Infrastructure\Util\File\ImageBase64DataUriParser;
use Exception;
use Hyperf\Retry\Annotation\Retry;
use Throwable;

use function Hyperf\Translation\__;

class GoogleGeminiModel extends AbstractImageGenerate
{
    /** Google Gemini 生图接口客户端。 */
    protected GoogleGeminiInterface $api;

    /** Google 生图参考图传输策略。 */
    protected string $referenceImageTransport;

    /** Google 生图参考图 Base64 准备器。 */
    protected GoogleReferenceImagePreparer $referenceImagePreparer;

    public function __construct(array $serviceProviderConfig)
    {
        $proxyUrl = $serviceProviderConfig['proxy_url'] ?? null;

        $this->api = GoogleGeminiFactory::create($serviceProviderConfig, $serviceProviderConfig['model_version'], $proxyUrl);

        $this->referenceImageTransport = GoogleProviderConfigItem::normalizeReferenceImageTransport(
            $serviceProviderConfig['reference_image_transport'] ?? null
        );

        $this->referenceImagePreparer = new GoogleReferenceImagePreparer();
    }

    public function generateImageRaw(ImageGenerateRequest $imageGenerateRequest): array
    {
        return $this->generateImageRawInternal($imageGenerateRequest);
    }

    public function setAK(string $ak)
    {
        // Google Gemini 不需要AK
    }

    public function setSK(string $sk)
    {
        // Google Gemini 不需要SK
    }

    public function setApiKey(string $apiKey)
    {
        // Google Gemini 不需要SK
    }

    public function generateImageRawWithWatermark(ImageGenerateRequest $imageGenerateRequest): array
    {
        $rawData = $this->generateImageRaw($imageGenerateRequest);
        return $this->processGoogleGeminiRawDataWithWatermark($rawData, $imageGenerateRequest);
    }

    /**
     * 生成图像并返回OpenAI格式响应 - Google Gemini版本.
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
        if (! $imageGenerateRequest instanceof GoogleGeminiRequest) {
            $this->logger->error('GoogleGemini OpenAI格式生图：无效的请求类型', ['class' => get_class($imageGenerateRequest)]);
            return $response; // 返回空数据响应
        }

        // 3. 单次处理：Google 当前链路只生成一张图
        if ($imageGenerateRequest->getGenerateNum() > 1) {
            $this->logger->warning('GoogleGemini OpenAI格式生图：不支持一次生成多张图片，将只生成一张');
        }
        $originalReferImages = $imageGenerateRequest->getReferImages();

        try {
            $this->prepareBase64ReferenceImages($imageGenerateRequest);
            try {
                $result = $this->requestImageGeneration($imageGenerateRequest);
                $this->validateGoogleGeminiResponse($result);
                $this->addImageDataToResponseGemini($response, $result, $imageGenerateRequest);
            } catch (Exception $e) {
                if (! $response->hasError()) {
                    $response->setProviderErrorCode($e->getCode());
                    $response->setProviderErrorMessage($e->getMessage());
                }

                $this->logger->error('GoogleGemini OpenAI格式生图：请求失败', [
                    'error_code' => $e->getCode(),
                    'error_message' => $e->getMessage(),
                ]);
            }
        } finally {
            $imageGenerateRequest->setReferImages($originalReferImages);
        }

        // 4. 记录最终结果
        $this->logger->info('GoogleGemini OpenAI格式生图：处理完成', [
            '总请求数' => 1,
            '成功图片数' => count($response->getData()),
            '是否有错误' => $response->hasError(),
            '错误码' => $response->getProviderErrorCode(),
            '错误消息' => $response->getProviderErrorMessage(),
        ]);

        return $response;
    }

    public function getProviderName(): string
    {
        return 'google_gemini';
    }

    protected function generateImageInternal(ImageGenerateRequest $imageGenerateRequest): ImageGenerateResponse
    {
        $rawResults = $this->generateImageRawInternal($imageGenerateRequest);

        $imageData = [];
        foreach ($rawResults as $index => $result) {
            if (! empty($result['imageData'])) {
                $imageData[$index] = $result['imageData'];
            }
        }

        if (empty($imageData)) {
            $this->logger->error('Google Gemini文生图：所有图片生成均失败', ['rawResults' => $rawResults]);
            ExceptionBuilder::throw(ImageGenerateErrorCode::NO_VALID_IMAGE);
        }

        ksort($imageData);
        $imageData = array_values($imageData);

        return new ImageGenerateResponse(ImageGenerateType::BASE_64, $imageData);
    }

    protected function getAlertPrefix(): string
    {
        return 'Google Gemini API';
    }

    protected function checkBalance(): float
    {
        // Google Gemini API 目前没有余额查询接口，返回默认值
        return 999.0;
    }

    #[Retry(
        maxAttempts: self::GENERATE_RETRY_COUNT,
        base: self::GENERATE_RETRY_TIME
    )]
    protected function requestImageGeneration(GoogleGeminiRequest $imageGenerateRequest): array
    {
        $prompt = $imageGenerateRequest->getPrompt();
        $modelId = $imageGenerateRequest->getModel();
        $referImages = array_slice($imageGenerateRequest->getReferImages(), 0, 14);

        // 如果请求中指定了模型，则动态设置
        if (! empty($modelId)) {
            $this->api->setModelId($modelId);
        }

        // 构建 API 配置
        $config = $imageGenerateRequest->getGenerationConfig();

        try {
            // 如果有参考图像，则执行图像编辑
            if (! empty($referImages)) {
                return $this->processImageEdit($referImages, $prompt, $config);
            }

            // 调用 API 生成图片
            return $this->api->generateContent($prompt, [], $config);
        } catch (Exception $e) {
            $this->logger->warning('Google Gemini图片生成：调用图片生成接口失败', ['error' => $e->getMessage(), 'TraceAsString' => $e->getTraceAsString()]);
            ExceptionBuilder::throw(ImageGenerateErrorCode::GENERAL_ERROR, $e->getMessage());
        }
    }

    /**
     * 处理图像编辑，支持多张参考图像（最多14张）.
     *
     * @param array $referImageUrls 参考图像URL数组
     * @param string $instructions 编辑指令
     * @param array $config 生成配置
     * @return array API响应结果
     */
    private function processImageEdit(array $referImageUrls, string $instructions, array $config = []): array
    {
        // 限制最多14张参考图像
        $referImageUrls = array_slice($referImageUrls, 0, 14);

        $sortedImageList = [];
        foreach ($referImageUrls as $referImageUrl) {
            $sortedImageList[] = $this->formatReferenceImage($referImageUrl);
        }
        // 调用API进行多图编辑
        return $this->api->generateContent($instructions, $sortedImageList, $config);
    }

    /**
     * 将原始图片地址或已准备的 Base64 数据转换为 Gemini 请求结构。
     *
     * @param array{type: 'base64', mimeType: string, data: string}|string $image
     */
    private function formatReferenceImage(array|string $image): array
    {
        if (is_array($image)) {
            return $image;
        }

        $base64Image = ImageBase64DataUriParser::parseDecoded($image);
        if ($base64Image !== null) {
            return [
                'type' => 'base64',
                'mimeType' => $base64Image['mime_type'],
                'data' => $base64Image['base64_data'],
            ];
        }

        return [
            'type' => 'fileData',
            'fileUri' => $image,
            'mimeType' => $this->detectMimeTypeFromUrl($image),
        ];
    }

    private function detectMimeTypeFromUrl(string $url): string
    {
        $extension = strtolower(pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));

        return match ($extension) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            default => 'image/jpeg'
        };
    }

    /**
     * Base64 模式在生成请求前只准备一次，避免同一批图片重复下载。
     */
    private function prepareBase64ReferenceImages(GoogleGeminiRequest $request): void
    {
        if ($this->referenceImageTransport !== GoogleProviderConfigItem::REFERENCE_IMAGE_TRANSPORT_BASE64) {
            return;
        }

        $request->setReferImages($this->referenceImagePreparer->prepare($request->getReferImages()));
    }

    private function generateImageRawInternal(ImageGenerateRequest $imageGenerateRequest): array
    {
        if (! $imageGenerateRequest instanceof GoogleGeminiRequest) {
            $this->logger->error('Google Gemini文生图：无效的请求类型', ['class' => get_class($imageGenerateRequest)]);
            ExceptionBuilder::throw(ImageGenerateErrorCode::GENERAL_ERROR);
        }

        // Google Gemini 当前链路只支持单次生成一张图
        if ($imageGenerateRequest->getGenerateNum() > 1) {
            $this->logger->warning('Google Gemini文生图：不支持一次生成多张图片，将只生成一张');
        }
        $rawResults = [];
        $errors = [];

        $originalReferImages = $imageGenerateRequest->getReferImages();
        try {
            $this->prepareBase64ReferenceImages($imageGenerateRequest);
            try {
                $result = $this->requestImageGeneration($imageGenerateRequest);
                $imageData = $this->extractImageDataFromResponse($result);
                $rawResults[] = ['imageData' => $imageData];
            } catch (Exception $e) {
                $errors[] = $e->getMessage();
                $this->logger->error('Google Gemini文生图：图片生成失败', [
                    'error' => $e->getMessage(),
                ]);
            }
        } finally {
            $imageGenerateRequest->setReferImages($originalReferImages);
        }

        if (empty($rawResults)) {
            $errorMessage = implode('; ', $errors);
            $this->logger->error('Google Gemini文生图：所有图片生成均失败', ['errors' => $errors]);
            ExceptionBuilder::throw(ImageGenerateErrorCode::NO_VALID_IMAGE, $errorMessage);
        }

        ksort($rawResults);
        return array_values($rawResults);
    }

    private function extractImageDataFromResponse(array $result): string
    {
        if (! isset($result['candidates']) || ! is_array($result['candidates'])) {
            throw new Exception(__('image_generate.response_missing_candidates'));
        }

        foreach ($result['candidates'] as $candidateIndex => $candidate) {
            if (! isset($candidate['content']['parts'])) {
                continue;
            }

            foreach ($candidate['content']['parts'] as $partIndex => $part) {
                if (($part['thought'] ?? false) === true) {
                    $this->logSkippedThoughtImagePart($candidateIndex, $partIndex, 'extract_image');
                    continue;
                }
                if (isset($part['inlineData']['data'])) {
                    return $part['inlineData']['data'];
                }
            }
        }

        $this->logger->error('Google Gemini生图错误', [
            'result' => $result,
        ]);
        throw new Exception(__('image_generate.response_missing_image_data'));
    }

    private function logSkippedThoughtImagePart(int|string $candidateIndex, int|string $partIndex, string $stage): void
    {
        try {
            $this->logger->info('Google Gemini响应：检测到思考图，已过滤', [
                'stage' => $stage,
                'candidate_index' => $candidateIndex,
                'part_index' => $partIndex,
            ]);
        } catch (Throwable) {
            // Diagnostic logging must never affect image extraction.
        }
    }

    private function processGoogleGeminiRawDataWithWatermark(array $rawData, ImageGenerateRequest $imageGenerateRequest): array
    {
        foreach ($rawData as $index => &$result) {
            if (! isset($result['imageData'])) {
                continue;
            }

            try {
                $result['imageData'] = $this->watermarkProcessor->addWatermarkToBase64($result['imageData'], $imageGenerateRequest);
            } catch (Exception $e) {
                $this->logger->error('Google Gemini图片水印处理失败', [
                    'index' => $index,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $rawData;
    }

    /**
     * 验证Google Gemini API响应数据格式.
     */
    private function validateGoogleGeminiResponse(array $result): void
    {
        if (! isset($result['candidates']) || ! is_array($result['candidates'])) {
            throw new Exception(__('image_generate.response_format_error_missing_candidates'));
        }

        $hasValidImage = false;
        foreach ($result['candidates'] as $candidateIndex => $candidate) {
            if (isset($candidate['content']['parts']) && is_array($candidate['content']['parts'])) {
                foreach ($candidate['content']['parts'] as $partIndex => $part) {
                    if (($part['thought'] ?? false) === true) {
                        $this->logSkippedThoughtImagePart($candidateIndex, $partIndex, 'validate_response');
                        continue;
                    }
                    if (isset($part['inlineData']['data']) && ! empty($part['inlineData']['data'])) {
                        $hasValidImage = true;
                        break 2;
                    }
                }
            }
        }

        if (! $hasValidImage) {
            $this->logger->error('Google Gemini生图错误', [
                'result' => $result,
            ]);
            throw new Exception(__('image_generate.response_format_error_missing_image'));
        }
    }

    /**
     * 将Google Gemini图片数据添加到OpenAI响应对象中（转换为URL格式）.
     */
    private function addImageDataToResponseGemini(
        OpenAIFormatResponse $response,
        array $geminiResult,
        ImageGenerateRequest $imageGenerateRequest
    ): void {
        // 使用Redis锁确保并发安全
        $lockOwner = $this->lockResponse($response);
        try {
            // 使用现有方法提取图像数据
            $imageBase64 = $this->extractImageDataFromResponse($geminiResult);

            $currentData = $response->getData();
            $currentUsage = $response->getUsage() ?? new ImageUsage();

            // 水印处理（会将base64转换为URL）
            $processedUrl = $imageBase64;
            try {
                $processedUrl = $this->watermarkProcessor->addWatermarkToBase64($imageBase64, $imageGenerateRequest);
            } catch (Exception $e) {
                $this->logger->error('GoogleGemini添加图片数据：水印处理失败', [
                    'error' => $e->getMessage(),
                ]);
                // 水印处理失败时使用原始base64数据（但这通常不应该发生）
            }

            // 只返回URL格式，与其他模型保持一致
            $currentData[] = [
                'url' => $processedUrl,
            ];

            $currentUsage->addGeneratedImages(1);

            // 累计usage信息 - 从usageMetadata中提取
            if (! empty($geminiResult['usageMetadata']) && is_array($geminiResult['usageMetadata'])) {
                $tokenUsage = $this->extractTokenUsage($geminiResult['usageMetadata']);
                $currentUsage->addTokenUsage(
                    $tokenUsage['prompt_tokens'],
                    $tokenUsage['completion_tokens'],
                    $tokenUsage['thoughts_tokens'],
                    $tokenUsage['total_tokens']
                );
            }

            // 更新响应对象
            $response->setData($currentData);
            $response->setUsage($currentUsage);
        } finally {
            // 确保锁一定会被释放
            $this->unlockResponse($response, $lockOwner);
        }
    }

    /**
     * @return array{prompt_tokens: int, completion_tokens: int, thoughts_tokens: int, total_tokens: int}
     */
    private function extractTokenUsage(array $usageMetadata): array
    {
        return [
            'prompt_tokens' => (int) ($usageMetadata['promptTokenCount'] ?? 0),
            'completion_tokens' => (int) ($usageMetadata['candidatesTokenCount'] ?? 0),
            'thoughts_tokens' => (int) ($usageMetadata['thoughtsTokenCount'] ?? 0),
            'total_tokens' => (int) ($usageMetadata['totalTokenCount'] ?? 0),
        ];
    }
}
