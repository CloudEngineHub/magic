#!/usr/bin/env bash

set -euo pipefail

usage() {
    cat <<'EOF'
用法:
  extract_otlp_curl.sh [日志文件]
  cat gateway.log | extract_otlp_curl.sh
  extract_otlp_curl.sh --output replay.sh gateway.log
  extract_otlp_curl.sh --execute gateway.log

默认从日志中提取“调试模式 - OTLP 可复现 curl”后的真实命令并输出到标准输出。
使用 --execute 会立即执行提取出的命令并发送请求，请确认日志来源可信。
EOF
}

output_file=""
execute=false
input_file="-"
input_file_set=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -o|--output)
            [[ $# -ge 2 ]] || { echo "错误: $1 需要文件路径" >&2; exit 2; }
            output_file="$2"
            shift 2
            ;;
        -x|--execute)
            execute=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -)
            input_file="-"
            shift
            ;;
        -* )
            echo "错误: 未知参数 $1" >&2
            usage >&2
            exit 2
            ;;
        *)
            if [[ "$input_file_set" == true ]]; then
                echo "错误: 只能指定一个日志文件" >&2
                exit 2
            fi
            input_file="$1"
            input_file_set=true
            shift
            ;;
    esac
done

if [[ "$input_file" != "-" && ! -r "$input_file" ]]; then
    echo "错误: 无法读取日志文件: $input_file" >&2
    exit 1
fi

command_file=$(mktemp)
trap 'rm -f "$command_file"' EXIT

awk '
function strip_gateway_prefix(line) {
    sub(/^\[[^]]+\][[:space:]]+[0-9]{4}\/[0-9]{2}\/[0-9]{2}[[:space:]]+[0-9]{2}:[0-9]{2}:[0-9]{2}[[:space:]]+/, "", line)
    return line
}

{
    line = strip_gateway_prefix($0)

    if (line ~ /调试模式 - OTLP 可复现 curl/) {
        after_marker = 1
        next
    }

    if ((after_marker || line ~ /^printf /) &&
        line ~ /^printf .*base64 -d.*curl / &&
        line ~ /--data-binary @-/) {
        print line
        found = 1
        exit
    }
}

END {
    if (!found) {
        exit 3
    }
}
' "$input_file" > "$command_file" || {
    exit_code=$?
    if [[ $exit_code -eq 3 ]]; then
        echo "错误: 未找到 OTLP 可复现 curl 命令" >&2
        exit 1
    fi
    exit "$exit_code"
}

if ! bash -n "$command_file"; then
    echo "错误: 提取出的 curl 命令存在 shell 语法错误" >&2
    exit 1
fi

if [[ -n "$output_file" ]]; then
    {
        printf '%s\n' '#!/usr/bin/env bash'
        printf '%s\n' 'set -euo pipefail'
        cat "$command_file"
    } > "$output_file"
    chmod +x "$output_file"
fi

if [[ "$execute" == true ]]; then
    echo "正在执行提取出的 OTLP curl 请求..." >&2
    bash "$command_file"
elif [[ -z "$output_file" ]]; then
    cat "$command_file"
else
    echo "已生成可执行脚本: $output_file" >&2
fi