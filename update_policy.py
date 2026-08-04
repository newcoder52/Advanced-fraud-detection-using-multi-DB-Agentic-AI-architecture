import boto3
import json

client = boto3.client('apigateway', region_name='us-east-1')

policy = json.dumps({
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": "*",
            "Action": "execute-api:Invoke",
            "Resource": "arn:aws:execute-api:us-east-1:723470608645:nkt0mgbdn5/*",
            "Condition": {
                "IpAddress": {
                    "aws:SourceIp": [
                        "15.248.0.0/16",
                        "108.51.228.0/24",
                        "209.249.60.0/24"
                    ]
                }
            }
        }
    ]
})

response = client.update_rest_api(
    restApiId='nkt0mgbdn5',
    patchOperations=[
        {
            'op': 'replace',
            'path': '/policy',
            'value': policy
        }
    ]
)
print("Policy updated:", response['name'])

deploy = client.create_deployment(
    restApiId='nkt0mgbdn5',
    stageName='v1',
    description='Update IP whitelist'
)
print("Deployed to v1 stage:", deploy['id'])
