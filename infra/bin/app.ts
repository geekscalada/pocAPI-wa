#!/usr/bin/env node

import { InternalBucketStack } from '../lib/internal-bucket-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { App, StackProps } from 'aws-cdk-lib';

export interface EnvironmentProps extends StackProps {
  projectName: string;
  environmentName: string;
}

const app = new App();

const environmentContext = app.node.tryGetContext('env');

if (!environmentContext) {
  throw new Error(`Could not get the context from the command line`);
}

const secretValues: EnvironmentProps = app.node.tryGetContext(environmentContext);

if (!secretValues) {
  throw new Error(`Not found values for the environment: ${environmentContext}`);
}

// Stacks
const lambdaStack = new LambdaStack(app, `LambdaStack-prueba`, secretValues);
const interlBucketStack = new InternalBucketStack(app, `InternalBucketStack-prueba`, secretValues);

/**
 * Permissions S3 to lambdas
 */
interlBucketStack.internalPrivateBucket.grantReadWrite(lambdaStack.lambdaS3poc);
