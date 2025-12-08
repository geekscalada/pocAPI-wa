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
  public readonly directQueue: sqs.Queue;
  public readonly directProducerLambda: lambda.Function;
  public readonly directConsumerLambda: lambda.Function;
  public readonly fanoutQueue: sqs.Queue;
  public readonly fanoutConsumerLambda: lambda.Function;
  public readonly apiDirectQueue: sqs.Queue;
  public readonly apiDirectConsumerLambda: lambda.Function;
  public readonly dedupDirectQueue: sqs.Queue;
  public readonly dedupDirectProducerLambda: lambda.Function;
  public readonly dedupDirectConsumerLambda: lambda.Function;

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
      contentBasedDeduplication: false,
      //deduplicationScope: sqs.DeduplicationScope.MESSAGE_GROUP,
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

    this.directQueue = new sqs.Queue(this, 'DirectQueue', {
      queueName: `${projectName}-${environmentName}-direct-no-sns-queue`,
      visibilityTimeout: Duration.minutes(2),
      retentionPeriod: Duration.days(4),
      receiveMessageWaitTime: Duration.seconds(0),
    });

    this.directProducerLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-direct-producer`,
      {
        functionName: `${projectName}-${environmentName}-direct-producer`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        timeout: Duration.seconds(30),
        code: lambda.Code.fromInline(`
          const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
          const sqs = new SQSClient({});
          
          exports.handler = async (event) => {
            console.log('Direct Producer (no SNS) - Request:', JSON.stringify(event));
            
            try {
              const body = JSON.parse(event.body || '{}');
              const { id, data } = body;
              
              const payload = {
                event: 'DIRECT_NO_SNS',
                id: id || \`direct-\${Date.now()}\`,
                data: data || { test: true, timestamp: new Date().toISOString() },
                source: 'lambda-direct-producer'
              };
              
              const command = new SendMessageCommand({
                QueueUrl: process.env.QUEUE_URL,
                MessageBody: JSON.stringify(payload)
              });
              
              const result = await sqs.send(command);
              console.log('Message sent to SQS (no SNS):', result.MessageId);
              
              return {
                statusCode: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  success: true,
                  messageId: result.MessageId,
                  payload: payload,
                  message: 'Message sent directly to SQS (bypassing SNS)'
                })
              };
              
            } catch (error) {
              console.error('Direct producer error:', error);
              return {
                statusCode: 500,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  success: false,
                  error: error.message,
                  message: 'Failed to send message to SQS'
                })
              };
            }
          };
        `),
        environment: {
          QUEUE_URL: this.directQueue.queueUrl
        },
        memorySize: 256,
      },
    );

    this.directQueue.grantSendMessages(this.directProducerLambda);

    this.directConsumerLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-direct-consumer`,
      {
        functionName: `${projectName}-${environmentName}-direct-consumer`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset('../lambdas/consumer/dist'),
        handler: 'index.handler',
        timeout: Duration.minutes(1),
        environment: {
          ENVIRONMENT: environmentName,
          PROJECT_NAME: projectName,
          QUEUE_TYPE: 'DIRECT_NO_SNS',
          LOG_PREFIX: '🔵 [DIRECT-NO-SNS]'
        },
        memorySize: 256,
      },
    );

    const directEventSource = new lambdaEventSources.SqsEventSource(this.directQueue, {
      batchSize: 5,
      reportBatchItemFailures: true,
    });

    this.directConsumerLambda.addEventSource(directEventSource);
    this.directQueue.grantConsumeMessages(this.directConsumerLambda);

    this.fanoutQueue = new sqs.Queue(this, 'FanoutQueue.fifo', {
      queueName: `${projectName}-${environmentName}-fanout-queue.fifo`,
      visibilityTimeout: Duration.minutes(2),
      retentionPeriod: Duration.days(4),
      fifo: true,
      contentBasedDeduplication: false,
      //deduplicationScope: sqs.DeduplicationScope.MESSAGE_GROUP,
      fifoThroughputLimit: sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      receiveMessageWaitTime: Duration.seconds(10),
    });

    const fanoutSubscription = new snsSubscriptions.SqsSubscription(this.fanoutQueue, {
      rawMessageDelivery: false,
    });
    testTopic.addSubscription(fanoutSubscription);

    this.fanoutConsumerLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-fanout-consumer`,
      {
        functionName: `${projectName}-${environmentName}-fanout-consumer`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset('../lambdas/consumer/dist'),
        handler: 'index.handler',
        timeout: Duration.minutes(1),
        environment: {
          ENVIRONMENT: environmentName,
          PROJECT_NAME: projectName,
          QUEUE_TYPE: 'FANOUT_FROM_SNS',
          LOG_PREFIX: '🟢 [FANOUT-SNS]'
        },
        memorySize: 256,
      },
    );

    const fanoutEventSource = new lambdaEventSources.SqsEventSource(this.fanoutQueue, {
      batchSize: 5,
      maxConcurrency: 2,
      reportBatchItemFailures: true,
    });

    this.fanoutConsumerLambda.addEventSource(fanoutEventSource);
    this.fanoutQueue.grantConsumeMessages(this.fanoutConsumerLambda);

    this.apiDirectQueue = new sqs.Queue(this, 'ApiDirectQueue', {
      queueName: `${projectName}-${environmentName}-api-direct-queue`,
      visibilityTimeout: Duration.minutes(2),
      retentionPeriod: Duration.days(4),
      receiveMessageWaitTime: Duration.seconds(0),
    });

    this.apiDirectConsumerLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-api-direct-consumer`,
      {
        functionName: `${projectName}-${environmentName}-api-direct-consumer`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset('../lambdas/consumer/dist'),
        handler: 'index.handler',
        timeout: Duration.minutes(1),
        environment: {
          ENVIRONMENT: environmentName,
          PROJECT_NAME: projectName,
          QUEUE_TYPE: 'API_DIRECT',
          LOG_PREFIX: '🟣 [API-DIRECT]'
        },
        memorySize: 256,
      },
    );

    const apiDirectEventSource = new lambdaEventSources.SqsEventSource(this.apiDirectQueue, {
      batchSize: 5,
      reportBatchItemFailures: true,
    });

    this.apiDirectConsumerLambda.addEventSource(apiDirectEventSource);
    this.apiDirectQueue.grantConsumeMessages(this.apiDirectConsumerLambda);

    this.dedupDirectQueue = new sqs.Queue(this, 'DedupDirectQueue.fifo', {
      queueName: `${projectName}-${environmentName}-dedup-direct-queue.fifo`,
      visibilityTimeout: Duration.minutes(2),
      retentionPeriod: Duration.days(4),
      fifo: true,
      contentBasedDeduplication: false,
      fifoThroughputLimit: sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
    });

    this.dedupDirectProducerLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-dedup-direct-producer`,
      {
        functionName: `${projectName}-${environmentName}-dedup-direct-producer`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        timeout: Duration.seconds(30),
        code: lambda.Code.fromInline(`
          const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
          const sqs = new SQSClient({});
          
          exports.handler = async (event) => {
            console.log('Dedup Direct Producer - Request:', JSON.stringify(event));
            
            try {
              const body = JSON.parse(event.body || '{}');
              const { id, data, groupId, MessageDeduplicationId } = body;
              
              const payload = {
                event: 'DEDUP_DIRECT',
                id: id || 'dedup-test',
                data: data || { test: true, timestamp: new Date().toISOString() },
                source: 'lambda-dedup-direct-producer'
              };
              
              const command = new SendMessageCommand({
                QueueUrl: process.env.QUEUE_URL,
                MessageBody: JSON.stringify(payload),
                MessageGroupId: groupId || 'dedup-group-1',
                MessageDeduplicationId: MessageDeduplicationId || (id || 'dedup-test'),
              });
              
              const result = await sqs.send(command);
              console.log('Message sent to SQS (DEDUP_DIRECT):', result.MessageId);
              
              return {
                statusCode: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  success: true,
                  messageId: result.MessageId,
                  payload: payload,
                  message: 'Message sent to FIFO SQS with explicit dedup id'
                })
              };
              
            } catch (error) {
              console.error('Dedup direct producer error:', error);
              return {
                statusCode: 500,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  success: false,
                  error: error.message,
                  message: 'Failed to send message to SQS (dedup direct)'
                })
              };
            }
          };
        `),
        environment: {
          QUEUE_URL: this.dedupDirectQueue.queueUrl,
        },
        memorySize: 256,
      },
    );

    this.dedupDirectQueue.grantSendMessages(this.dedupDirectProducerLambda);

    this.dedupDirectConsumerLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-dedup-direct-consumer`,
      {
        functionName: `${projectName}-${environmentName}-dedup-direct-consumer`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset('../lambdas/consumer/dist'),
        handler: 'index.handler',
        timeout: Duration.minutes(1),
        environment: {
          ENVIRONMENT: environmentName,
          PROJECT_NAME: projectName,
          QUEUE_TYPE: 'DEDUP_DIRECT',
          LOG_PREFIX: '🧬 [DEDUP-DIRECT]'
        },
        memorySize: 256,
      },
    );

    const dedupDirectEventSource = new lambdaEventSources.SqsEventSource(this.dedupDirectQueue, {
      batchSize: 5,
      reportBatchItemFailures: true,
    });

    this.dedupDirectConsumerLambda.addEventSource(dedupDirectEventSource);
    this.dedupDirectQueue.grantConsumeMessages(this.dedupDirectConsumerLambda);

    new CfnOutput(this, 'DirectQueueUrl', {
      value: this.directQueue.queueUrl,
      description: 'URL de la cola directa sin SNS',
      exportName: `${projectName}-${environmentName}-DirectQueueUrl`
    });

    new CfnOutput(this, 'DirectQueueArn', {
      value: this.directQueue.queueArn,
      description: 'ARN de la cola directa sin SNS',
      exportName: `${projectName}-${environmentName}-DirectQueueArn`
    });

    new CfnOutput(this, 'FanoutQueueUrl', {
      value: this.fanoutQueue.queueUrl,
      description: 'URL de la cola fanout FIFO',
      exportName: `${projectName}-${environmentName}-FanoutQueueUrl`
    });

    new CfnOutput(this, 'FanoutQueueArn', {
      value: this.fanoutQueue.queueArn,
      description: 'ARN de la cola fanout FIFO',
      exportName: `${projectName}-${environmentName}-FanoutQueueArn`
    });

    new CfnOutput(this, 'ApiDirectQueueUrl', {
      value: this.apiDirectQueue.queueUrl,
      description: 'URL de la cola API Gateway directo',
      exportName: `${projectName}-${environmentName}-ApiDirectQueueUrl`
    });

    new CfnOutput(this, 'ApiDirectQueueArn', {
      value: this.apiDirectQueue.queueArn,
      description: 'ARN de la cola API Gateway directo',
      exportName: `${projectName}-${environmentName}-ApiDirectQueueArn`
    });

    new CfnOutput(this, 'DedupDirectQueueUrl', {
      value: this.dedupDirectQueue.queueUrl,
      description: 'URL de la cola FIFO de deduplicación directa',
      exportName: `${projectName}-${environmentName}-DedupDirectQueueUrl`
    });

    new CfnOutput(this, 'DedupDirectQueueArn', {
      value: this.dedupDirectQueue.queueArn,
      description: 'ARN de la cola FIFO de deduplicación directa',
      exportName: `${projectName}-${environmentName}-DedupDirectQueueArn`
    });

    new CfnOutput(this, 'DirectProducerLambdaArn', {
      value: this.directProducerLambda.functionArn,
      description: 'ARN de la Lambda Producer directa (sin SNS)',
      exportName: `${projectName}-${environmentName}-DirectProducerArn`
    });
  }
}