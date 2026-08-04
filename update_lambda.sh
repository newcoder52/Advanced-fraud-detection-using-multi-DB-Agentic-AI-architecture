#!/bin/bash
# Quick Lambda code update — bypasses CDK asset caching
set -e

echo "=== Quick Lambda Update ==="
REGION="us-east-1"

# 1. Copy latest app code into lambda_package
echo "1. Copying latest app code..."
cp -r /Users/haliasgh/DMS_local_converter/multi-db-poc/backend/app \
      /Users/haliasgh/DMS_local_converter/multi-db-poc/backend/lambda_package/app

# 2. Create zip
echo "2. Creating deployment zip..."
cd /Users/haliasgh/DMS_local_converter/multi-db-poc/backend/lambda_package
rm -f /tmp/multidb-lambda.zip
zip -r /tmp/multidb-lambda.zip . -q

# 3. Update both Lambda functions
echo "3. Updating multidb-poc-api..."
aws lambda update-function-code \
    --function-name multidb-poc-api \
    --zip-file fileb:///tmp/multidb-lambda.zip \
    --region $REGION \
    --no-cli-pager

echo "4. Updating multidb-poc-pipeline..."
aws lambda update-function-code \
    --function-name multidb-poc-pipeline \
    --zip-file fileb:///tmp/multidb-lambda.zip \
    --region $REGION \
    --no-cli-pager

echo ""
echo "=== Done! Testing... ==="
sleep 3
echo "5. Testing API..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/" \
    --max-time 10)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ API is healthy (HTTP 200)"
else
    echo "   ❌ API returned HTTP $HTTP_CODE"
    echo "   Check logs: aws logs tail /aws/lambda/multidb-poc-api --since 2m --region $REGION"
fi

# Cleanup
rm -f /tmp/multidb-lambda.zip
