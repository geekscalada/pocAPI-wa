ARQUITECTURA DE COLAS - pocAPI-wa
====================================

FLUJO COMPLETO DE MENSAJERÍA
─────────────────────────────

1. PUBLISHER (API Gateway + Lambda)
   ├─ Endpoint REST: POST /publish
   ├─ Lambda: publisher
   └─ Destino: SNS Topic FIFO

2. SNS TOPIC FIFO
   ├─ Nombre: test.fifo
   ├─ Tipo: FIFO con contentBasedDeduplication
   ├─ Función: Distribuir mensajes a suscriptores
   └─ Suscriptores: SQS FIFO Queue

3. SQS FIFO QUEUE (Main Queue)
   ├─ Nombre: {proyecto}-{entorno}-main-queue.fifo
   ├─ Tipo: FIFO
   ├─ Configuración:
   │  ├─ visibilityTimeout: 3 minutos
   │  ├─ retentionPeriod: 4 días
   │  ├─ deliveryDelay: 0 segundos
   │  ├─ contentBasedDeduplication: true
   │  ├─ deduplicationScope: MESSAGE_GROUP
   │  └─ fifoThroughputLimit: PER_MESSAGE_GROUP_ID
   └─ Dead Letter Queue:
      ├─ maxReceiveCount: 2 reintentos
      └─ Destino: DLQ FIFO

4. CONSUMER LAMBDA
   ├─ Nombre: sqs-consumer
   ├─ Trigger: SQS Event Source
   ├─ Configuración Event Source:
   │  ├─ batchSize: 5 mensajes
   │  ├─ maxConcurrency: 2 invocaciones simultáneas
   │  └─ reportBatchItemFailures: true
   ├─ Timeout: 2 minutos
   ├─ Comportamiento:
   │  ├─ Agrupa mensajes por MessageGroupId
   │  ├─ Si un mensaje falla en un grupo:
   │  │  └─ Bloquea todos los mensajes posteriores del mismo grupo
   │  └─ Reporta fallos en batchItemFailures
   └─ Integraciones:
      ├─ DynamoDB: Tabla de idempotencia
      └─ CloudWatch: Métricas y logs

5. DEAD LETTER QUEUE (DLQ)
   ├─ Nombre: {proyecto}-{entorno}-dlq.fifo
   ├─ Tipo: FIFO
   ├─ Configuración:
   │  ├─ visibilityTimeout: 5 minutos
   │  └─ retentionPeriod: 14 días
   └─ Función: Almacenar mensajes que fallaron maxReceiveCount veces

6. TABLA DE IDEMPOTENCIA (DynamoDB)
   ├─ Nombre: {proyecto}-{entorno}-idempotency-v2
   ├─ PartitionKey: 'id' (STRING)
   ├─ TTL: 'ttl' attribute
   ├─ BillingMode: PAY_PER_REQUEST
   └─ Función: Evitar procesamiento duplicado de mensajes


