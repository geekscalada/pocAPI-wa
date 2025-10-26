#!/usr/bin/env node

import { SnsTestStack } from '../lib/sns-test-stack.js';
import { InternalBucketStack } from '../lib/internal-bucket-stack.js';
import { LambdaStack } from '../lib/lambda-stack.js';
import { SqsStack } from '../lib/sqs-stack.js';
import { TestingApiStack } from '../lib/testing-api-stack.js';
import { App, StackProps, Fn } from 'aws-cdk-lib';

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
const snsTestStack = new SnsTestStack(app, "SnsTestStack", secretValues);
const sqsStack = new SqsStack(app, "SqsStack", secretValues);
const lambdaStack = new LambdaStack(app, `LambdaStack-prueba`, secretValues);
const internalBucketStack = new InternalBucketStack(
  app,
  `InternalBucketStack-prueba`,
  secretValues,
);

// Testing API Stack
const testingApiStack = new TestingApiStack(app, "TestingApiStack", secretValues, lambdaStack.publisherLambda);

// Orden del despliegue
sqsStack.addDependency(snsTestStack);
testingApiStack.addDependency(snsTestStack);

// Configurar topic ARN en el testing API después de la creación
const testTopicArn = Fn.importValue("TestTopicArn");
testingApiStack.configureTopicArn(testTopicArn);

/**
 * Permissions S3 to lambdas
 */
internalBucketStack.internalPrivateBucket.grantReadWrite(lambdaStack.lambdaS3poc);
internalBucketStack.internalPrivateBucket.grantReadWrite(lambdaStack.publisherLambda);




