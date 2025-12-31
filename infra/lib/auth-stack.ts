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
  public readonly jwtSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: InfraProps) {
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
      restApi: this.api,
      handler: this.authorizerLambda,
      identitySource: 'method.request.header.Authorization',
      authorizerName: `${projectName}-${environmentName}-auth2-jwt-authorizer`,
      resultsCacheTtl: Duration.minutes(5),
    });

    const authResource = this.api.root.addResource('auth');

    // Public: username/password
    authResource.addResource('login').addMethod('POST', new apigateway.LambdaIntegration(this.loginLambda));

    new CfnOutput(this, 'AuthApiUrl', { value: this.api.url });
    new CfnOutput(this, 'AuthUsersTableName', { value: this.usersTable.tableName });
    new CfnOutput(this, 'AuthLoginLambdaName', { value: this.loginLambda.functionName });
    new CfnOutput(this, 'AuthAuthorizerLambdaName', { value: this.authorizerLambda.functionName });
    new CfnOutput(this, 'AuthJwtSecretName', { value: this.jwtSecret.secretName });
  }
}
