#!/usr/bin/env node

import { LambdaStack } from '../lib/lambda-stack.js';
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
new LambdaStack(app, `LambdaStack-prueba`, secretValues);
