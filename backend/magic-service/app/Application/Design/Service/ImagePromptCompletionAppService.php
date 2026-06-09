<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Service;

use App\Application\ModelGateway\MicroAgent\MicroAgent;
use App\Application\ModelGateway\MicroAgent\MicroAgentFactory;
use App\Domain\Design\Entity\DesignDataIsolation;
use App\Domain\Design\Factory\PathFactory;
use App\Domain\File\Service\FileDomainService;
use App\Domain\ModelGateway\Entity\ValueObject\ModelGatewayDataIsolation;
use App\Domain\ModelGateway\Entity\ValueObject\SourceId;
use App\ErrorCode\DesignErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use Dtyq\CloudFile\Kernel\Struct\ImageProcessOptions;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MemberRole;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\ProjectDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\TaskFileDomainService;
use Hyperf\Logger\LoggerFactory;
use Hyperf\Odin\Api\Response\ChatCompletionResponse;
use Hyperf\Odin\Message\AssistantMessage;
use Hyperf\Odin\Message\UserMessage;
use Hyperf\Odin\Message\UserMessageContent;
use Psr\Log\LoggerInterface;
use Qbhy\HyperfAuth\Authenticatable;
use Throwable;

class ImagePromptCompletionAppService extends DesignAppService
{
    private const string TOOL_NAME = 'complete_image_prompt';

    private const int MAX_PROMPT_LENGTH = 2000;

    protected readonly LoggerInterface $logger;

    public function __construct(
        private readonly ProjectDomainService $projectDomainService,
        private readonly TaskFileDomainService $taskFileDomainService,
        private readonly FileDomainService $fileDomainService,
        private readonly MicroAgentFactory $microAgentFactory,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get(get_class($this));
    }

    /**
     * 根据前端组装的场景提示词和可选参考图，补全一段可直接用于生图的提示词。
     *
     * @param list<string> $referenceImages
     * @param list<array<string, mixed>> $referenceImageOptions
     */
    public function complete(
        Authenticatable $authenticatable,
        int $projectId,
        string $userPrompt,
        ?string $modelId = null,
        array $referenceImages = [],
        array $referenceImageOptions = [],
    ): string {
        $dataIsolation = $this->createDesignDataIsolation($authenticatable);
        $project = $this->projectDomainService->getProjectNotUserId($projectId);
        if (! $project) {
            ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_prompt_completion.project_not_exists', ['project_id' => $projectId]);
        }
        $this->validateRoleHigherOrEqual($dataIsolation, $project, MemberRole::VIEWER);

        $agentFilePath = BASE_PATH . '/app/Application/Design/MicroAgent/ImagePromptCompleter.agent.yaml';
        $basePromptCompleterAgent = clone $this->microAgentFactory->getAgent('ImagePromptCompleter', $agentFilePath);
        if (! $basePromptCompleterAgent->isEnabled()) {
            $this->logger->warning('Image prompt completer agent is disabled', ['project_id' => $projectId]);
            ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_prompt_completion.agent_disabled');
        }
        $basePromptCompleterAgent->setTools($this->getImagePromptCompletionTools());

        $promptCompleterAgent = clone $basePromptCompleterAgent;
        $modelId = trim((string) $modelId);
        if ($modelId !== '') {
            $promptCompleterAgent->setModelId($modelId);
        }

        $modelGatewayDataIsolation = $this->createModelGatewayDataIsolation($dataIsolation);
        $referenceImageUrls = $this->resolveReferenceImageUrls($dataIsolation, $projectId, $referenceImages, $referenceImageOptions);
        $userMessage = $this->buildUserMessage($userPrompt, $referenceImageUrls);

        if ($modelId !== '') {
            try {
                $response = $this->requestPromptCompletion($promptCompleterAgent, $modelGatewayDataIsolation, $dataIsolation, $projectId, $userMessage);
                return $this->extractPromptFromToolCall($response);
            } catch (Throwable $throwable) {
                $this->logger->warning('ImagePromptCompletionModelOverrideFailed', [
                    'error' => $throwable->getMessage(),
                    'project_id' => $projectId,
                    'reference_image_count' => count($referenceImages),
                    'model_id' => $modelId,
                ]);
            }

            try {
                $response = $this->requestPromptCompletion($basePromptCompleterAgent, $modelGatewayDataIsolation, $dataIsolation, $projectId, $userMessage);
                return $this->extractPromptFromToolCall($response);
            } catch (Throwable $throwable) {
                $this->logger->error('ImagePromptCompletionFallbackFailed', [
                    'error' => $throwable->getMessage(),
                    'project_id' => $projectId,
                    'reference_image_count' => count($referenceImages),
                    'model_id' => $basePromptCompleterAgent->getModelId(),
                ]);
                return '';
            }
        }

        try {
            $response = $this->requestPromptCompletion($basePromptCompleterAgent, $modelGatewayDataIsolation, $dataIsolation, $projectId, $userMessage);
        } catch (Throwable $throwable) {
            $this->logger->error('ImagePromptCompletionFailed', [
                'error' => $throwable->getMessage(),
                'project_id' => $projectId,
                'reference_image_count' => count($referenceImages),
                'model_id' => $basePromptCompleterAgent->getModelId(),
            ]);
            ExceptionBuilder::throw(DesignErrorCode::ThirdPartyServiceError, 'design.image_prompt_completion.failed');
        }

        return $this->extractPromptFromToolCall($response);
    }

    /**
     * @return list<string>
     */
    private function resolveReferenceImageUrls(
        DesignDataIsolation $dataIsolation,
        int $projectId,
        array $referenceImages,
        array $referenceImageOptions,
    ): array {
        if ($referenceImages === []) {
            return [];
        }

        $filePrefix = $this->fileDomainService->getFullPrefix($dataIsolation->getCurrentOrganizationCode());
        $workspacePrefix = PathFactory::getWorkspacePrefix($filePrefix, $projectId);
        $urls = [];

        foreach ($referenceImages as $referenceImage) {
            $filePath = trim((string) $referenceImage);
            if ($filePath === '') {
                ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_prompt_completion.reference_image_not_exists', ['file_path' => $referenceImage]);
            }

            $relativePath = $this->normalizeWorkspacePath($filePath, $workspacePrefix);
            $imageOptions = $this->findImageOptions($referenceImageOptions, $filePath, $relativePath, $workspacePrefix);
            $linkOptions = $this->buildLinkOptionsFromImageOptions($imageOptions);

            if ($this->isPrivateReferencePath($filePath, $filePrefix, $workspacePrefix)) {
                $imageUrl = $this->fileDomainService->getLink(
                    $dataIsolation->getCurrentOrganizationCode(),
                    ltrim($filePath, '/'),
                    StorageBucketType::Private,
                    options: $linkOptions,
                )?->getUrl();
            } else {
                $taskFile = $this->taskFileDomainService->findEntityByRelativePath($projectId, $relativePath);
                if (! $taskFile || $taskFile->getIsDirectory()) {
                    ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_prompt_completion.reference_image_not_exists', ['file_path' => $filePath]);
                }

                $imageUrl = $this->fileDomainService->getLink(
                    $dataIsolation->getCurrentOrganizationCode(),
                    $taskFile->getFileKey(),
                    StorageBucketType::SandBox,
                    options: $linkOptions,
                )?->getUrl();
            }

            if (empty($imageUrl)) {
                ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_prompt_completion.cannot_get_reference_image_url', ['file_path' => $filePath]);
            }
            $urls[] = $imageUrl;
        }

        return $urls;
    }

    /**
     * @param list<string> $referenceImageUrls
     */
    private function buildUserMessage(string $userPrompt, array $referenceImageUrls): UserMessage
    {
        $userMessage = new UserMessage();
        foreach ($referenceImageUrls as $imageUrl) {
            $userMessage->addContent(UserMessageContent::imageUrl($imageUrl));
        }
        $userMessage->addContent(UserMessageContent::text(trim($userPrompt)));

        return $userMessage;
    }

    private function requestPromptCompletion(
        MicroAgent $promptCompleterAgent,
        ModelGatewayDataIsolation $modelGatewayDataIsolation,
        DesignDataIsolation $dataIsolation,
        int $projectId,
        UserMessage $userMessage,
    ): ChatCompletionResponse {
        return $promptCompleterAgent->easyCall(
            dataIsolation: $modelGatewayDataIsolation,
            systemReplace: [
                'outputLanguage' => $modelGatewayDataIsolation->getLanguage(),
            ],
            userPrompt: $userMessage,
            businessParams: [
                'organization_id' => $dataIsolation->getCurrentOrganizationCode(),
                'user_id' => $dataIsolation->getCurrentUserId(),
                'project_id' => $projectId,
                'source_id' => SourceId::DESIGN_IMAGE_PROMPT_COMPLETION,
            ]
        );
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function getImagePromptCompletionTools(): array
    {
        return [
            [
                'type' => 'function',
                'function' => [
                    'name' => self::TOOL_NAME,
                    'description' => '返回补全后的生图提示词',
                    'parameters' => [
                        'type' => 'object',
                        'properties' => [
                            'prompt' => [
                                'type' => 'string',
                                'description' => '补全后的生图提示词，只包含可直接用于生图的提示词内容',
                            ],
                        ],
                        'required' => ['prompt'],
                    ],
                ],
            ],
        ];
    }

    private function extractPromptFromToolCall(ChatCompletionResponse $response): string
    {
        $assistantMessage = $response->getFirstChoice()?->getMessage();
        if (! $assistantMessage instanceof AssistantMessage || ! $assistantMessage->hasToolCalls()) {
            $this->logger->warning('Image prompt completion response has no tool call');
            ExceptionBuilder::throw(DesignErrorCode::ThirdPartyServiceError, 'design.image_prompt_completion.invalid_response');
        }

        foreach ($assistantMessage->getToolCalls() as $toolCall) {
            if ($toolCall->getName() !== self::TOOL_NAME) {
                continue;
            }

            $arguments = $toolCall->getArguments();
            $prompt = $this->sanitizePrompt((string) ($arguments['prompt'] ?? ''));
            if ($prompt === '') {
                $this->logger->warning('Image prompt completion tool call has empty prompt', ['arguments' => $arguments]);
                ExceptionBuilder::throw(DesignErrorCode::ThirdPartyServiceError, 'design.image_prompt_completion.invalid_response');
            }
            return $prompt;
        }

        $this->logger->warning('Image prompt completion response has no matched tool call');
        ExceptionBuilder::throw(DesignErrorCode::ThirdPartyServiceError, 'design.image_prompt_completion.invalid_response');
    }

    private function sanitizePrompt(string $prompt): string
    {
        $prompt = stripcslashes(trim($prompt));
        $prompt = preg_replace('/^```[a-zA-Z0-9_-]*\s*|\s*```$/u', '', $prompt) ?? $prompt;
        $prompt = trim($prompt);

        $decoded = json_decode($prompt, true);
        if (is_array($decoded) && isset($decoded['prompt']) && is_string($decoded['prompt'])) {
            $prompt = $decoded['prompt'];
        }

        $prompt = preg_replace('/^(提示词|prompt)\s*[:：]\s*/iu', '', trim($prompt)) ?? $prompt;
        $prompt = trim($prompt, " \t\n\r\0\x0B\"'“”‘’");
        $prompt = preg_replace('/\s+/u', ' ', $prompt) ?? $prompt;
        $prompt = trim($prompt);

        if (mb_strlen($prompt) > self::MAX_PROMPT_LENGTH) {
            return mb_substr($prompt, 0, self::MAX_PROMPT_LENGTH);
        }
        return $prompt;
    }

    /**
     * @param array<string, mixed> $imageOptions
     * @return array<string, mixed>
     */
    private function buildLinkOptionsFromImageOptions(array $imageOptions): array
    {
        $imageProcessOptions = new ImageProcessOptions()->quality(80)->format('webp');
        $crop = $imageOptions['crop'] ?? null;
        if (is_array($crop) && $crop !== []) {
            $width = (int) round((float) ($crop['width'] ?? 0));
            $height = (int) round((float) ($crop['height'] ?? 0));
            if ($width > 0 && $height > 0) {
                $imageProcessOptions->crop([
                    'width' => $width,
                    'height' => $height,
                    'x' => (int) round((float) ($crop['x'] ?? 0)),
                    'y' => (int) round((float) ($crop['y'] ?? 0)),
                ]);
            }
        }

        return ['image' => $imageProcessOptions];
    }

    /**
     * @param list<array<string, mixed>> $referenceImageOptions
     * @return array<string, mixed>
     */
    private function findImageOptions(
        array $referenceImageOptions,
        string $originalPath,
        string $relativePath,
        string $workspacePrefix,
    ): array {
        foreach ($referenceImageOptions as $item) {
            if (! is_array($item)) {
                continue;
            }

            $optionPath = isset($item['path']) ? trim((string) $item['path']) : '';
            $normalizedOptionPath = $optionPath === '' ? '' : $this->normalizeWorkspacePath($optionPath, $workspacePrefix);
            if ($optionPath !== $originalPath && $optionPath !== $relativePath && $normalizedOptionPath !== $relativePath) {
                continue;
            }

            unset($item['path']);
            return $item;
        }
        return [];
    }

    private function normalizeWorkspacePath(string $filePath, string $workspacePrefix): string
    {
        $filePath = trim($filePath);
        $workspacePrefix = rtrim($workspacePrefix, '/');
        if (str_starts_with($filePath, $workspacePrefix)) {
            return substr($filePath, strlen($workspacePrefix)) ?: '/';
        }

        $filePathWithoutLeadingSlash = ltrim($filePath, '/');
        $workspacePrefixWithoutLeadingSlash = ltrim($workspacePrefix, '/');
        if (str_starts_with($filePathWithoutLeadingSlash, $workspacePrefixWithoutLeadingSlash)) {
            return substr($filePathWithoutLeadingSlash, strlen($workspacePrefixWithoutLeadingSlash)) ?: '/';
        }

        return $filePath;
    }

    private function isPrivateReferencePath(string $filePath, string $filePrefix, string $workspacePrefix): bool
    {
        $filePath = ltrim($filePath, '/');
        $filePrefix = ltrim($filePrefix, '/');
        $workspacePrefix = ltrim($workspacePrefix, '/');

        if (str_contains($filePath, 'design-mark/')) {
            return true;
        }

        return str_starts_with($filePath, $filePrefix) && ! str_starts_with($filePath, $workspacePrefix);
    }
}
