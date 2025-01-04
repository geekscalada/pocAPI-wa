import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as dotenv from 'dotenv';
dotenv.config();

export interface PipelineStackProps extends cdk.StackProps {
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  environmentName: string;
  projectName: string;
}
export class SecretPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const gitHubToken = process.env.GITHUB_TOKEN;

    if (!gitHubToken) {
      throw new Error('GitHub token is required, fill your .env file');
    }

    new secretsmanager.Secret(this, `SecretPipeline`, {
      secretName: `Secret-pipeline`,
      secretObjectValue: {
        gitHubToken: cdk.SecretValue.unsafePlainText(gitHubToken),
      },
    });
  }
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { githubOwner, githubRepo, githubBranch, environmentName, projectName } = props;

    const pipelineName = `${projectName}-${environmentName}-pipeline`;
    const artifactBucketName = `${projectName}-${environmentName}-artifact`;

    const artifactBucket = new cdk.aws_s3.Bucket(this, 'PipelineArtifactsBucket', {
      bucketName: artifactBucketName,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const sourceOutput = new codepipeline.Artifact();

    const githubSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'SecretPipeline',
      'Secret-pipeline',
    );

    const pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    pipelineRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
    );

    const buildRole = new iam.Role(this, 'CodeBuildServiceRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    buildRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName,
      artifactBucket,
      role: pipelineRole,
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.GitHubSourceAction({
          actionName: `Checkout-${environmentName}`,
          owner: githubOwner,
          repo: githubRepo,
          branch: githubBranch,
          oauthToken: cdk.SecretValue.secretsManager(githubSecret.secretName, {
            jsonField: 'gitHubToken',
          }),
          output: sourceOutput,
          trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
        }),
      ],
    });

    /**
     * Add Build stage
     * This stage will build the application using CodeBuild and the different buildspec.yml file
     */

    const buildOutput = new codepipeline.Artifact();
    const buildProject = new cdk.aws_codebuild.PipelineProject(this, 'BuildProject', {
      role: buildRole,
      buildSpec: cdk.aws_codebuild.BuildSpec.fromSourceFilename(
        `./pipeline/${environmentName}-buildspec.yml`,
      ),
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: `Build-${environmentName}`,
          input: sourceOutput,
          outputs: [buildOutput],
          project: buildProject,
        }),
      ],
    });
  }
}
