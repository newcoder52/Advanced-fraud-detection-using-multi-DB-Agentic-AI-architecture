#!/bin/bash
# Multi-DB Fraud Detection POC - Infrastructure Inventory
# Run: ./inventory.sh
REGION="us-east-2"

echo "=== AWS Identity ==="
aws sts get-caller-identity --region "$REGION"

echo -e "\n=== Neptune Graphs ==="
aws neptune-graph list-graphs --region "$REGION"

echo -e "\n=== DynamoDB Tables ==="
aws dynamodb list-tables --region "$REGION"

echo -e "\n=== ElastiCache ==="
aws elasticache describe-cache-clusters --region "$REGION" \
  --query "CacheClusters[].{Id:CacheClusterId,Engine:Engine,Status:CacheClusterStatus}" --output table

echo -e "\n=== RDS/Aurora ==="
aws rds describe-db-clusters --region "$REGION" \
  --query "DBClusters[].{Id:DBClusterIdentifier,Engine:Engine,Status:Status}" --output table

echo -e "\n=== Lambda Functions ==="
aws lambda list-functions --region "$REGION" --query "Functions[].FunctionName" --output table

echo -e "\n=== Kinesis Streams ==="
aws kinesis list-streams --region "$REGION"

echo -e "\n=== S3 Buckets (POC-related) ==="
aws s3 ls | grep -iE "multidb|fraud|poc"

echo -e "\n=== Public IP ==="
curl -s https://checkip.amazonaws.com

echo -e "\n=== Security Groups (POC-related) ==="
aws ec2 describe-security-groups --region "$REGION" \
  --query "SecurityGroups[?contains(GroupName, 'multidb') || contains(GroupName, 'poc') || contains(GroupName, 'Infra')].{Name:GroupName,Id:GroupId}" --output table

echo -e "\n=== API Gateway ==="
aws apigateway get-rest-apis --region "$REGION" --query "items[].{Name:name,Id:id}" --output table

echo -e "\n=== CDK Stacks ==="
aws cloudformation list-stacks --region "$REGION" --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?contains(StackName, 'multidb') || contains(StackName, 'Infra') || contains(StackName, 'fraud')].{Name:StackName,Status:StackStatus}" --output table
