// import * as cdk from 'aws-cdk-lib';
// import { Stack, CfnOutput, Duration } from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import * as apigateway from 'aws-cdk-lib/aws-apigateway';
// import * as lambda from 'aws-cdk-lib/aws-lambda';
// import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
// import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
// import * as iam from 'aws-cdk-lib/aws-iam';
// import { InfraProps } from '@infra/bin/app.js';
// import { SECRET_KEYS } from '../const/resources.js';

// export class TestingApiStack extends Stack {
//   public readonly api: apigateway.RestApi;
//   public readonly testLambda: lambda.Function;
//   public readonly loginLambda: lambda.Function;
//   public readonly authorizerLambda: lambda.Function;
//   public readonly authorizer: apigateway.TokenAuthorizer;

//   constructor(scope: Construct, id: string, props: InfraProps, publisherLambda: lambda.Function, directProducerLambda: lambda.Function, dedupDirectProducerLambda: lambda.Function, apiDirectQueueName?: string, apiDirectQueueArn?: string) {
//     super(scope, id, props);

//     const { projectName, environmentName } = props;

//     // ========================================
//     // 🔐 AUTENTICACIÓN: DynamoDB (users) + Secrets Manager (JWT key)
//     // ========================================

//     // Tabla de usuarios (POC) - almacenará password en claro (según petición)
//     const usersTable = new dynamodb.Table(this, 'AuthUsersTable', {
//       tableName: `${projectName}-${environmentName}-auth-users`,
//       partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
//       removalPolicy: cdk.RemovalPolicy.DESTROY
//     });

//     // Usar el secreto existente "Secret-pipeline" que contiene gitHubToken y jwtSecret
//     const pipelineSecret = secretsmanager.Secret.fromSecretNameV2(
//       this,
//       'PipelineSecret',
//       'Secret-pipeline'
//     );

//     // Lambda de Login (public) - consulta DynamoDB y firma JWT
//     this.loginLambda = new lambda.Function(this, 'LoginLambda', {
//       functionName: `${projectName}-${environmentName}-auth-login`,
//       runtime: lambda.Runtime.NODEJS_20_X,
//       handler: 'login.handler',
//       timeout: Duration.seconds(15),
//       code: lambda.Code.fromAsset('../lambdas/auth/dist'),
//       environment: {
//         USERS_TABLE: usersTable.tableName,
//         JWT_SECRET_ARN: pipelineSecret.secretArn,
//         JWT_SECRET_KEY: SECRET_KEYS.JWT_SECRET
//       }
//     });

//     // Lambda Authorizer - valida JWT
//     this.authorizerLambda = new lambda.Function(this, 'AuthorizerLambda', {
//       functionName: `${projectName}-${environmentName}-auth-authorizer`,
//       runtime: lambda.Runtime.NODEJS_20_X,
//       handler: 'authorizer.handler',
//       timeout: Duration.seconds(10),
//       code: lambda.Code.fromAsset('../lambdas/auth/dist'),
//       environment: {
//         JWT_SECRET_ARN: pipelineSecret.secretArn,
//         JWT_SECRET_KEY: SECRET_KEYS.JWT_SECRET // Key dentro del secreto JSON
//       }
//     });

//     // Grant permissions
//     usersTable.grantReadData(this.loginLambda);
//     pipelineSecret.grantRead(this.loginLambda);
//     pipelineSecret.grantRead(this.authorizerLambda);

//     // API Gateway Authorizer
//     this.authorizer = new apigateway.TokenAuthorizer(this, 'JWTAuthorizer', {
//       handler: this.authorizerLambda,
//       identitySource: 'method.request.header.Authorization',
//       authorizerName: `${projectName}-${environmentName}-jwt-authorizer`,
//       resultsCacheTtl: Duration.minutes(5) // Cache tokens válidos por 5min
//     });

//     // ========================================
//     // 🚀 API GATEWAY PARA TESTING
//     // ========================================
    
//     this.api = new apigateway.RestApi(this, 'TestingApi', {
//       restApiName: `${projectName}-${environmentName}-testing-api`,
//       description: 'API para testing del patrón Producer -> SNS -> SQS -> Consumer',
      
//       // 🌐 CORS para testing desde browser
//       defaultCorsPreflightOptions: {
//         allowOrigins: apigateway.Cors.ALL_ORIGINS,
//         allowMethods: apigateway.Cors.ALL_METHODS,
//         allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
//       },

//       // 📊 Configuraciones adicionales
//       endpointConfiguration: {
//         types: [apigateway.EndpointType.REGIONAL]
//       }
//     });

//     // ========================================
//     // 📝 USAR PUBLISHER LAMBDA EXISTENTE
//     // ========================================
    
//     // Usamos el publisherLambda que ya está configurado con el topic SNS
//     this.testLambda = publisherLambda;

//     // ========================================
//     // 🔗 ENDPOINTS API GATEWAY
//     // ========================================

//     // Root endpoint con información de la API
//     this.api.root.addMethod('GET', new apigateway.LambdaIntegration(
//       new lambda.Function(this, 'InfoLambda', {
//         runtime: lambda.Runtime.NODEJS_20_X,
//         code: lambda.Code.fromInline(`
//           exports.handler = async () => ({
//             statusCode: 200,
//             headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
//             body: JSON.stringify({
//               api: '${projectName}-${environmentName}-testing-api',
//               description: 'Testing API for SQS Consumer POC',
//               endpoints: {
//                 'POST /send': 'Send test events',
//                 'POST /send/user-created': 'Send USER_CREATED event',
//                 'POST /send/user-updated': 'Send USER_UPDATED event',  
//                 'POST /send/order-placed': 'Send ORDER_PLACED event',
//                 'POST /send/error-test': 'Send event that will cause errors',
//                 'GET /': 'This info'
//               },
//               examples: {
//                 'Basic event': { eventType: 'TEST_EVENT', id: 'test-123', data: { name: 'Test' } },
//                 'Force error': { eventType: 'TEST_EVENT', id: 'error-test', forceError: true }
//               }
//             })
//           });
//         `),
//         handler: 'index.handler'
//       })
//     ));

//     // ========================================
//     // 🔐 ENDPOINT DE LOGIN (PÚBLICO - No requiere auth)
//     // ========================================
//     const authResource = this.api.root.addResource('auth');
//     const loginResource = authResource.addResource('login');
//     loginResource.addMethod('POST', new apigateway.LambdaIntegration(this.loginLambda));

//     // ========================================
//     // 🔒 ENDPOINTS PROTEGIDOS CON JWT
//     // ========================================
    
//     // Endpoint principal para enviar eventos (PROTEGIDO)
//     const sendResource = this.api.root.addResource('send');
//     sendResource.addMethod('POST', new apigateway.LambdaIntegration(this.testLambda), {
//       authorizer: this.authorizer,
//       authorizationType: apigateway.AuthorizationType.CUSTOM
//     });

//     // Endpoint producer directo SQS sin SNS (PROTEGIDO)
//     const directProducerResource = this.api.root.addResource('direct-no-sns');
//     directProducerResource.addMethod('POST', new apigateway.LambdaIntegration(directProducerLambda), {
//       authorizer: this.authorizer,
//       authorizationType: apigateway.AuthorizationType.CUSTOM
//     });

//     const dedupDirectResource = this.api.root.addResource('dedup-direct');
//     dedupDirectResource.addMethod('POST', new apigateway.LambdaIntegration(dedupDirectProducerLambda), {
//       authorizer: this.authorizer,
//       authorizationType: apigateway.AuthorizationType.CUSTOM
//     });

//     // Integración directa API Gateway -> SQS (PROTEGIDO)
//     if (apiDirectQueueArn && apiDirectQueueName) {
//       // Request Validator para validación automática
//       const requestValidator = new apigateway.RequestValidator(this, 'ApiDirectRequestValidator', {
//         restApi: this.api,
//         requestValidatorName: 'api-direct-body-validator',
//         validateRequestBody: true,
//         validateRequestParameters: false,
//       });

//       // Modelo JSON Schema para validar el body
//       const requestModel = new apigateway.Model(this, 'ApiDirectRequestModel', {
//         restApi: this.api,
//         contentType: 'application/json',
//         modelName: 'ApiDirectRequest',
//         schema: {
//           type: apigateway.JsonSchemaType.OBJECT,
//           required: ['id', 'data'],
//           properties: {
//             id: {
//               type: apigateway.JsonSchemaType.STRING,
//               minLength: 1,
//             },
//             data: {
//               type: apigateway.JsonSchemaType.OBJECT,
//             },
//           },
//         },
//       });

//       const apiDirectIntegration = new apigateway.AwsIntegration({
//         service: 'sqs',
//         path: `${cdk.Aws.ACCOUNT_ID}/${apiDirectQueueName}`,
//         region: cdk.Aws.REGION,
//         integrationHttpMethod: 'POST',
//         options: {
//           credentialsRole: new iam.Role(this, 'ApiGatewaySqsRole', {
//             assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
//             inlinePolicies: {
//               SendMessagePolicy: new iam.PolicyDocument({
//                 statements: [
//                   new iam.PolicyStatement({
//                     actions: ['sqs:SendMessage'],
//                     resources: [apiDirectQueueArn],
//                   }),
//                 ],
//               }),
//             },
//           }),
//           requestParameters: {
//             'integration.request.header.Content-Type': "'application/x-www-form-urlencoded'",
//           },
//           requestTemplates: {
//             'application/json': `Action=SendMessage&MessageBody=$util.urlEncode($input.body)`,
//           },
//           integrationResponses: [
//             {
//               statusCode: '200',
//               responseTemplates: {
//                 'application/json': `{
//   "success": true,
//   "message": "Message sent to SQS via API Gateway direct integration",
//   "messageId": "$util.escapeJavaScript($input.path('$.SendMessageResponse.SendMessageResult.MessageId'))"
// }`,
//               },
//             },
//             {
//               statusCode: '500',
//               selectionPattern: '5\\d{2}',
//               responseTemplates: {
//                 'application/json': `{
//   "success": false,
//   "message": "Failed to send message to SQS",
//   "error": "$util.escapeJavaScript($input.path('$.errorMessage'))"
// }`,
//               },
//             },
//           ],
//           passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
//         },
//       });

//       const apiDirectResource = this.api.root.addResource('encolado-directo');
//       apiDirectResource.addMethod('POST', apiDirectIntegration, {
//         authorizer: this.authorizer,
//         authorizationType: apigateway.AuthorizationType.CUSTOM,
//         requestValidator: requestValidator,
//         requestModels: {
//           'application/json': requestModel,
//         },
//         methodResponses: [
//           { 
//             statusCode: '200',
//             responseModels: {
//               'application/json': apigateway.Model.EMPTY_MODEL,
//             },
//           },
//           { statusCode: '400' },
//           { statusCode: '500' },
//         ],
//       });
//     }

//     // ========================================
//     // 📊 OUTPUTS
//     // ========================================
    
//     new CfnOutput(this, 'ApiUrl', {
//       value: this.api.url,
//       description: 'URL base de la API de testing',
//       exportName: `${projectName}-${environmentName}-TestingApiUrl`
//     });

//     new CfnOutput(this, 'TestingEndpoints', {
//       value: JSON.stringify({
//         login: `${this.api.url}auth/login`,
//         info: `${this.api.url}`,
//         sendEvent: `${this.api.url}send`
//       }),
//       description: '🔐 Endpoints - Login público, /send requiere JWT'
//     });

//     new CfnOutput(this, 'AuthInfo', {
//       value: JSON.stringify({
//         loginEndpoint: `${this.api.url}auth/login`,
//         usersTable: usersTable.tableName,
//         jwtSecretArn: pipelineSecret.secretArn,
//         jwtSecretKey: 'jwtSecret',
//         usage: 'POST /auth/login with {username, password} → returns {token}',
//         seedExample: `aws dynamodb put-item --table-name ${usersTable.tableName} --item '{"username":{"S":"admin"},"password":{"S":"admin123"}}'`
//       }),
//       description: '🔑 Información de autenticación JWT (usa Secret-pipeline con key: jwtSecret)'
//     });

//     new CfnOutput(this, 'UsersTableName', {
//       value: usersTable.tableName,
//       description: 'Nombre de la tabla DynamoDB de usuarios',
//       exportName: `${projectName}-${environmentName}-UsersTable`
//     });
//   }
// }