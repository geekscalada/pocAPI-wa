import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Stack, Duration, Fn,  aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BUCKET_CONFIGS } from '../const/buckets.js';
import { InfraProps } from '@infra/bin/app.js';
import { ITopic } from 'aws-cdk-lib/aws-sns';
import * as sns from "aws-cdk-lib/aws-sns";

export class LambdaStack extends Stack {
  public readonly lambdaS3poc: lambda.Function;
  public readonly publisherLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: InfraProps & { testTopic?: ITopic }) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    // const newLambdaBaseName = 'jep_new_lambda';

    // const newLambda = new lambda.Function(
    //   this,
    //   `${projectName}-${environmentName}-${newLambdaBaseName}`,
    //   {
    //     functionName: `${projectName}-${environmentName}-${newLambdaBaseName}`,
    //     runtime: lambda.Runtime.NODEJS_18_X,
    //     code: lambda.Code.fromAsset('../lambdas/my-lambda/dist'),
    //     handler: 'index.handler',
    //     timeout: Duration.minutes(1),
    //   },
    // );

    const bucketName = BUCKET_CONFIGS.internalPrivate.name;
    const inputFolder = BUCKET_CONFIGS.internalPrivate.routes.inputFolder;
    const outputFolder = BUCKET_CONFIGS.internalPrivate.routes.outputFolder;

    const lambdaS3pocBaseName = 'lambda-s3-poc';

    this.lambdaS3poc = new lambda.Function(
      this,
      `${projectName}-${environmentName}-${lambdaS3pocBaseName}`,
      {
        functionName: `${projectName}-${environmentName}-${lambdaS3pocBaseName}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset('../lambdas/my-lambda/dist'),
        handler: 'index.handler',
        timeout: Duration.minutes(1),
        environment: {
          BUCKET_NAME: bucketName,
          INPUT_FOLDER: inputFolder,
          OUTPUT_FOLDER: outputFolder,
        },
      },
    );

    // Publisher Lambda
    const publisherLambdaBaseName = 'publisher';

    const testTopic = props.testTopic ?? sns.Topic.fromTopicArn(this, 'ImportedTestTopic', Fn.importValue("TestTopicArn"));

    this.publisherLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-${publisherLambdaBaseName}`,
      {
        functionName: `${projectName}-${environmentName}-${publisherLambdaBaseName}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset('../lambdas/publisher/dist'),
        handler: 'index.handler',
        timeout: Duration.minutes(1),
        environment: {
          ENVIRONMENT: environmentName,
          PROJECT_NAME: projectName,
          TOPIC_TEST_ARN: testTopic.topicArn,  
        },
      },
    );

    testTopic.grantPublish(this.publisherLambda);
  }
}
