import { Stack, StackProps, Duration, CfnOutput, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { InfraProps } from '@infra/bin/app.js';

export class SqsStack extends Stack {
  public readonly mainQueue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;

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