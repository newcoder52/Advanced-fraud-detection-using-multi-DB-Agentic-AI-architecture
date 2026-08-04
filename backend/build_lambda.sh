#!/bin/bash
# Build Lambda deployment package
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/lambda_package"

echo "Cleaning build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "Installing dependencies..."
pip install -t "$BUILD_DIR" \
    fastapi==0.109.0 \
    mangum==0.17.0 \
    pydantic==2.5.3 \
    pydantic-settings==2.1.0 \
    boto3==1.34.0 \
    redis==5.0.1 \
    --quiet --no-cache-dir

echo "Copying application code..."
cp -r "$SCRIPT_DIR/app" "$BUILD_DIR/app"

echo "Build complete: $BUILD_DIR"
