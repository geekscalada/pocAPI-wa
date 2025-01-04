#!/usr/bin/env node
import { PipelineStack, SecretPipelineStack } from '../lib/pipeline-stack.js';
import { App, StackProps } from 'aws-cdk-lib';

interface EnvironmentProps extends StackProps {
  gitHubToken: string;
  account: string;
  region: string;
  githubRepo: string;
  githubOwner: string;
  githubBranch: string;
  projectName: string;
  environmentName: string;
  buildSpecsSynthCommand: string;
  buildSpecsDeployCommand: string;
}

const app = new App();

const environmentContext = app.node.tryGetContext('env');

if (environmentContext) {
  console.log('Using context from the command line to set the secret in the account');

  const secretValues: EnvironmentProps = app.node.tryGetContext(environmentContext);

  if (!secretValues) {
    throw new Error(`No se encontraron valores de contexto para el entorno: ${environmentContext}`);
  }

  new SecretPipelineStack(app, `SecretPipelineStack`);

  new PipelineStack(app, `PipelineStack`, {
    environmentName: secretValues.environmentName,
    projectName: secretValues.projectName,
    githubOwner: secretValues.githubOwner,
    githubRepo: secretValues.githubRepo,
    githubBranch: secretValues.githubBranch,
  });
} else {
  throw new Error('No se encontró el contexto de entorno en la línea de comandos');
}
