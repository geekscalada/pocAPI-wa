import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Stack, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentProps } from '../bin/app.js';
import { BUCKET_CONFIGS } from '../const/buckets.js';

export class LambdaStack extends Stack {
  public readonly lambdaS3poc: lambda.Function;

  constructor(scope: Construct, id: string, props: EnvironmentProps) {
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
        runtime: lambda.Runtime.NODEJS_18_X,
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
  }
}
