"""Bare-minimum Lambda invoke to debug pipeline response."""

import boto3
import json
import base64

client = boto3.client('lambda', region_name='us-east-1')

# Test 1: Direct payload (no API Gateway wrapping)
payload = {
    "event_type": "message_sent",
    "domain": "dating_platform",
    "entity_id": "USR-FAKE-001",
    "content": "Hello beautiful, I am a US military officer. Can we move to WhatsApp?",
    "payload": {"user_id": "USR-FAKE-001", "recipient_id": "USR-1234"}
}

print("=" * 60)
print("TEST 1: Direct payload (no API GW wrapping)")
print("=" * 60)
print(f"Payload: {json.dumps(payload, indent=2)}")
print()

response = client.invoke(
    FunctionName='multidb-fraud-pipeline',
    InvocationType='RequestResponse',
    LogType='Tail',
    Payload=json.dumps(payload)
)

print(f"StatusCode: {response['StatusCode']}")
print(f"FunctionError: {response.get('FunctionError', 'None')}")
print()

# Decode log tail
if response.get('LogResult'):
    logs = base64.b64decode(response['LogResult']).decode('utf-8')
    print(f"=== LAST 4KB OF LOGS ===")
    print(logs[-2000:])
    print(f"=== END LOGS ===")
    print()

raw_payload = response['Payload'].read().decode('utf-8')
print(f"Raw Payload ({len(raw_payload)} bytes):")
print(raw_payload[:3000])
print()

# Test 2: API Gateway wrapped payload (Mangum expects this format)
print()
print("=" * 60)
print("TEST 2: API Gateway format (Mangum-compatible)")
print("=" * 60)

api_event = {
    "httpMethod": "POST",
    "path": "/api/v1/pipeline/execute",
    "headers": {
        "content-type": "application/json",
        "host": "localhost",
    },
    "body": json.dumps(payload),
    "isBase64Encoded": False,
    "requestContext": {
        "stage": "prod",
        "resourcePath": "/api/v1/pipeline/execute",
        "httpMethod": "POST",
    },
    "pathParameters": None,
    "queryStringParameters": None,
    "multiValueQueryStringParameters": None,
    "resource": "/api/v1/pipeline/execute",
}

print(f"API Event keys: {list(api_event.keys())}")
print()

response2 = client.invoke(
    FunctionName='multidb-fraud-pipeline',
    InvocationType='RequestResponse',
    LogType='Tail',
    Payload=json.dumps(api_event)
)

print(f"StatusCode: {response2['StatusCode']}")
print(f"FunctionError: {response2.get('FunctionError', 'None')}")
print()

if response2.get('LogResult'):
    logs2 = base64.b64decode(response2['LogResult']).decode('utf-8')
    print(f"=== LAST 4KB OF LOGS ===")
    print(logs2[-2000:])
    print(f"=== END LOGS ===")
    print()

raw_payload2 = response2['Payload'].read().decode('utf-8')
print(f"Raw Payload ({len(raw_payload2)} bytes):")
print(raw_payload2[:3000])
