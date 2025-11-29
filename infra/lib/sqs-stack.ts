import { Stack, StackProps, Duration, CfnOutput, Fn, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { InfraProps } from '@infra/bin/app.js';
import { ITopic } from 'aws-cdk-lib/aws-sns';

export class SqsStack extends Stack {
  public readonly mainQueue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly consumerLambda: lambda.Function;
  public readonly idempotencyTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: InfraProps & { testTopic?: ITopic }) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue.fifo', {
      queueName: `${projectName}-${environmentName}-dlq.fifo`,
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.minutes(5),
      fifo: true,
    });

    this.mainQueue = new sqs.Queue(this, 'MainQueue.fifo', {
      queueName: `${projectName}-${environmentName}-main-queue.fifo`,
      visibilityTimeout: Duration.minutes(3),
      retentionPeriod: Duration.days(4),
      deliveryDelay: Duration.seconds(0),
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 2,
      },
      fifo: true,
      contentBasedDeduplication: true,
      deduplicationScope: sqs.DeduplicationScope.MESSAGE_GROUP,
      fifoThroughputLimit: sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
    });

    const testTopic = props.testTopic ?? sns.Topic.fromTopicArn(this, 'ImportedTestTopic', Fn.importValue("TestTopicArn"));
    
    const subscription = new snsSubscriptions.SqsSubscription(this.mainQueue, {
      rawMessageDelivery: false,
    });

    testTopic.addSubscription(subscription);

    this.idempotencyTable = new dynamodb.Table(this, 'IdempotencyTable', {
      tableName: `${projectName}-${environmentName}-idempotency-v2`,
      partitionKey: { 
        name: 'id', 
        type: dynamodb.AttributeType.STRING 
      },
      timeToLiveAttribute: 'ttl',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const consumerLambdaBaseName = 'sqs-consumer';
    
    this.consumerLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-${consumerLambdaBaseName}`,
      {
        functionName: `${projectName}-${environmentName}-${consumerLambdaBaseName}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset('../lambdas/consumer/dist'),
        handler: 'index.handler',
        timeout: Duration.minutes(2),
        environment: {
          ENVIRONMENT: environmentName,
          PROJECT_NAME: projectName,
          FORCE_ERROR: 'false',
          ERROR_RATE: '0',
          PROCESSING_DELAY: '1000',
          IDEMPOTENCY_TABLE: this.idempotencyTable.tableName,
          ENABLE_IDEMPOTENCY: 'true',
          LOG_LEVEL: 'INFO'
        },
        memorySize: 256,
      },
    );

    const sqsEventSource = new lambdaEventSources.SqsEventSource(this.mainQueue, {
      batchSize: 5,
      maxConcurrency: 2,
      reportBatchItemFailures: true,
    });

    this.consumerLambda.addEventSource(sqsEventSource);
    this.mainQueue.grantConsumeMessages(this.consumerLambda);
    this.deadLetterQueue.grantSendMessages(this.consumerLambda);
    this.idempotencyTable.grantReadWriteData(this.consumerLambda);

    this.consumerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*']
      })
    );

    new CfnOutput(this, 'MainQueueUrl', {
      value: this.mainQueue.queueUrl,
      description: 'URL de la cola principal SQS',
      exportName: `${projectName}-${environmentName}-MainQueueUrl`
    });

    new CfnOutput(this, 'MainQueueArn', {
      value: this.mainQueue.queueArn,
      description: 'ARN de la cola principal SQS',
      exportName: `${projectName}-${environmentName}-MainQueueArn`
    });

    new CfnOutput(this, 'DeadLetterQueueUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'URL de la Dead Letter Queue',
      exportName: `${projectName}-${environmentName}-DLQUrl`
    });

    new CfnOutput(this, 'DeadLetterQueueArn', {
      value: this.deadLetterQueue.queueArn,
      description: 'ARN de la Dead Letter Queue',
      exportName: `${projectName}-${environmentName}-DLQArn`
    });

    new CfnOutput(this, 'ConsumerLambdaArn', {
      value: this.consumerLambda.functionArn,
      description: 'ARN de la Lambda Consumer SQS',
      exportName: `${projectName}-${environmentName}-ConsumerLambdaArn`
    });

    new CfnOutput(this, 'ConsumerLambdaName', {
      value: this.consumerLambda.functionName,
      description: 'Nombre de la Lambda Consumer SQS',
      exportName: `${projectName}-${environmentName}-ConsumerLambdaName`
    });

    new CfnOutput(this, 'IdempotencyTableName', {
      value: this.idempotencyTable.tableName,
      description: 'Tabla DynamoDB para idempotencia',
      exportName: `${projectName}-${environmentName}-IdempotencyTable`
    });
  }
}