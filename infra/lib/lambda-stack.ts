import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Stack, Duration, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BUCKET_CONFIGS } from '../const/buckets.js';
import { InfraProps } from '@infra/bin/app.js';
import { ITopic } from 'aws-cdk-lib/aws-sns';
import * as sns from "aws-cdk-lib/aws-sns";

export class LambdaStack extends Stack {
  public readonly lambdaS3poc: lambda.Function;
  public readonly publisherLambda: lambda.Function;
  public readonly vpcLambda?: lambda.Function;
  public readonly vpc2Lambda?: lambda.Function;

  constructor(scope: Construct, id: string, props: InfraProps & { testTopic?: ITopic; vpc1?: ec2.IVpc; vpc2?: ec2.IVpc }) {
    super(scope, id, props);



    let { projectName, environmentName, vpc1, vpc2 } = props;

    vpc1 = undefined; // TEMP
    vpc2 = undefined; // TEMP

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

    const testTopic = props.testTopic ?? sns.Topic.fromTopicArn(this, 'ImportedTestTopic', Fn.importValue("TestTopicFifoArn"));

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

    
      this.vpcLambda = new lambda.Function(this, `${projectName}-${environmentName}-lambda-vpc1`, {
        functionName: `${projectName}-${environmentName}-lambda-vpc1`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromInline(`
          exports.handler = async (event) => {
            console.log('lambda-vpc event:', JSON.stringify(event));
            return {
              statusCode: 200,
              body: JSON.stringify({
                message: 'Hello from lambda-vpc1 inside VPC1',
              }),
            };
          };
        `),
        handler: 'index.handler',
        timeout: Duration.seconds(30),
        vpc: vpc1,
        // vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });
    

   
      this.vpc2Lambda = new lambda.Function(this, `${projectName}-${environmentName}-lambda-vpc2`, {
        functionName: `${projectName}-${environmentName}-lambda-vpc2`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromInline(`
          exports.handler = async (event) => {
            console.log('lambda-vpc2 event:', JSON.stringify(event));
            return {
              statusCode: 200,
              body: JSON.stringify({
                message: 'Hello from lambda-vpc2 inside VPC2',
              }),
            };
          };
        `),
        handler: 'index.handler',
        timeout: Duration.seconds(30),
        vpc: vpc2,
        // vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });
    
  }
}
