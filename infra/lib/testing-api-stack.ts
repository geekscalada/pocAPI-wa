import * as cdk from 'aws-cdk-lib';
import { Stack, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { InfraProps } from '@infra/bin/app.js';
import { SECRET_KEYS } from '../const/resources.js';

export class TestingApiStack extends Stack {
  public readonly api: apigateway.RestApi;
  public readonly testLambda: lambda.Function;
  public readonly loginLambda: lambda.Function;
  public readonly authorizerLambda: lambda.Function;
  public readonly authorizer: apigateway.TokenAuthorizer;

  constructor(scope: Construct, id: string, props: InfraProps, publisherLambda: lambda.Function) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    // ========================================
    // 🔐 AUTENTICACIÓN: DynamoDB (users) + Secrets Manager (JWT key)
    // ========================================

    // Tabla de usuarios (POC) - almacenará password en claro (según petición)
    const usersTable = new dynamodb.Table(this, 'AuthUsersTable', {
      tableName: `${projectName}-${environmentName}-auth-users`,
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Usar el secreto existente "Secret-pipeline" que contiene gitHubToken y jwtSecret
    const pipelineSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'PipelineSecret',
      'Secret-pipeline'
    );

    // Lambda de Login (public) - consulta DynamoDB y firma JWT
    this.loginLambda = new lambda.Function(this, 'LoginLambda', {
      functionName: `${projectName}-${environmentName}-auth-login`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'login.handler',
      timeout: Duration.seconds(15),
      code: lambda.Code.fromAsset('../lambdas/auth/dist'),
      environment: {
        USERS_TABLE: usersTable.tableName,
        JWT_SECRET_ARN: pipelineSecret.secretArn,
        JWT_SECRET_KEY: SECRET_KEYS.JWT_SECRET
      }
    });

    // Lambda Authorizer - valida JWT
    this.authorizerLambda = new lambda.Function(this, 'AuthorizerLambda', {
      functionName: `${projectName}-${environmentName}-auth-authorizer`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'authorizer.handler',
      timeout: Duration.seconds(10),
      code: lambda.Code.fromAsset('../lambdas/auth/dist'),
      environment: {
        JWT_SECRET_ARN: pipelineSecret.secretArn,
        JWT_SECRET_KEY: 'jwtSecret' // Key dentro del secreto JSON
      }
    });

    // Grant permissions
    usersTable.grantReadData(this.loginLambda);
    pipelineSecret.grantRead(this.loginLambda);
    pipelineSecret.grantRead(this.authorizerLambda);

    // API Gateway Authorizer
    this.authorizer = new apigateway.TokenAuthorizer(this, 'JWTAuthorizer', {
      handler: this.authorizerLambda,
      identitySource: 'method.request.header.Authorization',
      authorizerName: `${projectName}-${environmentName}-jwt-authorizer`,
      resultsCacheTtl: Duration.minutes(5) // Cache tokens válidos por 5min
    });

    // ========================================
    // 🚀 API GATEWAY PARA TESTING
    // ========================================
    
    this.api = new apigateway.RestApi(this, 'TestingApi', {
      restApiName: `${projectName}-${environmentName}-testing-api`,
      description: 'API para testing del patrón Producer -> SNS -> SQS -> Consumer',
      
      // 🌐 CORS para testing desde browser
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
      },

      // 📊 Configuraciones adicionales
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      }
    });

    // ========================================
    // 📝 LAMBDA PARA TESTING MANUAL
    // ========================================
    
    // Lambda que permite enviar diferentes tipos de eventos fácilmente
    this.testLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-test-controller`,
      {
        functionName: `${projectName}-${environmentName}-test-controller`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromInline(`
          const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
          
          exports.handler = async (event) => {
            const sns = new SNSClient({});
            console.log('Test Controller - Request:', JSON.stringify(event));
            
            try {
              const body = JSON.parse(event.body || '{}');
              const { eventType = 'TEST_EVENT', id, data, forceError = false } = body;
              
              // Construir payload
              const payload = {
                event: eventType,
                id: id || \`test-\${Date.now()}\`,
                data: data || { test: true, timestamp: new Date().toISOString() },
                source: 'testing-api',
                forceError: forceError
              };
              
              // Enviar a SNS
              const command = new PublishCommand({
                TopicArn: process.env.TOPIC_ARN,
                Message: JSON.stringify(payload),
                Subject: \`Test Event: \${eventType}\`,
                MessageAttributes: {
                  eventType: { DataType: 'String', StringValue: eventType },
                  source: { DataType: 'String', StringValue: 'testing-api' },
                  testMode: { DataType: 'String', StringValue: 'true' }
                }
              });
              
              const result = await sns.send(command);
              console.log('Message sent:', result.MessageId);
              
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
                  message: \`Event "\${eventType}" sent successfully\`
                })
              };
              
            } catch (error) {
              console.error('Error:', error);
              return {
                statusCode: 500,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  success: false,
                  error: error.message,
                  message: 'Failed to send event'
                })
              };
            }
          };
        `),
        handler: 'index.handler',
        timeout: Duration.seconds(30),
        environment: {
          TOPIC_ARN: '', // Se configurará después
        }
      }
    );

    // ========================================
    // 🔗 ENDPOINTS API GATEWAY
    // ========================================

    // Root endpoint con información de la API
    this.api.root.addMethod('GET', new apigateway.LambdaIntegration(
      new lambda.Function(this, 'InfoLambda', {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromInline(`
          exports.handler = async () => ({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
              api: '${projectName}-${environmentName}-testing-api',
              description: 'Testing API for SQS Consumer POC',
              endpoints: {
                'POST /send': 'Send test events',
                'POST /send/user-created': 'Send USER_CREATED event',
                'POST /send/user-updated': 'Send USER_UPDATED event',  
                'POST /send/order-placed': 'Send ORDER_PLACED event',
                'POST /send/error-test': 'Send event that will cause errors',
                'GET /': 'This info'
              },
              examples: {
                'Basic event': { eventType: 'TEST_EVENT', id: 'test-123', data: { name: 'Test' } },
                'Force error': { eventType: 'TEST_EVENT', id: 'error-test', forceError: true }
              }
            })
          });
        `),
        handler: 'index.handler'
      })
    ));

    // ========================================
    // 🔐 ENDPOINT DE LOGIN (PÚBLICO - No requiere auth)
    // ========================================
    const authResource = this.api.root.addResource('auth');
    const loginResource = authResource.addResource('login');
    loginResource.addMethod('POST', new apigateway.LambdaIntegration(this.loginLambda));

    // ========================================
    // 🔒 ENDPOINTS PROTEGIDOS CON JWT
    // ========================================
    
    // Endpoint principal para enviar eventos (PROTEGIDO)
    const sendResource = this.api.root.addResource('send');
    sendResource.addMethod('POST', new apigateway.LambdaIntegration(this.testLambda), {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    // Endpoints específicos para diferentes tipos de eventos
    const userCreatedResource = sendResource.addResource('user-created');
    userCreatedResource.addMethod('POST', new apigateway.LambdaIntegration(
      new lambda.Function(this, 'UserCreatedLambda', {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromInline(`
          const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
          exports.handler = async (event) => {
            const sns = new SNSClient({});
            const body = JSON.parse(event.body || '{}');
            
            const payload = {
              event: 'USER_CREATED',
              id: body.id || \`user-\${Date.now()}\`,
              data: { name: body.name || 'Test User', email: body.email || 'test@example.com' }
            };
            
            const result = await sns.send(new PublishCommand({
              TopicArn: process.env.TOPIC_ARN,
              Message: JSON.stringify(payload),
              MessageAttributes: { eventType: { DataType: 'String', StringValue: 'USER_CREATED' } }
            }));
            
            return {
              statusCode: 200,
              headers: { 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ success: true, messageId: result.MessageId, payload })
            };
          };
        `),
        handler: 'index.handler',
        environment: { TOPIC_ARN: '' }
      })
    ), {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    // Endpoint para forzar errores
    const errorTestResource = sendResource.addResource('error-test');
    errorTestResource.addMethod('POST', new apigateway.LambdaIntegration(
      new lambda.Function(this, 'ErrorTestLambda', {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromInline(`
          const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
          exports.handler = async (event) => {
            const sns = new SNSClient({});
            
            const payload = {
              event: 'ERROR_TEST',
              id: \`error-test-\${Date.now()}\`,
              data: { shouldFail: true, reason: 'Forced error for testing DLQ' },
              forceError: true
            };
            
            const result = await sns.send(new PublishCommand({
              TopicArn: process.env.TOPIC_ARN,
              Message: JSON.stringify(payload),
              MessageAttributes: { 
                eventType: { DataType: 'String', StringValue: 'ERROR_TEST' },
                forceError: { DataType: 'String', StringValue: 'true' }
              }
            }));
            
            return {
              statusCode: 200,
              headers: { 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ 
                success: true, 
                messageId: result.MessageId, 
                payload,
                warning: 'This message will fail processing and go to DLQ after 3 attempts'
              })
            };
          };
        `),
        handler: 'index.handler',
        environment: { TOPIC_ARN: '' }
      })
    ), {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    // ========================================
    // 📊 OUTPUTS
    // ========================================
    
    new CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'URL base de la API de testing',
      exportName: `${projectName}-${environmentName}-TestingApiUrl`
    });

    new CfnOutput(this, 'TestingEndpoints', {
      value: JSON.stringify({
        login: `${this.api.url}auth/login`,
        info: `${this.api.url}`,
        sendEvent: `${this.api.url}send`,
        userCreated: `${this.api.url}send/user-created`,
        errorTest: `${this.api.url}send/error-test`
      }),
      description: '🔐 Endpoints - Login público, otros requieren JWT'
    });

    new CfnOutput(this, 'AuthInfo', {
      value: JSON.stringify({
        loginEndpoint: `${this.api.url}auth/login`,
        usersTable: usersTable.tableName,
        jwtSecretArn: pipelineSecret.secretArn,
        jwtSecretKey: 'jwtSecret',
        usage: 'POST /auth/login with {username, password} → returns {token}',
        seedExample: `aws dynamodb put-item --table-name ${usersTable.tableName} --item '{"username":{"S":"admin"},"password":{"S":"admin123"}}'`
      }),
      description: '🔑 Información de autenticación JWT (usa Secret-pipeline con key: jwtSecret)'
    });
  }

  // Método para configurar el topic ARN después de la creación
  public configureTopicArn(topicArn: string) {
    this.testLambda.addEnvironment('TOPIC_ARN', topicArn);
    
    // Configurar ARN en todas las lambdas del API
    this.node.findAll().forEach(node => {
      if (node instanceof lambda.Function && node !== this.testLambda) {
        node.addEnvironment('TOPIC_ARN', topicArn);
      }
    });
  }
}