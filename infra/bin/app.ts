#!/usr/bin/env node

import { SnsTestStack } from '../lib/sns-test-stack.js';
import { InternalBucketStack } from '../lib/internal-bucket-stack.js';
import { LambdaStack } from '../lib/lambda-stack.js';
import { SqsStack } from '../lib/sqs-stack.js';
import { TestingApiStack } from '../lib/testing-api-stack.js';
import { VpcStack } from '../lib/vpc-stack.js';
import { TestConnVpcStack } from '../lib/test-conn-vpc-stack.js';
import { App, StackProps } from 'aws-cdk-lib';

export interface InfraProps extends StackProps {
  projectName: string;
  environmentName: string;
}

const app = new App();

const environmentContext = app.node.tryGetContext('env');

if (!environmentContext) {
  throw new Error(`Could not get the context from the command line`);
}

const secretValues: InfraProps = app.node.tryGetContext(environmentContext);

if (!secretValues) {
  throw new Error(`Not found values for the environment: ${environmentContext}`);
}

// Stacks
const vpcStack = new VpcStack(app, 'VpcStack', secretValues);
const snsTestStack = new SnsTestStack(app, "SnsTestStack", secretValues);
const sqsStack = new SqsStack(app, "SqsStack", { ...secretValues, testTopic: snsTestStack.testTopic });
const lambdaStack = new LambdaStack(app, `LambdaStack-prueba`, { 
  ...secretValues, 
  testTopic: snsTestStack.testTopic, 
  vpc1: vpcStack.vpc1,
  vpc2: vpcStack.vpc2,
});
const internalBucketStack = new InternalBucketStack(
  app,
  `InternalBucketStack-prueba`,
  { ...secretValues, vpc: vpcStack.vpc1 },
);

// Stack para crear instancias de prueba en cada VPC (SSM-enabled)
const testConnVpcStack = new TestConnVpcStack(app, 'TestConnVpcStack', { ...secretValues, vpc1: vpcStack.vpc1, vpc2: vpcStack.vpc2 });

testConnVpcStack.addDependency(vpcStack);

// Testing API Stack (usa publisherLambda que ya tiene SNS configurado)
const testingApiStack = new TestingApiStack(
  app, 
  "TestingApiStack", 
  secretValues, 
  lambdaStack.publisherLambda,
  sqsStack.directProducerLambda,
  sqsStack.dedupDirectProducerLambda,
  sqsStack.apiDirectQueue.queueName,
  sqsStack.apiDirectQueue.queueArn
);

// Orden del despliegue
sqsStack.addDependency(snsTestStack);
lambdaStack.addDependency(snsTestStack);
lambdaStack.addDependency(vpcStack);
testingApiStack.addDependency(lambdaStack);
testingApiStack.addDependency(sqsStack);

/**
 * Permissions S3 to lambdas
 */
internalBucketStack.internalPrivateBucket.grantReadWrite(lambdaStack.lambdaS3poc);
internalBucketStack.internalPrivateBucket.grantReadWrite(lambdaStack.publisherLambda);




