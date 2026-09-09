<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI;

use App\ErrorCode\VideoGenerateErrorCode;
use GuzzleHttp\Exception\RequestException;
use RuntimeException;
use Throwable;

final class ProviderVideoException extends RuntimeException
{
    private const int MAX_ORIGINAL_ERROR_MESSAGE_LENGTH = 1000;

    public function __construct(
        VideoGenerateErrorCode $code,
        string $message,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, $code->value, $previous);
    }

    public function isRetry(): bool
    {
        $status = $this->getHttpStatus();
        return $status === null || $status < 400 || $status >= 500 || in_array($status, [408, 409, 429], true);
    }

    public function getHttpStatus(): ?int
    {
        return $this->getRequestException()?->getResponse()?->getStatusCode();
    }

    public function getRequestException(): ?RequestException
    {
        $previous = $this->getPrevious();
        return $previous instanceof RequestException ? $previous : null;
    }

    public function getResponseContent(): ?string
    {
        $response = $this->getRequestException()?->getResponse();
        if ($response === null) {
            return null;
        }

        $body = $response->getBody();
        if ($body->isSeekable()) {
            $body->rewind();
        }
        $content = (string) $body;
        if ($body->isSeekable()) {
            $body->rewind();
        }

        return $content;
    }

    public function getErrorCode(): string
    {
        return (string) $this->getCode();
    }

    public function getVideoErrorCode(): VideoGenerateErrorCode
    {
        return VideoGenerateErrorCode::from($this->getCode());
    }

    public function getOriginalErrorMessage(): string
    {
        $responseContent = $this->getResponseContent();
        if ($responseContent === null) {
            return '';
        }

        $sanitizedErrorMessage = preg_replace('/[\x00-\x1F\x7F]+/', ' ', $responseContent);
        if (! is_string($sanitizedErrorMessage)) {
            return '';
        }

        return mb_substr(trim($sanitizedErrorMessage), 0, self::MAX_ORIGINAL_ERROR_MESSAGE_LENGTH, 'UTF-8');
    }
}
