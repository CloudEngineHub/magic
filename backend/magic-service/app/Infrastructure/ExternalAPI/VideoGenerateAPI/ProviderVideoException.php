<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI;

use GuzzleHttp\Exception\RequestException;
use RuntimeException;
use Throwable;

final class ProviderVideoException extends RuntimeException
{
    private const int MAX_ORIGINAL_ERROR_MESSAGE_LENGTH = 1000;

    private function __construct(
        string $message,
        private readonly bool $retriable,
        private readonly ?int $httpStatus = null,
        private readonly ?string $errorCode = null,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public static function retriable(string $message, ?Throwable $previous = null, ?int $httpStatus = null, ?string $errorCode = null): self
    {
        return new self($message, true, $httpStatus, $errorCode, $previous);
    }

    public static function nonRetriable(string $message, ?Throwable $previous = null, ?int $httpStatus = null, ?string $errorCode = null): self
    {
        return new self($message, false, $httpStatus, $errorCode, $previous);
    }

    public function isRetriable(): bool
    {
        return $this->retriable;
    }

    public function getHttpStatus(): ?int
    {
        return $this->httpStatus ?? $this->getRequestException()?->getResponse()?->getStatusCode();
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

    public function getErrorCode(): ?string
    {
        return $this->errorCode;
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
