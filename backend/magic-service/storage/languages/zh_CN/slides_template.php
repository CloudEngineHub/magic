<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    'validate_failed' => '幻灯片模板参数校验失败',
    'only_official_organization_can_manage' => '仅官方组织可以管理幻灯片模板',
    'not_found' => '幻灯片模板不存在',
    'code_generate_failed' => '幻灯片模板编码生成失败',
    'file_url_generate_failed' => '幻灯片模板文件链接生成失败',
    'code_already_exists' => '幻灯片模板编码已存在',
    'code_string' => '模板编码必须是字符串',
    'code_regex' => '模板编码必须以 PPT- 开头，且只能使用字母、数字和中划线',
    'label_required' => '模板名称是必需的',
    'label_array' => '模板名称必须是数组',
    'label_zh_cn_required' => '模板中文名称是必需的',
    'label_zh_cn_max' => '模板中文名称不能超过100个字符',
    'label_en_us_required' => '模板英文名称是必需的',
    'label_en_us_max' => '模板英文名称不能超过100个字符',
    'description_required' => '模板描述是必需的',
    'description_array' => '模板描述必须是数组',
    'description_zh_cn_required' => '模板中文描述是必需的',
    'description_zh_cn_max' => '模板中文描述不能超过1000个字符',
    'description_en_us_required' => '模板英文描述是必需的',
    'description_en_us_max' => '模板英文描述不能超过1000个字符',
    'thumbnail_file_key_required' => '模板封面图文件 key 是必需的',
    'template_file_key_required' => '模板 ZIP 文件 key 是必需的',
    'file_key_string' => '文件 key 必须是字符串',
    'file_key_max' => '文件 key 不能超过512个字符',
    'preview_url_url' => '预览链接格式不正确',
    'preview_url_max' => '预览链接不能超过1024个字符',
    'status_in' => '状态必须是0（不可用）或1（可用）',
    'sort_integer' => '排序值必须是整数',
    'page_integer' => '页码必须是整数',
    'page_min' => '页码必须大于等于1',
    'page_size_integer' => '每页数量必须是整数',
    'page_size_min' => '每页数量必须大于等于1',
    'page_size_max' => '每页数量不能超过200',
    'keyword_max' => '关键词不能超过100个字符',
    'code_max' => '模板编码不能超过100个字符',
];
