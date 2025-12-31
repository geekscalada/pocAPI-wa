import * as cdk from 'aws-cdk-lib';
import { Stack, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { InfraProps } from '@infra/bin/app.js';

export class AuthStack extends Stack {
  public readonly api: apigateway.RestApi;
  public readonly loginLambda: lambda.Function;
  public readonly usersTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: InfraProps) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    // ========================================
    // 🔐 AUTH: DynamoDB (users) only
    // ========================================

    // NOTE: names are intentionally different vs TestingApiStack to avoid collisions.
    this.usersTable = new dynamodb.Table(this, 'AuthUsersTableV2', {
      tableName: `${projectName}-${environmentName}-auth2-users`,
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.loginLambda = new lambda.Function(this, 'AuthLoginLambdaV2', {
      functionName: `${projectName}-${environmentName}-auth2-login`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'login.handler',
      timeout: Duration.seconds(15),
      code: lambda.Code.fromInline(`
        const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
        const db = new DynamoDBClient({});

        exports.handler = async (event) => {
          try {
            const body = JSON.parse(event.body || '{}');
            const { username, password } = body;
            if (!username || !password) {
              return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'username and password required' })
              };
            }

            const tableName = process.env.USERS_TABLE;
            if (!tableName) {
              return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'USERS_TABLE not configured' })
              };
            }

            const res = await db.send(new GetItemCommand({
              TableName: tableName,
              Key: { username: { S: String(username) } }
            }));

            const stored = res && res.Item && res.Item.password && res.Item.password.S ? res.Item.password.S : null;
            if (!stored || stored !== String(password)) {
              return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ ok: false, error: 'invalid credentials' })
              };
            }

            return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ ok: true, username: String(username) })
            };
          } catch (err) {
            console.error('Auth login error', err);
            return {
              statusCode: 500,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ ok: false, error: 'internal_error' })
            };
          }
        };
      `),
      environment: {
        USERS_TABLE: this.usersTable.tableName,
      },
    });

    this.usersTable.grantReadData(this.loginLambda);

    // ========================================
    // 🚀 AUTH API (issue token + validate token)
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

    const authResource = this.api.root.addResource('auth');

    // Public: username/password
    authResource.addResource('login').addMethod('POST', new apigateway.LambdaIntegration(this.loginLambda));

    new CfnOutput(this, 'AuthApiUrl', { value: this.api.url });
    new CfnOutput(this, 'AuthUsersTableName', { value: this.usersTable.tableName });
    new CfnOutput(this, 'AuthLoginLambdaName', { value: this.loginLambda.functionName });
  }
}
