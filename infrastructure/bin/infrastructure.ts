#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MultiDbPocStack } from '../lib/infrastructure-stack';
import { FraudDetectionStack } from '../lib/fraud-detection-stack';

const app = new cdk.App();

// Existing stack — us-east-1 (Media & Entertainment POC)
new MultiDbPocStack(app, 'MultiDbPocStack', {
  env: {
    account: '723470608645',
    region: 'us-east-1',
  },
  description: 'Multi-Database for AI - M&E Vertical POC (Serverless)',
});

// New stack — us-east-1 (Fraud Detection POC, same region as MultiDbPocStack)
new FraudDetectionStack(app, 'FraudDetectionStack', {
  env: {
    account: '723470608645',
    region: 'us-east-1',
  },
  description: 'Multi-DB Fraud Detection POC - Neptune Analytics, DynamoDB, Valkey, Kinesis, Lambda',
});
