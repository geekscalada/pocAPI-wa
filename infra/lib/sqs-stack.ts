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

export class SqsStack extends Stack {
  public readonly mainQueue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly consumerLambda: lambda.Function;
  public readonly idempotencyTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: InfraProps) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    // ========================================
    // 🚨 DEAD LETTER QUEUE (DLQ)
    // ========================================
    // Para mensajes que fallan repetidamente
    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: `${projectName}-${environmentName}-dlq`,
      
      // ⏱️ Retención de mensajes en DLQ (1-14 días)
      retentionPeriod: Duration.days(14), // Máximo tiempo en DLQ
      
      // 🔒 Encriptación 
      // encryption: sqs.QueueEncryption.KMS_MANAGED, // o SQS_MANAGED para menos costo
      // encryptionMasterKey: key, // Clave KMS personalizada si necesitas
      
      // 📊 Configuraciones adicionales para DLQ
      visibilityTimeout: Duration.minutes(5), // Tiempo para procesar mensaje fallido
      
      // 🏷️ Tags para organización
      // tags: {
      //   Environment: environmentName,
      //   Project: projectName,
      //   Purpose: 'DeadLetterQueue',
      //   CostCenter: 'Development'
      // }
    });

    // ========================================
    // 📬 COLA PRINCIPAL SQS
    // ========================================
    this.mainQueue = new sqs.Queue(this, 'MainQueue', {
      queueName: `${projectName}-${environmentName}-main-queue`,
      
      // ⏱️ CONFIGURACIONES DE TIEMPO
      visibilityTimeout: Duration.minutes(6), // Tiempo para procesar mensaje (debe ser > lambda timeout)
      retentionPeriod: Duration.days(4), // Cuánto tiempo mantener mensajes (1-14 días)
      receiveMessageWaitTime: Duration.seconds(20), // Long polling (0-20s, recomendado >0)
      
      // 🔄 CONFIGURACIÓN DE REINTENTOS
      // Aquí es donde se enlazan las 2 colas
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3, // Intentos antes de ir a DLQ (1-1000)
      },
      
      // 🔒 SEGURIDAD Y ENCRIPTACIÓN
      // encryption: sqs.QueueEncryption.KMS_MANAGED, // Opciones: UNENCRYPTED, SQS_MANAGED, KMS_MANAGED
      // encryptionMasterKey: key, // Clave KMS personalizada
      
      // 📦 CONFIGURACIONES DE MENSAJE
      // maxMessageSizeBytes: 262144, // Tamaño máximo de mensaje (1024-262144 bytes)
      
      // 🚦 CONFIGURACIONES FIFO (descomentrar para cola FIFO)
      // fifo: true, // Habilita FIFO (orden garantizado)
      // contentBasedDeduplication: true, // Deduplicación automática por contenido
      // deduplicationScope: sqs.DeduplicationScope.MESSAGE_GROUP, // QUEUE o MESSAGE_GROUP
      // fifoThroughputLimit: sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID, // PER_QUEUE o PER_MESSAGE_GROUP_ID
      
      // 🏷️ TAGS PARA ORGANIZACIÓN Y COSTOS
      // tags: {
      //   Environment: environmentName,
      //   Project: projectName,
      //   Purpose: 'MainProcessingQueue',
      //   CostCenter: 'Development',
      //   DataClassification: 'Internal'
      // }
    });

    // ========================================
    // 🔗 SUSCRIPCIÓN SNS -> SQS
    // ========================================
    
    // Importar el topic SNS existente usando el valor exportado del SnsTestStack
    const testTopicArn = Fn.importValue("TestTopicArn");
    const testTopic = sns.Topic.fromTopicArn(this, 'ImportedTestTopic', testTopicArn);
    
    // Crear la suscripción con configuraciones avanzadas
    const subscription = new snsSubscriptions.SqsSubscription(this.mainQueue, {
      // 📝 FORMATO DE MENSAJE
      rawMessageDelivery: true, // true = mensaje directo, false = envuelto en metadata SNS
      
      // 🎯 FILTROS DE MENSAJES (opcional)
      // Procesa solo mensajes que cumplan criterios específicos
      // filterPolicy: {
      //   eventType: sns.SubscriptionFilter.stringFilter({
      //     allowlist: ['USER_CREATED', 'USER_UPDATED'], // Solo estos eventos
      //     // denylist: ['USER_DELETED'], // Excluir estos eventos
      //   }),
      //   source: sns.SubscriptionFilter.stringFilter({
      //     allowlist: ['web-app', 'mobile-app']
      //   }),
      //   priority: sns.SubscriptionFilter.numericFilter({
      //     between: { start: 1, stop: 100 }, // Solo prioridades entre 1-100
      //     // greaterThan: 5,
      //     // lessThan: 100,
      //     // betweenStrict: { start: 1, stop: 100 }
      //   })
      // },
      
      // 🎯 FILTROS POR ATRIBUTOS DE MENSAJE (alternativa a filterPolicy)
      // filterPolicyWithMessageBody: {
      //   background: {
      //     color: ['red', 'blue'] // Solo mensajes con background.color = red o blue
      //   }
      // }
    });

    // Suscribir la cola al topic
    testTopic.addSubscription(subscription);

    // ========================================
    // 🔑 TABLA DE IDEMPOTENCIA - DynamoDB
    // ========================================
    // Tabla para trackear mensajes procesados y evitar duplicados
    this.idempotencyTable = new dynamodb.Table(this, 'IdempotencyTable', {
      tableName: `${projectName}-${environmentName}-idempotency-v2`,
      
      // 🔑 Partition key: 'id' es el nombre que usa Lambda Powertools por defecto
      partitionKey: { 
        name: 'id', 
        type: dynamodb.AttributeType.STRING 
      },
      
      // ⏰ TTL automático: limpia registros después de 7 días
      // Evita que la tabla crezca indefinidamente
      timeToLiveAttribute: 'ttl',
      
      // 💰 Billing: On-demand (paga por uso, perfecto para POC)
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
      // 🗑️ RemovalPolicy: DESTROY para dev/testing
      removalPolicy: RemovalPolicy.DESTROY,
      
      // 🔐 Point-in-time recovery (opcional, para producción)
      // pointInTimeRecovery: true,
    });

    // ========================================
    // ⚡ LAMBDA CONSUMER
    // ========================================
    
    const consumerLambdaBaseName = 'sqs-consumer';
    
    this.consumerLambda = new lambda.Function(
      this,
      `${projectName}-${environmentName}-${consumerLambdaBaseName}`,
      {
        functionName: `${projectName}-${environmentName}-${consumerLambdaBaseName}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset('../lambdas/consumer/dist'),
        handler: 'index.handler',
        timeout: Duration.minutes(5), // Debe ser < visibilityTimeout de SQS (6min)
        
        // 🌍 Variables de entorno para configuración
        environment: {
          ENVIRONMENT: environmentName,
          PROJECT_NAME: projectName,
          
          // 🎛️ Configuraciones para simular errores (POC)
          FORCE_ERROR: 'false', // Cambiar a 'true' para simular errores
          ERROR_RATE: '0', // 0-100, porcentaje de errores aleatorios
          PROCESSING_DELAY: '1000', // ms de delay artificial
          
          // 🔑 Configuración de idempotencia
          IDEMPOTENCY_TABLE: this.idempotencyTable.tableName,
          ENABLE_IDEMPOTENCY: 'true', // Cambiar a 'true' para activar idempotencia
          
          // �📊 Configuraciones de logging
          LOG_LEVEL: 'INFO'
        },
        
        // 🧠 Configuraciones de memoria y concurrencia
        memorySize: 256, // MB - ajustar según necesidades
        // reservedConcurrentExecutions: 5, // ❌ Comentado: causa problemas con account limits
      },
    );

    // 🔗 Conectar la cola SQS con la Lambda
    const sqsEventSource = new lambdaEventSources.SqsEventSource(this.mainQueue, {
      // 📦 Configuración de batching
      batchSize: 5, // 1-10 mensajes por invocación (ajustar según processing time)
      maxBatchingWindow: Duration.seconds(10), // Esperar max 10s para llenar batch
      
      // 🔄 Configuración de concurrencia  
      maxConcurrency: 5, // Máximo 5 lambdas procesando simultáneamente (específico para SQS)
      
      // 🎯 Configuración de errores
      reportBatchItemFailures: true, // Permite partial batch failures
    });

    // 🔌 Añadir el event source a la lambda
    this.consumerLambda.addEventSource(sqsEventSource);

    // 🔐 Dar permisos a la lambda para interactuar con SQS
    this.mainQueue.grantConsumeMessages(this.consumerLambda);
    this.deadLetterQueue.grantSendMessages(this.consumerLambda);

    // � Dar permisos para acceder a la tabla de idempotencia
    this.idempotencyTable.grantReadWriteData(this.consumerLambda);

    // �📊 Dar permisos para enviar métricas a CloudWatch
    this.consumerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudwatch:PutMetricData'
        ],
        resources: ['*']
      })
    );

    // ========================================
    // 📊 OUTPUTS PARA REFERENCIAS EXTERNAS
    // ========================================
    
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

    // ========================================
    // 📈 CONFIGURACIONES ADICIONALES AVANZADAS
    // ========================================
    
    // 🔔 CloudWatch Alarms (descomentar para habilitar)
    // const alarm = new cloudwatch.Alarm(this, 'QueueDepthAlarm', {
    //   metric: this.mainQueue.metricApproximateNumberOfVisibleMessages(),
    //   threshold: 100,
    //   evaluationPeriods: 2,
    //   alarmDescription: 'Cola con demasiados mensajes pendientes'
    // });

    // 🎯 Redrive Policy personalizada (alternativa a deadLetterQueue en constructor)
    // const cfnQueue = this.mainQueue.node.defaultChild as sqs.CfnQueue;
    // cfnQueue.addPropertyOverride('RedrivePolicy', {
    //   deadLetterTargetArn: this.deadLetterQueue.queueArn,
    //   maxReceiveCount: 3
    // });

    // 📊 Configuraciones de batch y throughput (para casos especiales)
    // cfnQueue.addPropertyOverride('ReceiveMessageWaitTimeSeconds', 20);
    // cfnQueue.addPropertyOverride('MaxReceiveCount', 3);
  }
}