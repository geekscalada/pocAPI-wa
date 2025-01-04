import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Stack, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentProps } from '../bin/app';

export class LambdaStack extends Stack {
  constructor(scope: Construct, id: string, props: EnvironmentProps) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    const lambdaBaseName = 'jep_HelloWorld_lambda';

    const myLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-${lambdaBaseName}`,
      {
        functionName: `${projectName}-${environmentName}-${lambdaBaseName}`,
        runtime: lambda.Runtime.NODEJS_18_X,
        code: lambda.Code.fromAsset('../lambdas/my-lambda/dist'),
        handler: 'index.handler',
      },
    );

    const newLambdaBaseName = 'jep_new_lambda';

    const newLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-${newLambdaBaseName}`,
      {
        functionName: `${projectName}-${environmentName}-${newLambdaBaseName}`,
        runtime: lambda.Runtime.NODEJS_18_X,
        code: lambda.Code.fromAsset('../lambdas/my-lambda/dist'),
        handler: 'index.handler',
        timeout: Duration.minutes(1),
      },
    );
  }
}
