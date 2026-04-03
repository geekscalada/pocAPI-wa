import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { InfraProps } from '@infra/bin/app.js';

export class StepFunctionsDebounceStack extends Stack {
  public readonly debounceTable: dynamodb.Table;
  public readonly debounceStateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: InfraProps) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    this.debounceTable = new dynamodb.Table(this, 'DebounceTable', {
      tableName: `${projectName}-${environmentName}-debounce`,
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const logUniqueLambda = new lambda.Function(this, 'DebounceLogUniqueLambda', {
      functionName: `${projectName}-${environmentName}-debounce-log-unique`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const { conversationId, message } = event || {};
          console.log('[DEBOUNCE] mensaje único', { conversationId, message });
          return { ok: true };
        };
      `),
    });

    const logGroupedLambda = new lambda.Function(this, 'DebounceLogGroupedLambda', {
      functionName: `${projectName}-${environmentName}-debounce-log-grouped`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const { conversationId } = event || {};
          console.log('[DEBOUNCE] Nueva agrupación de mensaje', { conversationId });
          return { ok: true };
        };
      `),
    });

    const wait30s = new sfn.Wait(this, 'Wait30Seconds', {
      time: sfn.WaitTime.duration(Duration.seconds(30)),
    });

    const getLatest = new tasks.DynamoGetItem(this, 'GetLatestConversationState', {
      table: this.debounceTable,
      key: {
        conversationId: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt('$.conversationId'),
        ),
      },
      consistentRead: true,
      resultPath: '$.latest',
    });

    const logUnique = new tasks.LambdaInvoke(this, 'LogUniqueMessage', {
      lambdaFunction: logUniqueLambda,
      payload: sfn.TaskInput.fromObject({
        conversationId: sfn.JsonPath.stringAt('$.conversationId'),
        message: sfn.JsonPath.stringAt('$.latest.Item.lastMessage.S'),
      }),
      payloadResponseOnly: true,
    });

    const logGrouped = new tasks.LambdaInvoke(this, 'LogGroupedMessage', {
      lambdaFunction: logGroupedLambda,
      payload: sfn.TaskInput.fromObject({
        conversationId: sfn.JsonPath.stringAt('$.conversationId'),
      }),
      payloadResponseOnly: true,
    });

    const groupedTrue = sfn.Condition.booleanEquals('$.latest.Item.grouped.BOOL', true);
    const decide = new sfn.Choice(this, 'WasGrouped?').when(groupedTrue, logGrouped).otherwise(logUnique);

    const definition = wait30s.next(getLatest).next(decide);

    this.debounceStateMachine = new sfn.StateMachine(this, 'DebounceStateMachine', {
      stateMachineName: `${projectName}-${environmentName}-debounce`,
      definition,
      timeout: Duration.minutes(5),
    });

    this.debounceTable.grantReadData(this.debounceStateMachine);

    new CfnOutput(this, 'DebounceTableName', { value: this.debounceTable.tableName });
    new CfnOutput(this, 'DebounceStateMachineArn', { value: this.debounceStateMachine.stateMachineArn });
  }
}
