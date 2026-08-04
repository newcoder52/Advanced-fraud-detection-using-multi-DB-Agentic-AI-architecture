import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class MultiDbPocStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // === VPC (use default) ===
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    // === Security Group for internal services (no public ingress) ===
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc,
      description: 'Security group for Lambda functions - no public ingress',
      allowAllOutbound: true,
    });

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'Security group for Aurora - internal only',
      allowAllOutbound: false,
    });
    dbSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), 'Allow Lambda to Aurora');

    // === VPC Endpoints (so Lambda in VPC can reach AWS services without NAT) ===
    // Gateway endpoint for DynamoDB (free)
    vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    // Interface endpoints for other services
    const endpointSg = new ec2.SecurityGroup(this, 'VpcEndpointSg', {
      vpc,
      description: 'Security group for VPC endpoints',
      allowAllOutbound: true,
    });
    endpointSg.addIngressRule(lambdaSg, ec2.Port.tcp(443), 'Allow Lambda to VPC endpoints');

    // Use subnets that support all endpoint services (exclude us-east-1f)
    const endpointSubnets: ec2.SubnetSelection = {
      availabilityZones: ['us-east-1a', 'us-east-1c', 'us-east-1d'],
    };

    vpc.addInterfaceEndpoint('BedrockRuntimeEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      securityGroups: [endpointSg],
      subnets: endpointSubnets,
    });

    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      securityGroups: [endpointSg],
      subnets: endpointSubnets,
    });

    vpc.addInterfaceEndpoint('RdsDataEndpoint', {
      service: new ec2.InterfaceVpcEndpointService('com.amazonaws.us-east-1.rds-data'),
      securityGroups: [endpointSg],
      subnets: endpointSubnets,
    });

    vpc.addInterfaceEndpoint('NeptuneGraphEndpoint', {
      service: new ec2.InterfaceVpcEndpointService('com.amazonaws.us-east-1.neptune-graph'),
      securityGroups: [endpointSg],
      subnets: endpointSubnets,
    });

    vpc.addInterfaceEndpoint('RdsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.RDS,
      securityGroups: [endpointSg],
      subnets: endpointSubnets,
    });

    vpc.addInterfaceEndpoint('StsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.STS,
      securityGroups: [endpointSg],
      subnets: endpointSubnets,
    });

    vpc.addInterfaceEndpoint('LambdaEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.LAMBDA,
      securityGroups: [endpointSg],
      subnets: endpointSubnets,
    });

    // === DynamoDB Tables (On-Demand / Pay-per-request) ===
    const tableNames = [
      'press_release_events',
      'user_interaction_events',
      'stream_events',
      'purchase_events',
      'content_engagement_events',
    ];

    const tables: { [key: string]: dynamodb.Table } = {};
    for (const tableName of tableNames) {
      tables[tableName] = new dynamodb.Table(this, `Table_${tableName}`, {
        tableName: `multidb_poc_${tableName}`,
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        timeToLiveAttribute: 'ttl',
      });

      tables[tableName].addGlobalSecondaryIndex({
        indexName: 'event_id_index',
        partitionKey: { name: 'event_id', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }

    // === Aurora Serverless v2 (PostgreSQL + pgvector) ===
    const dbSecret = new secretsmanager.Secret(this, 'AuroraSecret', {
      secretName: 'multidb-poc/aurora-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const auroraCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      serverlessV2MinCapacity: 2,
      serverlessV2MaxCapacity: 8,
      writer: rds.ClusterInstance.serverlessV2('writer', {
        publiclyAccessible: false,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // default VPC only has public subnets but we block public access
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromSecret(dbSecret),
      defaultDatabaseName: 'multidb_poc',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      storageEncrypted: true,
      enableDataApi: true,
    });

    // === S3 Bucket for Lambda code and seed data ===
    const codeBucket = new s3.Bucket(this, 'CodeBucket', {
      bucketName: `multidb-poc-code-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Lambda deps bundled directly with code (no separate layer needed for POC)

    // === IAM Role for Lambda ===
    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // DynamoDB access
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:*'],
      resources: Object.values(tables).map(t => t.tableArn).concat(
        Object.values(tables).map(t => `${t.tableArn}/index/*`)
      ),
    }));

    // Bedrock access
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['*'],
    }));

    // Secrets Manager
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [dbSecret.secretArn],
    }));

    // RDS Data API
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds:DescribeDBClusters'],
      resources: ['*'],
    }));

    // Neptune Analytics
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['neptune-graph:*'],
      resources: ['*'],
    }));

    // ElastiCache
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['elasticache:Connect'],
      resources: ['*'],
    }));

    // Lambda invoke (for calling embedding Lambda from VPC Lambda)
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: ['*'],
    }));

    // === Lambda Functions ===
    const commonEnv: { [key: string]: string } = {
      CUSTOMER_DOMAIN: 'press_distribution',
      AWS_REGION_NAME: 'us-east-1',
      DYNAMODB_TABLE_PREFIX: 'multidb_poc',
      AURORA_SECRET_ARN: dbSecret.secretArn,
      AURORA_CLUSTER_ENDPOINT: auroraCluster.clusterEndpoint.hostname,
      AURORA_DB_NAME: 'multidb_poc',
      ELASTICACHE_ENDPOINT: 'test-new-lahvej.serverless.use1.cache.amazonaws.com',
      ELASTICACHE_PORT: '6379',
      BEDROCK_EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
      BEDROCK_CLAUDE_MODEL: 'us.anthropic.claude-sonnet-4-6',
      NEPTUNE_GRAPH_ID: 'g-01a1sdys47',
      EMBEDDING_LAMBDA_NAME: 'multidb-poc-embedding',
    };

    // Embedding Lambda — NOT in VPC (needs direct Bedrock access)
    const embeddingLambda = new lambda.Function(this, 'EmbeddingLambda', {
      functionName: 'multidb-poc-embedding',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'app.embedding_handler.handler',
      code: lambda.Code.fromAsset('../backend/lambda_package'),
      role: lambdaRole,
      environment: {
        AWS_REGION_NAME: 'us-east-1',
        BEDROCK_EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
      },
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
    });

    // Main API Lambda
    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      functionName: 'multidb-poc-api',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'app.lambda_handler.handler',
      code: lambda.Code.fromAsset('../backend/lambda_package'),
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [lambdaSg],
      allowPublicSubnet: true,
    });

    // Pipeline execution Lambda (longer timeout)
    const pipelineLambda = new lambda.Function(this, 'PipelineLambda', {
      functionName: 'multidb-poc-pipeline',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'app.lambda_handler.handler',
      code: lambda.Code.fromAsset('../backend/lambda_package'),
      role: lambdaRole,
      environment: { ...commonEnv, PIPELINE_MODE: 'true' },
      timeout: cdk.Duration.seconds(120),
      memorySize: 1024,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [lambdaSg],
      allowPublicSubnet: true,
    });

    // === API Gateway (Private - no public ports) ===
    const api = new apigateway.RestApi(this, 'MultiDbPocApi', {
      restApiName: 'multi-db-poc-api',
      description: 'Multi-Database AI POC API',
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent'],
      },
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ['execute-api:Invoke'],
            resources: ['*'],
            principals: [new iam.AnyPrincipal()],
            conditions: {
              'IpAddress': {
                'aws:SourceIp': ['15.248.0.0/16', '108.51.228.0/24', '209.249.60.0/24'],
              },
            },
          }),
        ],
      }),
    });

    // Proxy all requests to Lambda
    const apiIntegration = new apigateway.LambdaIntegration(apiLambda);
    const proxyResource = api.root.addProxy({
      defaultIntegration: apiIntegration,
      anyMethod: true,
    });

    // === Outputs ===
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'AuroraEndpoint', {
      value: auroraCluster.clusterEndpoint.hostname,
      description: 'Aurora Serverless v2 endpoint',
    });

    new cdk.CfnOutput(this, 'AuroraSecretArn', {
      value: dbSecret.secretArn,
      description: 'Aurora credentials secret ARN',
    });
  }
}
