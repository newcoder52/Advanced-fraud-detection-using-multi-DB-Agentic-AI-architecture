import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';

/**
 * Multi-DB Fraud Detection POC Stack
 *
 * Reuses existing VPC (testingvpc) and Neptune Analytics graph.
 * Deploys: DynamoDB, ElastiCache Valkey, Kinesis, Lambda, API Gateway
 * -- all locked to 96.231.49.78/32 inbound.
 */
export class FraudDetectionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -----------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------
    const ALLOWED_IP = '96.231.49.78/32';
    const CODE_BUCKET_NAME = 'multidb-poc-code-723470608645';
    const LAMBDA_S3_KEY = 'lambda.zip';

    // Existing Neptune Analytics graph (created outside this stack)
    // Get ID with: aws neptune-graph list-graphs --region us-east-1 --query "graphs[?name=='multidb-poc-graph'].id" --output text
    const NEPTUNE_GRAPH_ID = 'g-01a1sdys47';
    const NEPTUNE_GRAPH_ENDPOINT = `${NEPTUNE_GRAPH_ID}.us-east-1.neptune-graph.amazonaws.com`;

    // -----------------------------------------------------------------
    // 1. VPC -- Import existing testingvpc (vpc-08ac1c7b76167cbc9)
    // -----------------------------------------------------------------
    const vpc = ec2.Vpc.fromLookup(this, 'FraudPocVpc', {
      vpcId: 'vpc-08ac1c7b76167cbc9',
    });

    // -----------------------------------------------------------------
    // 2. Security Groups
    // -----------------------------------------------------------------

    // Lambda Security Group - outbound only (no inbound from public)
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc,
      securityGroupName: 'multidb-fraud-lambda-sg',
      description: 'Lambda function security group - outbound only',
      allowAllOutbound: true,
    });

    // ElastiCache Security Group - inbound from Lambda SG only
    const cacheSg = new ec2.SecurityGroup(this, 'CacheSg', {
      vpc,
      securityGroupName: 'multidb-fraud-cache-sg',
      description: 'ElastiCache Valkey - inbound from Lambda only',
      allowAllOutbound: true,
    });
    cacheSg.addIngressRule(
      lambdaSg,
      ec2.Port.tcp(6379),
      'Allow Lambda to Valkey'
    );

    // Neptune Analytics Security Group - inbound from Lambda SG only
    const neptuneSg = new ec2.SecurityGroup(this, 'NeptuneSg', {
      vpc,
      securityGroupName: 'multidb-fraud-neptune-sg',
      description: 'Neptune Analytics - inbound from Lambda only',
      allowAllOutbound: true,
    });
    neptuneSg.addIngressRule(
      lambdaSg,
      ec2.Port.tcp(8182),
      'Allow Lambda to Neptune Analytics'
    );

    // API Gateway does not need a SG (managed service).
    // We use resource policy to restrict to ALLOWED_IP.

    // Bastion/Admin SG - for your PC to reach resources directly if needed
    const adminSg = new ec2.SecurityGroup(this, 'AdminSg', {
      vpc,
      securityGroupName: 'multidb-fraud-admin-sg',
      description: 'Admin access from authorized IP only',
      allowAllOutbound: true,
    });
    adminSg.addIngressRule(
      ec2.Peer.ipv4(ALLOWED_IP),
      ec2.Port.tcp(443),
      'HTTPS from authorized IP'
    );
    adminSg.addIngressRule(
      ec2.Peer.ipv4(ALLOWED_IP),
      ec2.Port.tcp(8182),
      'Neptune from authorized IP'
    );
    adminSg.addIngressRule(
      ec2.Peer.ipv4(ALLOWED_IP),
      ec2.Port.tcp(6379),
      'Valkey from authorized IP'
    );

    // Also allow admin SG into cache and neptune for direct debugging
    cacheSg.addIngressRule(
      adminSg,
      ec2.Port.tcp(6379),
      'Allow admin access to Valkey'
    );
    neptuneSg.addIngressRule(
      adminSg,
      ec2.Port.tcp(8182),
      'Allow admin access to Neptune'
    );

    // -----------------------------------------------------------------
    // 3. DynamoDB Table - flagged events hot store
    // -----------------------------------------------------------------
    const eventsTable = new dynamodb.Table(this, 'FraudEventsTable', {
      tableName: 'multidb-poc-events',
      partitionKey: { name: 'domain', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'event_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false, // POC only
    });

    // GSI for querying by risk_score
    eventsTable.addGlobalSecondaryIndex({
      indexName: 'risk-score-index',
      partitionKey: { name: 'domain', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'risk_score', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // -----------------------------------------------------------------
    // 4. ElastiCache Valkey - single node for real-time scoring cache
    // -----------------------------------------------------------------
    const cacheSubnetGroup = new elasticache.CfnSubnetGroup(this, 'CacheSubnetGroup', {
      cacheSubnetGroupName: 'multidb-fraud-cache-subnets',
      description: 'Subnet group for fraud POC Valkey cache',
      subnetIds: vpc.publicSubnets.map(s => s.subnetId),
    });

    const valkeyCluster = new elasticache.CfnReplicationGroup(this, 'ValkeyCluster', {
      replicationGroupDescription: 'Valkey replication group for fraud POC scoring cache',
      replicationGroupId: 'multidb-fraud-cache',
      engine: 'valkey',
      cacheNodeType: 'cache.t3.micro',
      numCacheClusters: 1,
      cacheSubnetGroupName: cacheSubnetGroup.cacheSubnetGroupName!,
      securityGroupIds: [cacheSg.securityGroupId],
      port: 6379,
      automaticFailoverEnabled: false,
      transitEncryptionEnabled: true,
      tags: [
        { key: 'Project', value: 'multidb-fraud-poc' },
      ],
    });
    valkeyCluster.addDependency(cacheSubnetGroup);

    // -----------------------------------------------------------------
    // 5. Kinesis Data Stream - event ingestion
    // -----------------------------------------------------------------
    const eventStream = new kinesis.Stream(this, 'FraudEventStream', {
      streamName: 'multidb-poc-events-stream',
      streamMode: kinesis.StreamMode.ON_DEMAND,
      retentionPeriod: cdk.Duration.hours(24),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -----------------------------------------------------------------
    // 6. Lambda Function - pipeline orchestrator
    // -----------------------------------------------------------------

    // Reference the existing S3 bucket for Lambda code
    const codeBucket = s3.Bucket.fromBucketName(
      this, 'CodeBucket', CODE_BUCKET_NAME
    );

    // IAM Role for Lambda
    const lambdaRole = new iam.Role(this, 'FraudLambdaRole', {
      roleName: 'multidb-fraud-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // DynamoDB access
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      sid: 'DynamoDBAccess',
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
        'dynamodb:BatchWriteItem',
      ],
      resources: [
        eventsTable.tableArn,
        `${eventsTable.tableArn}/index/*`,
      ],
    }));

    // Kinesis access
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      sid: 'KinesisAccess',
      actions: [
        'kinesis:GetRecords',
        'kinesis:GetShardIterator',
        'kinesis:DescribeStream',
        'kinesis:DescribeStreamSummary',
        'kinesis:ListShards',
        'kinesis:PutRecord',
        'kinesis:PutRecords',
      ],
      resources: [eventStream.streamArn],
    }));

    // Neptune Analytics access
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      sid: 'NeptuneAnalyticsAccess',
      actions: [
        'neptune-graph:ReadDataViaQuery',
        'neptune-graph:WriteDataViaQuery',
        'neptune-graph:DeleteDataViaQuery',
        'neptune-graph:GetGraph',
        'neptune-graph:GetGraphSummary',
      ],
      resources: [
        `arn:aws:neptune-graph:${this.region}:${this.account}:graph/*`,
      ],
    }));

    // ElastiCache connect
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ElastiCacheAccess',
      actions: ['elasticache:Connect'],
      resources: ['*'],
    }));

    // Bedrock access (for embeddings and Claude)
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BedrockAccess',
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'],
    }));

    // S3 read access (for code bucket)
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      sid: 'S3CodeAccess',
      actions: ['s3:GetObject'],
      resources: [`arn:aws:s3:::${CODE_BUCKET_NAME}/*`],
    }));

    // Aurora (existing clusters) - RDS Data API
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      sid: 'RDSDataAccess',
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds:DescribeDBClusters',
      ],
      resources: ['*'],
    }));

    // Secrets Manager (for Aurora credentials)
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SecretsManagerAccess',
      actions: ['secretsmanager:GetSecretValue'],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:multidb-poc/*`],
    }));

    // Lambda environment variables pointing to all resources
    const lambdaEnvironment: { [key: string]: string } = {
      // General
      CUSTOMER_DOMAIN: 'press_distribution',
      AWS_REGION_NAME: this.region,

      // DynamoDB
      DYNAMODB_TABLE_NAME: eventsTable.tableName,
      DYNAMODB_TABLE_PREFIX: 'multidb_poc',

      // Neptune Analytics (existing graph - imported)
      NEPTUNE_GRAPH_ID: NEPTUNE_GRAPH_ID,
      NEPTUNE_GRAPH_ENDPOINT: NEPTUNE_GRAPH_ENDPOINT,

      // ElastiCache Valkey
      ELASTICACHE_ENDPOINT: valkeyCluster.attrPrimaryEndPointAddress,
      ELASTICACHE_PORT: '6379',

      // Kinesis
      KINESIS_STREAM_NAME: eventStream.streamName,
      KINESIS_STREAM_ARN: eventStream.streamArn,

      // Bedrock
      BEDROCK_EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
      BEDROCK_CLAUDE_MODEL: 'us.anthropic.claude-sonnet-4-6',

      // Pipeline config
      PIPELINE_TIMEOUT_MS: '540',
      CACHE_TTL_SECONDS: '3600',

      // S3
      CODE_BUCKET: CODE_BUCKET_NAME,
    };

    // Main Lambda function
    const fraudLambda = new lambda.Function(this, 'FraudPipelineLambda', {
      functionName: 'multidb-fraud-pipeline',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'app.lambda_handler.handler',
      code: lambda.Code.fromBucket(codeBucket, LAMBDA_S3_KEY),
      role: lambdaRole,
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      allowPublicSubnet: true,
      securityGroups: [lambdaSg],
      logRetention: logs.RetentionDays.TWO_WEEKS,
      description: 'Multi-DB Fraud Detection Pipeline Orchestrator',
    });

    // Kinesis event source mapping (Lambda reads from stream)
    new lambda.EventSourceMapping(this, 'KinesisEventSource', {
      target: fraudLambda,
      eventSourceArn: eventStream.streamArn,
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 100,
      maxBatchingWindow: cdk.Duration.seconds(5),
      retryAttempts: 3,
      bisectBatchOnError: true,
      enabled: true,
    });

    // -----------------------------------------------------------------
    // 7. API Gateway - REST API fronting the Lambda
    // -----------------------------------------------------------------
    const api = new apigateway.RestApi(this, 'FraudPocApi', {
      restApiName: 'multidb-fraud-poc-api',
      description: 'Multi-DB Fraud Detection POC - REST API',
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      // Resource policy: ONLY allow requests from authorized IP
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['execute-api:Invoke'],
            resources: ['execute-api:/*'],
            principals: [new iam.AnyPrincipal()],
            conditions: {
              'IpAddress': {
                'aws:SourceIp': [ALLOWED_IP],
              },
            },
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            actions: ['execute-api:Invoke'],
            resources: ['execute-api:/*'],
            principals: [new iam.AnyPrincipal()],
            conditions: {
              'NotIpAddress': {
                'aws:SourceIp': [ALLOWED_IP],
              },
            },
          }),
        ],
      }),
    });

    // Proxy all requests to Lambda
    const lambdaIntegration = new apigateway.LambdaIntegration(fraudLambda, {
      proxy: true,
    });

    // Root integration
    api.root.addMethod('ANY', lambdaIntegration);

    // Proxy resource for all paths
    api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true,
    });

    // -----------------------------------------------------------------
    // VPC Interface Endpoints (for AWS services Lambda needs in VPC)
    // -----------------------------------------------------------------
    const endpointSg = new ec2.SecurityGroup(this, 'VpcEndpointSg', {
      vpc,
      securityGroupName: 'multidb-fraud-vpce-sg',
      description: 'VPC endpoint access from Lambda',
      allowAllOutbound: true,
    });
    endpointSg.addIngressRule(
      lambdaSg,
      ec2.Port.tcp(443),
      'Allow Lambda to VPC endpoints'
    );

    // Bedrock Runtime endpoint
    new ec2.InterfaceVpcEndpoint(this, 'BedrockRuntimeEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      securityGroups: [endpointSg],
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // Kinesis endpoint
    new ec2.InterfaceVpcEndpoint(this, 'KinesisEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.KINESIS_STREAMS,
      securityGroups: [endpointSg],
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // STS endpoint (for IAM role assumption)
    new ec2.InterfaceVpcEndpoint(this, 'StsEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.STS,
      securityGroups: [endpointSg],
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // Neptune Graph endpoint
    new ec2.InterfaceVpcEndpoint(this, 'NeptuneGraphEndpoint', {
      vpc,
      service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${this.region}.neptune-graph`),
      securityGroups: [endpointSg],
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // -----------------------------------------------------------------
    // Outputs
    // -----------------------------------------------------------------
    new cdk.CfnOutput(this, 'VpcId', {
      value: vpc.vpcId,
      description: 'VPC ID (existing testingvpc)',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL (restricted to authorized IP)',
    });

    new cdk.CfnOutput(this, 'NeptuneGraphId', {
      value: NEPTUNE_GRAPH_ID,
      description: 'Neptune Analytics Graph ID (existing)',
    });

    new cdk.CfnOutput(this, 'NeptuneGraphEndpointOutput', {
      value: NEPTUNE_GRAPH_ENDPOINT,
      description: 'Neptune Analytics Graph Endpoint (existing)',
    });

    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: eventsTable.tableName,
      description: 'DynamoDB Events Table',
    });

    new cdk.CfnOutput(this, 'ElastiCacheEndpoint', {
      value: valkeyCluster.attrPrimaryEndPointAddress,
      description: 'ElastiCache Valkey Endpoint',
    });

    new cdk.CfnOutput(this, 'KinesisStreamName', {
      value: eventStream.streamName,
      description: 'Kinesis Data Stream Name',
    });

    new cdk.CfnOutput(this, 'KinesisStreamArn', {
      value: eventStream.streamArn,
      description: 'Kinesis Data Stream ARN',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: fraudLambda.functionName,
      description: 'Lambda Function Name',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: fraudLambda.functionArn,
      description: 'Lambda Function ARN',
    });
  }
}
