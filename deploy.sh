#!/bin/bash
# Deploy the Multi-DB AI POC to AWS
set -e

echo "=== Multi-DB AI POC Deployment ==="
echo ""

# Check AWS credentials
echo "1. Checking AWS credentials..."
aws sts get-caller-identity --query "Account" --output text || {
    echo "ERROR: AWS credentials not valid. Run 'mwinit' first."
    exit 1
}
echo "   ✓ Credentials valid"

# Build Lambda package
echo ""
echo "2. Building Lambda package..."
cd backend
rm -rf lambda_package
mkdir -p lambda_package
pip3 install -t lambda_package fastapi==0.109.0 mangum==0.17.0 pydantic==2.5.3 pydantic-settings==2.1.0 redis==5.0.1 --quiet --no-cache-dir
cp -r app lambda_package/app
echo "   ✓ Lambda package built"

# CDK Deploy
echo ""
echo "3. Deploying CDK stack..."
cd ../infrastructure
npx cdk deploy --require-approval never
echo "   ✓ Stack deployed"

# Create Neptune Graph
echo ""
echo "4. Creating Neptune Analytics graph..."
GRAPH_ID=$(aws neptune-graph create-graph \
    --graph-name multidb-poc-graph \
    --provisioned-memory 32 \
    --no-public-connectivity \
    --replica-count 0 \
    --no-deletion-protection \
    --region us-east-1 \
    --query "id" --output text 2>/dev/null || echo "exists")

if [ "$GRAPH_ID" != "exists" ]; then
    echo "   ✓ Neptune graph created: $GRAPH_ID"
else
    echo "   ✓ Neptune graph already exists"
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "  1. Frontend: cd frontend && npm install && npm run dev"
echo "  2. API URL will be in CloudFormation outputs"
echo "  3. Seed data: curl -X POST <API_URL>/api/v1/admin/seed/all"
echo "  4. Run the demo from the Demo Walkthrough page"
