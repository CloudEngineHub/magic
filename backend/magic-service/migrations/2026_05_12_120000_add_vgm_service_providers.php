<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('service_provider')) {
            return;
        }

        $now = date('Y-m-d H:i:s');
        $providers = [
            [
                'name' => '腾讯云混元',
                'provider_code' => 'Tencent',
                'description' => '腾讯云混元是腾讯云提供的大语言模型服务，支持中文理解、复杂推理、代码生成和多轮对话等场景。',
                'icon' => 'MAGIC/713471849556451329/default/default.png',
                'provider_type' => 0,
                'category' => 'llm',
                'status' => 1,
                'is_models_enable' => 0,
                'sort_order' => 991,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
                'translate' => json_encode([
                    'name' => [
                        'en_US' => 'Tencent Hunyuan',
                        'zh_CN' => '腾讯云混元',
                    ],
                    'description' => [
                        'en_US' => 'Tencent Hunyuan is a large language model service provided by Tencent Cloud, supporting Chinese understanding, complex reasoning, code generation, and multi-turn conversation scenarios.',
                        'zh_CN' => '腾讯云混元是腾讯云提供的大语言模型服务，支持中文理解、复杂推理、代码生成和多轮对话等场景。',
                    ],
                ], JSON_UNESCAPED_UNICODE),
                'remark' => '',
            ],
            [
                'name' => '百度千帆',
                'provider_code' => 'Baidu',
                'description' => '百度千帆是百度智能云提供的大模型平台，支持文心系列及多种主流模型的企业级接入。',
                'icon' => 'MAGIC/713471849556451329/default/default.png',
                'provider_type' => 0,
                'category' => 'llm',
                'status' => 1,
                'is_models_enable' => 0,
                'sort_order' => 990,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
                'translate' => json_encode([
                    'name' => [
                        'en_US' => 'Baidu Qianfan',
                        'zh_CN' => '百度千帆',
                    ],
                    'description' => [
                        'en_US' => 'Baidu Qianfan is a large model platform provided by Baidu AI Cloud, supporting enterprise access to ERNIE series and other mainstream models.',
                        'zh_CN' => '百度千帆是百度智能云提供的大模型平台，支持文心系列及多种主流模型的企业级接入。',
                    ],
                ], JSON_UNESCAPED_UNICODE),
                'remark' => '',
            ],
            [
                'name' => '国家超算平台',
                'provider_code' => 'SCNet',
                'description' => '国家超算平台提供兼容 OpenAI 接口的大模型 API 服务，适合国产算力与模型能力接入场景。',
                'icon' => 'MAGIC/713471849556451329/default/default.png',
                'provider_type' => 0,
                'category' => 'llm',
                'status' => 1,
                'is_models_enable' => 0,
                'sort_order' => 989,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
                'translate' => json_encode([
                    'name' => [
                        'en_US' => 'National Supercomputing Platform',
                        'zh_CN' => '国家超算平台',
                    ],
                    'description' => [
                        'en_US' => 'National Supercomputing Platform provides OpenAI-compatible large model API services for domestic computing power and model access scenarios.',
                        'zh_CN' => '国家超算平台提供兼容 OpenAI 接口的大模型 API 服务，适合国产算力与模型能力接入场景。',
                    ],
                ], JSON_UNESCAPED_UNICODE),
                'remark' => '',
            ],
            [
                'name' => 'Kimi',
                'provider_code' => 'Moonshot',
                'description' => 'Kimi 是月之暗面提供的大模型服务，支持长上下文对话、复杂推理和代码生成等能力。',
                'icon' => 'MAGIC/713471849556451329/default/default.png',
                'provider_type' => 0,
                'category' => 'llm',
                'status' => 1,
                'is_models_enable' => 0,
                'sort_order' => 988,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
                'translate' => json_encode([
                    'name' => [
                        'en_US' => 'Kimi',
                        'zh_CN' => 'Kimi',
                    ],
                    'description' => [
                        'en_US' => 'Kimi is a large model service provided by Moonshot AI, supporting long-context conversation, complex reasoning, and code generation.',
                        'zh_CN' => 'Kimi 是月之暗面提供的大模型服务，支持长上下文对话、复杂推理和代码生成等能力。',
                    ],
                ], JSON_UNESCAPED_UNICODE),
                'remark' => '',
            ],
            [
                'name' => '智谱 AI',
                'provider_code' => 'BigModel',
                'description' => '智谱 AI 提供 GLM 系列大模型服务，支持对话、推理、代码生成和 Agent 场景接入。',
                'icon' => 'MAGIC/713471849556451329/default/default.png',
                'provider_type' => 0,
                'category' => 'llm',
                'status' => 1,
                'is_models_enable' => 0,
                'sort_order' => 987,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
                'translate' => json_encode([
                    'name' => [
                        'en_US' => 'Zhipu AI',
                        'zh_CN' => '智谱 AI',
                    ],
                    'description' => [
                        'en_US' => 'Zhipu AI provides GLM series large model services for chat, reasoning, code generation, and agent scenarios.',
                        'zh_CN' => '智谱 AI 提供 GLM 系列大模型服务，支持对话、推理、代码生成和 Agent 场景接入。',
                    ],
                ], JSON_UNESCAPED_UNICODE),
                'remark' => '',
            ],
            [
                'name' => 'MiniMax',
                'provider_code' => 'MiniMax',
                'description' => 'MiniMax 提供文本、语音和多模态大模型服务，支持通过兼容接口快速接入多类 AI 能力。',
                'icon' => 'MAGIC/713471849556451329/default/default.png',
                'provider_type' => 0,
                'category' => 'llm',
                'status' => 1,
                'is_models_enable' => 0,
                'sort_order' => 986,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
                'translate' => json_encode([
                    'name' => [
                        'en_US' => 'MiniMax',
                        'zh_CN' => 'MiniMax',
                    ],
                    'description' => [
                        'en_US' => 'MiniMax provides text, speech, and multimodal large model services, supporting quick access to multiple AI capabilities through compatible APIs.',
                        'zh_CN' => 'MiniMax 提供文本、语音和多模态大模型服务，支持通过兼容接口快速接入多类 AI 能力。',
                    ],
                ], JSON_UNESCAPED_UNICODE),
                'remark' => '',
            ],
            [
                'name' => '硅基流动',
                'provider_code' => 'SiliconFlow',
                'description' => '硅基流动提供兼容 OpenAI 接口的大模型服务，支持多种国产与开源模型的统一调用。',
                'icon' => 'MAGIC/713471849556451329/default/default.png',
                'provider_type' => 0,
                'category' => 'llm',
                'status' => 1,
                'is_models_enable' => 0,
                'sort_order' => 985,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
                'translate' => json_encode([
                    'name' => [
                        'en_US' => 'SiliconFlow',
                        'zh_CN' => '硅基流动',
                    ],
                    'description' => [
                        'en_US' => 'SiliconFlow provides OpenAI-compatible large model services, supporting unified calls to domestic and open-source models.',
                        'zh_CN' => '硅基流动提供兼容 OpenAI 接口的大模型服务，支持多种国产与开源模型的统一调用。',
                    ],
                ], JSON_UNESCAPED_UNICODE),
                'remark' => '',
            ],
            [
                'name' => '可灵',
                'provider_code' => 'Keling',
                'description' => '可灵提供视频生成模型服务，支持文生视频、图生视频等创意视频生成场景。',
                'icon' => 'MAGIC/713471849556451329/default/magic.png',
                'provider_type' => 0,
                'category' => 'vgm',
                'status' => 1,
                'is_models_enable' => 1,
                'sort_order' => 1000,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
                'translate' => json_encode([
                    'name' => [
                        'en_US' => 'Kling',
                        'zh_CN' => '可灵',
                    ],
                    'alias' => [
                        'en_US' => 'Kling',
                        'zh_CN' => '可灵',
                    ],
                    'description' => [
                        'en_US' => 'Kling provides video generation model services for creative text-to-video and image-to-video scenarios.',
                        'zh_CN' => '可灵提供视频生成模型服务，支持文生视频、图生视频等创意视频生成场景。',
                    ],
                ], JSON_UNESCAPED_UNICODE),
                'remark' => '可灵',
            ],
            [
                'name' => '火山引擎（方舟）',
                'provider_code' => 'VolcengineArk',
                'description' => '火山引擎方舟提供视频生成模型服务，支持文生视频、图生视频等视频创作场景。',
                'icon' => 'MAGIC/713471849556451329/default/magic.png',
                'provider_type' => 0,
                'category' => 'vgm',
                'status' => 1,
                'is_models_enable' => 1,
                'sort_order' => 1000,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
                'translate' => json_encode([
                    'name' => [
                        'en_US' => 'Volcengine Ark',
                        'zh_CN' => '火山引擎（方舟）',
                    ],
                    'alias' => [
                        'en_US' => 'Volcengine Ark',
                        'zh_CN' => '火山引擎（方舟）',
                    ],
                    'description' => [
                        'en_US' => 'Volcengine Ark provides video generation model services for text-to-video and image-to-video creation scenarios.',
                        'zh_CN' => '火山引擎方舟提供视频生成模型服务，支持文生视频、图生视频等视频创作场景。',
                    ],
                ], JSON_UNESCAPED_UNICODE),
                'remark' => '聚合文生视频',
            ],
        ];

        foreach ($providers as $provider) {
            $exists = Db::table('service_provider')
                ->where('provider_code', $provider['provider_code'])
                ->where('category', $provider['category'])
                ->whereNull('deleted_at')
                ->exists();

            if ($exists) {
                continue;
            }

            $provider['id'] = IdGenerator::getSnowId();
            Db::table('service_provider')->insert($provider);
        }
    }

    public function down(): void
    {
    }
};
