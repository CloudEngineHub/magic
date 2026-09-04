<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MCP\Facade\Public;

use App\Application\MCP\Authorization\MCPAuthorizationBindingService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\HttpServer\Contract\ResponseInterface as HttpResponse;
use Psr\Http\Message\ResponseInterface;
use Throwable;

/**
 * MCP Authorization magic-service 公网回调接口。
 */
class MCPAuthorizationCallbackPublicApi
{
    public function __construct(
        private readonly RequestInterface $request,
        private readonly HttpResponse $response,
        private readonly MCPAuthorizationBindingService $bindingService
    ) {
    }

    /**
     * 接收授权服务器回调并在 magic-service 内完成 Token 交换和凭据绑定。
     */
    public function callback(): ResponseInterface
    {
        try {
            $this->bindingService->bindPublic(
                (string) $this->request->input('code', ''),
                (string) $this->request->input('state', ''),
                $this->request->input('iss'),
                $this->request->input('error')
            );
        } catch (Throwable) {
            return $this->response->html($this->renderPage(
                '授权处理失败',
                'MCP 授权回调处理失败，请返回原页面重试。',
                '请确认授权服务器配置正确，或重新发起授权。',
                false
            ));
        }

        return $this->response->html($this->renderPage(
            '授权已完成',
            'MCP 授权已完成，可以关闭此页面。',
            '页面将在 10 秒后自动关闭，你也可以回到原页面继续操作。',
            true
        ));
    }

    /**
     * 渲染授权回调结果页面。
     */
    private function renderPage(string $title, string $message, string $description, bool $autoClose): string
    {
        $safeTitle = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeMessage = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeDescription = htmlspecialchars($description, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $countdownHtml = $autoClose ? '<p class="countdown"><span id="countdown">10</span> 秒后自动关闭</p>' : '';
        $scriptHtml = $autoClose ? <<<'HTML'
<script>
    let seconds = 10;
    const countdown = document.getElementById('countdown');
    const timer = window.setInterval(() => {
        seconds -= 1;
        if (countdown) {
            countdown.textContent = String(seconds);
        }
        if (seconds <= 0) {
            window.clearInterval(timer);
            window.close();
        }
    }, 1000);
</script>
HTML : '';

        return <<<HTML
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{$safeTitle}</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f7f8fa;
            color: #1f2329;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        main {
            width: min(520px, calc(100vw - 48px));
            padding: 32px;
            background: #ffffff;
            border: 1px solid #dee0e3;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(31, 35, 41, 0.08);
            text-align: center;
        }
        h1 {
            margin: 0 0 12px;
            font-size: 24px;
            font-weight: 600;
        }
        p {
            margin: 8px 0 0;
            font-size: 15px;
            line-height: 1.7;
            color: #646a73;
        }
        .countdown {
            margin-top: 16px;
            color: #1f2329;
            font-weight: 500;
        }
    </style>
</head>
<body>
<main>
    <h1>{$safeTitle}</h1>
    <p>{$safeMessage}</p>
    <p>{$safeDescription}</p>
    {$countdownHtml}
</main>
{$scriptHtml}
</body>
</html>
HTML;
    }
}
