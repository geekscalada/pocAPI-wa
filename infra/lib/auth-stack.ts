import * as cdk from 'aws-cdk-lib';
import { Stack, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { InfraProps } from '@infra/bin/app.js';

export class AuthStack extends Stack {
  public readonly api: apigateway.RestApi;
  public readonly loginLambda: lambda.Function;
  public readonly authorizerLambda: lambda.Function;
  public readonly authorizer: apigateway.TokenAuthorizer;
  public readonly usersTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: InfraProps) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    // ========================================
    // 🔐 AUTH: DynamoDB (users) + Secrets Manager (JWT secret + auth key)
    // ========================================

    // NOTE: names are intentionally different vs TestingApiStack to avoid collisions.
    this.usersTable = new dynamodb.Table(this, 'AuthUsersTableV2', {
      tableName: `${projectName}-${environmentName}-auth2-users`,
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const pipelineSecret = secretsmanager.Secret.fromSecretNameV2(this, 'AuthPipelineSecretV2', 'Secret-pipeline');

    this.loginLambda = new lambda.Function(this, 'AuthLoginLambdaV2', {
      functionName: `${projectName}-${environmentName}-auth2-login`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'login.handler',
      timeout: Duration.seconds(15),
      code: lambda.Code.fromAsset('../lambdas/auth/dist'),
      environment: {
        USERS_TABLE: this.usersTable.tableName,
        JWT_SECRET_ARN: pipelineSecret.secretArn,
        // Field names inside the Secret-pipeline JSON
        JWT_SECRET_KEY: 'jwtSecret',
        AUTH_KEY_SECRET_KEY: 'authKey',
      },
    });

    this.authorizerLambda = new lambda.Function(this, 'AuthAuthorizerLambdaV2', {
      functionName: `${projectName}-${environmentName}-auth2-authorizer`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'authorizer.handler',
      timeout: Duration.seconds(10),
      code: lambda.Code.fromAsset('../lambdas/auth/dist'),
      environment: {
        JWT_SECRET_ARN: pipelineSecret.secretArn,
        JWT_SECRET_KEY: 'jwtSecret',
      },
    });

    this.usersTable.grantReadData(this.loginLambda);
    pipelineSecret.grantRead(this.loginLambda);
    pipelineSecret.grantRead(this.authorizerLambda);

    this.authorizer = new apigateway.TokenAuthorizer(this, 'AuthJwtAuthorizerV2', {
      handler: this.authorizerLambda,
      identitySource: 'method.request.header.Authorization',
      authorizerName: `${projectName}-${environmentName}-auth2-jwt-authorizer`,
      resultsCacheTtl: Duration.minutes(5),
    });

    // ========================================
    // 🚀 AUTH API (issue token + validate token)
    // ========================================

    this.api = new apigateway.RestApi(this, 'AuthApiV2', {
      restApiName: `${projectName}-${environmentName}-auth-api`,
      description: 'API de autenticación (emitir JWT y validar JWT con authorizer)',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Auth-Key'],
      },
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
    });

    const authResource = this.api.root.addResource('auth');

    // Public: username/password (same handler)
    authResource.addResource('login').addMethod('POST', new apigateway.LambdaIntegration(this.loginLambda));

    // Public: auth key (x-auth-key header) (same handler)
    authResource.addResource('token').addMethod('POST', new apigateway.LambdaIntegration(this.loginLambda));

    // Protected: validates JWT using the authorizer
    const meLambda = new lambda.Function(this, 'AuthMeLambdaV2', {
      functionName: `${projectName}-${environmentName}-auth2-me`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const ctx = event.requestContext && event.requestContext.authorizer ? event.requestContext.authorizer : {};
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ ok: true, principalId: ctx.principalId, username: ctx.username })
          };
        };
      `),
    });

    authResource.addResource('me').addMethod('GET', new apigateway.LambdaIntegration(meLambda), {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    new CfnOutput(this, 'AuthApiUrl', { value: this.api.url });
    new CfnOutput(this, 'AuthUsersTableName', { value: this.usersTable.tableName });
    new CfnOutput(this, 'AuthLoginLambdaName', { value: this.loginLambda.functionName });
    new CfnOutput(this, 'AuthAuthorizerLambdaName', { value: this.authorizerLambda.functionName });
  }
}
