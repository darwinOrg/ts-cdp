#!/bin/bash

# 打包 ts-cdp 项目

# 获取脚本所在目录的父目录（项目根目录）
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 定义输出文件名
OUTPUT_FILE="${PROJECT_ROOT}/ts-cdp.zip"

# 定义要打包的文件和目录
FILES_TO_PACKAGE=(
    "tsconfig.json"
    "package-lock.json"
    "package.json"
    "src"
)

# 切换到项目根目录
cd "${PROJECT_ROOT}"

# 删除旧的压缩包（如果存在）
if [ -f "${OUTPUT_FILE}" ]; then
    echo "删除旧的压缩包: ${OUTPUT_FILE}"
    rm -f "${OUTPUT_FILE}"
fi

# 创建压缩包
echo "开始打包..."
zip -r "${OUTPUT_FILE}" "${FILES_TO_PACKAGE[@]}"

# 检查是否成功
if [ $? -eq 0 ]; then
    echo "✓ 打包成功: ${OUTPUT_FILE}"
    echo "包含的文件和目录:"
    for item in "${FILES_TO_PACKAGE[@]}"; do
        echo "  - ${item}"
    done
else
    echo "✗ 打包失败"
    exit 1
fi