#!/usr/bin/env node

import { SnsTestStack } from '@infra/lib/sns-test-stack.js';
import { InternalBucketStack } from '../lib/internal-bucket-stack.js';
import { LambdaStack } from '../lib/lambda-stack.js';
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
const lambdaStack = new LambdaStack(app, `LambdaStack-prueba`, secretValues);
const internalBucketStack = new InternalBucketStack(
  app,
  `InternalBucketStack-prueba`,
  secretValues,
);

const snsTestStack = new SnsTestStack(app, "SnsTestStack", secretValues);

/**
 * Permissions S3 to lambdas
 */
internalBucketStack.internalPrivateBucket.grantReadWrite(lambdaStack.lambdaS3poc);
internalBucketStack.internalPrivateBucket.grantReadWrite(lambdaStack.publisherLambda);




