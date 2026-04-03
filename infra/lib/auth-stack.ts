import * as cdk from 'aws-cdk-lib';
import { Stack, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { InfraProps } from '@infra/bin/app.js';

export interface AuthStackExtras {
  debounceTable?: dynamodb.ITable;
  debounceStateMachine?: sfn.IStateMachine;
}

export class AuthStack extends Stack {
  public readonly api: apigateway.RestApi;
  public readonly loginLambda: lambda.Function;
  public readonly authorizerLambda: lambda.Function;
  public readonly authorizer: apigateway.TokenAuthorizer;
  public readonly usersTable: dynamodb.Table;
  public readonly jwtSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: InfraProps, extras: AuthStackExtras = {}) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    // ========================================
    // 🚀 AUTH API (issue JWT)
    // ========================================

    this.api = new apigateway.RestApi(this, 'AuthApiV2', {
      restApiName: `${projectName}-${environmentName}-auth-api`,
      description: 'API de autenticación (validación username/password contra DynamoDB)',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
    });

    // ========================================
    // 🔐 AUTH: DynamoDB (users) + JWT secret + authorizer lambda
    // ========================================

    // NOTE: names are intentionally different vs TestingApiStack to avoid collisions.
    this.usersTable = new dynamodb.Table(this, 'AuthUsersTableV2', {
      tableName: `${projectName}-${environmentName}-auth2-users`,
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Dedicated secret for this auth stack (avoid collisions with other stacks)
    // Stored as JSON: { "jwtSecret": "..." }
    this.jwtSecret = new secretsmanager.Secret(this, 'AuthJwtSecretV2', {
      secretName: `${projectName}-${environmentName}-auth2-jwt-secret`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'jwtSecret',
        excludePunctuation: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.loginLambda = new lambda.Function(this, 'AuthLoginLambdaV2', {
      functionName: `${projectName}-${environmentName}-auth2-login`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'login.handler',
      timeout: Duration.seconds(15),
      code: lambda.Code.fromAsset('../lambdas/auth/dist'),
      environment: {
        USERS_TABLE: this.usersTable.tableName,
        JWT_SECRET_ARN: this.jwtSecret.secretArn,
        JWT_SECRET_KEY: 'jwtSecret',
      },
    });

    this.authorizerLambda = new lambda.Function(this, 'AuthAuthorizerLambdaV2', {
      functionName: `${projectName}-${environmentName}-auth2-authorizer`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'authorizer.handler',
      timeout: Duration.seconds(10),
      code: lambda.Code.fromAsset('../lambdas/auth/dist'),
      environment: {
        JWT_SECRET_ARN: this.jwtSecret.secretArn,
        JWT_SECRET_KEY: 'jwtSecret',
      },
    });

    this.usersTable.grantReadData(this.loginLambda);
    this.jwtSecret.grantRead(this.loginLambda);
    this.jwtSecret.grantRead(this.authorizerLambda);

    // Create authorizer construct now (not attached to any method yet)
    this.authorizer = new apigateway.TokenAuthorizer(this, 'AuthJwtAuthorizerV2', {
      handler: this.authorizerLambda,
      identitySource: 'method.request.header.Authorization',
      authorizerName: `${projectName}-${environmentName}-auth2-jwt-authorizer`,
      resultsCacheTtl: Duration.minutes(5),
    });

    const authResource = this.api.root.addResource('auth');

    // Public: username/password
    authResource.addResource('login').addMethod('POST', new apigateway.LambdaIntegration(this.loginLambda));

    // Protected: simple endpoint to force authorizer attachment to this RestApi
    const verifyResource = authResource.addResource('verify');
    verifyResource.addMethod(
      'GET',
      new apigateway.MockIntegration({
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: {
          'application/json': '{"statusCode": 200}',
        },
        integrationResponses: [
          {
            statusCode: '200',
            responseTemplates: {
              'application/json': '{"ok": true}',
            },
          },
        ],
      }),
      {
        authorizer: this.authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
        methodResponses: [{ statusCode: '200' }],
      },
    );

    new CfnOutput(this, 'AuthApiUrl', { value: this.api.url });
    new CfnOutput(this, 'AuthUsersTableName', { value: this.usersTable.tableName });
    new CfnOutput(this, 'AuthLoginLambdaName', { value: this.loginLambda.functionName });
    new CfnOutput(this, 'AuthAuthorizerLambdaName', { value: this.authorizerLambda.functionName });
    new CfnOutput(this, 'AuthJwtSecretName', { value: this.jwtSecret.secretName });

    // ========================================
    // 🧪 STEP FUNCTIONS: Debounce demo endpoint (optional)
    // ========================================

    if (extras.debounceTable && extras.debounceStateMachine) {
      const starterLambda = new lambda.Function(this, 'DebounceStarterLambda', {
        functionName: `${projectName}-${environmentName}-debounce-starter`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        timeout: Duration.seconds(10),
        environment: {
          DEBOUNCE_TABLE: extras.debounceTable.tableName,
          DEBOUNCE_STATE_MACHINE_ARN: extras.debounceStateMachine.stateMachineArn,
        },
        code: lambda.Code.fromInline(`
          const AWS = require('aws-sdk');
          const crypto = require('crypto');
          const ddb = new AWS.DynamoDB.DocumentClient();
          const sfn = new AWS.StepFunctions();

          exports.handler = async (event, context) => {
            try {
              const body = JSON.parse(event.body || '{}');
              const conversationId = body.conversationId;
              const message = body.message;

              if (!conversationId || typeof conversationId !== 'string') {
                return { statusCode: 400, headers: cors(), body: JSON.stringify({ ok: false, error: 'conversationId requerido' }) };
              }
              if (!message || typeof message !== 'string') {
                return { statusCode: 400, headers: cors(), body: JSON.stringify({ ok: false, error: 'message requerido' }) };
              }

              const token = (crypto.randomUUID ? crypto.randomUUID() : context.awsRequestId);
              const nowMs = Date.now();
              const ttl = Math.floor(nowMs / 1000) + 3600;

              await ddb.put({
                TableName: process.env.DEBOUNCE_TABLE,
                Item: {
                  conversationId,
                  lastToken: token,
                  lastMessage: message,
                  updatedAt: nowMs,
                  grouped: false,
                  ttl,
                },
              }).promise();

              let exec;
              try {
                exec = await sfn.startExecution({
                  stateMachineArn: process.env.DEBOUNCE_STATE_MACHINE_ARN,
                  name: conversationId,
                  input: JSON.stringify({ conversationId }),
                }).promise();
              } catch (e) {
                const err = e || {};
                const code = err.code || err.name;
                if (code === 'ExecutionAlreadyExists') {
                  await ddb.update({
                    TableName: process.env.DEBOUNCE_TABLE,
                    Key: { conversationId },
                    UpdateExpression: 'SET lastToken = :t, lastMessage = :m, updatedAt = :u, grouped = :g, ttl = :ttl',
                    ExpressionAttributeValues: {
                      ':t': token,
                      ':m': message,
                      ':u': nowMs,
                      ':g': true,
                      ':ttl': ttl,
                    },
                  }).promise();

                  return {
                    statusCode: 202,
                    headers: cors(),
                    body: JSON.stringify({ ok: true, conversationId, grouped: true, note: 'execution_already_running' }),
                  };
                }
                throw e;
              }

              return {
                statusCode: 202,
                headers: cors(),
                body: JSON.stringify({ ok: true, conversationId, token, executionArn: exec.executionArn }),
              };
            } catch (err) {
              console.error('DebounceStarter error', err);
              return { statusCode: 500, headers: cors(), body: JSON.stringify({ ok: false, error: 'internal_error' }) };
            }
          };

          function cors() {
            return {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type,Authorization',
              'Access-Control-Allow-Methods': 'OPTIONS,POST',
            };
          }
        `),
      });

      extras.debounceTable.grantWriteData(starterLambda);
      extras.debounceStateMachine.grantStartExecution(starterLambda);

      const debounceResource = this.api.root.addResource('debounce');
      debounceResource.addMethod('POST', new apigateway.LambdaIntegration(starterLambda));
    }
  }
}
