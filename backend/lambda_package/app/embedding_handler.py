"""Standalone embedding Lambda — NOT in VPC, calls Bedrock Titan V2."""
import json
import os
import boto3

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
MODEL = os.environ.get("BEDROCK_EMBEDDING_MODEL", "amazon.titan-embed-text-v2:0")

client = boto3.client("bedrock-runtime", region_name=REGION)


def handler(event, context):
    """Generate embedding for given text content."""
    body = event if isinstance(event, dict) else json.loads(event.get("body", "{}"))
    text = body.get("content", "")
    if not text:
        return {"statusCode": 400, "body": json.dumps({"error": "content required"})}

    response = client.invoke_model(
        modelId=MODEL,
        body=json.dumps({"inputText": text[:2000], "dimensions": 1024, "normalize": True}),
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    return {"embedding": result["embedding"]}
