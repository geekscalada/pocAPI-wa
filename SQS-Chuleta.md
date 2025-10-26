# 📋 SQS Chuleta - Conceptos y Patrones Esenciales

## 🎯 ¿Qué es SQS y cuándo usarlo?

### **Amazon Simple Queue Service (SQS)**
- **Servicio de colas** completamente gestionado por AWS
- **Desacopla componentes** de aplicaciones distribuidas
- **Escalabilidad automática** sin gestionar infraestructura
- **Pago por uso** (por request, no por tiempo)

### **Cuándo usar SQS:**
✅ Desacoplar microservicios  
✅ Procesar tareas en background  
✅ Manejar picos de tráfico (load leveling)  
✅ Sistemas event-driven  
✅ Retry logic automático  
✅ Buffer entre productores rápidos y consumidores lentos  

### **Cuándo NO usar SQS:**
❌ Comunicación síncrona (usa API Gateway)  
❌ Broadcast a múltiples consumidores (usa SNS)  
❌ Mensajes > 256KB (usa S3 + SQS Extended Client)  
❌ Low latency < 10ms (usa Kinesis Data Streams)  

## 🏗️ Patrones de Arquitectura Comunes

### **1. Producer → Queue → Consumer**
```
Lambda/API → SQS → Lambda Consumer
```
- **Caso**: Procesamiento asíncrono de pedidos
- **Beneficio**: Consumer puede procesar a su ritmo

### **2. Fan-out con SNS + SQS**
```
Producer → SNS → [SQS1, SQS2, SQS3] → [Consumer1, Consumer2, Consumer3]
```
- **Caso**: Notificar múltiples servicios de un evento
- **Beneficio**: Cada servicio procesa independientemente

### **3. Request-Response con temporary queues**
```
Client → Request Queue → Worker → Response Queue → Client
```
- **Caso**: Procesamiento pesado con respuesta diferida
- **Beneficio**: Cliente no bloquea esperando

### **4. Dead Letter Queue (DLQ) Pattern**
```
Main Queue → (fallos) → DLQ → (análisis manual/automatizado)
```
- **Caso**: Manejo de mensajes problemáticos
- **Beneficio**: No perder mensajes, debugging facilitado

## ⚙️ Tipos de Colas SQS

### **Standard Queues (por defecto)**
```typescript
// Configuración básica
new sqs.Queue(this, 'StandardQueue', {
  queueName: 'my-standard-queue'
});
```
- **Throughput**: Casi ilimitado
- **Orden**: Best-effort (no garantizado)
- **Duplicados**: Posibles (at-least-once delivery)
- **Uso**: Mayoría de casos, alta performance

### **FIFO Queues (.fifo)**
```typescript
// Configuración FIFO
new sqs.Queue(this, 'FifoQueue', {
  queueName: 'my-fifo-queue.fifo',
  fifo: true,
  contentBasedDeduplication: true
});
```
- **Throughput**: 300 TPS (batch), 3000 TPS (con grupos)
- **Orden**: Estrictamente garantizado
- **Duplicados**: Eliminados automáticamente
- **Uso**: Procesos secuenciales críticos

## 🔧 Configuraciones Críticas

### **Timeouts y Retención**
```typescript
new sqs.Queue(this, 'MyQueue', {
  // Tiempo para procesar mensaje antes de volver a cola
  visibilityTimeout: Duration.minutes(6), // Default: 30s, Max: 12h
  
  // Cuánto tiempo mantener mensajes en cola
  retentionPeriod: Duration.days(4), // Default: 4d, Max: 14d
  
  // Long polling (reduce costos y latencia)
  receiveMessageWaitTime: Duration.seconds(20), // 0-20s, recomendado: >0
});
```

### **Dead Letter Queues**
```typescript
const dlq = new sqs.Queue(this, 'DLQ', {
  queueName: 'my-dlq',
  retentionPeriod: Duration.days(14) // Máximo tiempo para análisis
});

const mainQueue = new sqs.Queue(this, 'MainQueue', {
  deadLetterQueue: {
    queue: dlq,
    maxReceiveCount: 3 // Intentos antes de ir a DLQ
  }
});
```

### **Encriptación**
```typescript
// Opciones de encriptación por costo/seguridad
encryption: sqs.QueueEncryption.UNENCRYPTED,   // Gratis, solo testing
encryption: sqs.QueueEncryption.SQS_MANAGED,   // Básica, bajo costo
encryption: sqs.QueueEncryption.KMS_MANAGED,   // Avanzada, más costo
```

## 🌐 Acceso a SQS

### **Identificadores de Cola**

#### **ARN (Amazon Resource Name)**
```
arn:aws:sqs:us-east-1:123456789012:my-queue
```
- **Uso**: IAM policies, CloudFormation, referencias entre servicios
- **Único globalmente**

#### **URL (Queue URL)**
```
https://sqs.us-east-1.amazonaws.com/123456789012/my-queue
```
- **Uso**: Operaciones directas (send/receive)
- **Endpoint HTTP del servicio**

### **¿Quién puede acceder a SQS?**

#### **✅ Desde AWS MISMA CUENTA (recomendado)**
```typescript
// Lambda, EC2, ECS con IAM roles - Usa credenciales automáticamente
const sqs = new SQSClient({ region: "us-east-1" });
// ☝️ Solo funciona en la MISMA cuenta AWS donde está la cola
```

#### **✅ Desde máquina local (con AWS CLI configurado)**
```bash
# Si has hecho "aws configure" para la cuenta donde está la cola
aws sqs send-message --queue-url https://... --message-body "..."

# SDK usa las mismas credenciales del CLI
const sqs = new SQSClient({ region: "us-east-1" });
```

#### **✅ Cross-Account (con credenciales explícitas)**
```typescript
// Para acceder a cola en OTRA cuenta AWS
const sqs = new SQSClient({
  region: "us-east-1",
  credentials: { 
    accessKeyId: "AKIA...", // Usuario de la cuenta destino
    secretAccessKey: "..." 
  }
});
```

#### **✅ Cross-Account (con AssumeRole - más seguro)**
```typescript
// 1. Asumir rol en otra cuenta
const assumeRoleResult = await sts.send(new AssumeRoleCommand({
  RoleArn: "arn:aws:iam::OTHER-ACCOUNT:role/SQSAccessRole"
}));

// 2. Usar credenciales temporales
const sqs = new SQSClient({
  credentials: assumeRoleResult.Credentials
});
```

#### **❌ Directamente desde navegador**
- **Problema**: CORS, credenciales expuestas, Signature V4 compleja
- **Solución**: API Gateway + Lambda proxy

### **Patrón API Gateway → SQS**
```
Browser → API Gateway → Lambda → SQS (tu cola interna)
```

## 📊 Monitoreo y Observabilidad

### **CloudWatch Metrics Clave**
```typescript
// Alarma por cola muy llena
const alarm = new cloudwatch.Alarm(this, 'QueueDepthAlarm', {
  metric: queue.metricApproximateNumberOfVisibleMessages(),
  threshold: 100,
  evaluationPeriods: 2
});
```

**Métricas importantes:**
- `ApproximateNumberOfVisibleMessages` - Mensajes disponibles
- `ApproximateNumberOfMessagesNotVisible` - En procesamiento
- `NumberOfMessagesSent` - Throughput de entrada
- `NumberOfMessagesReceived` - Throughput de salida

### **Debugging en AWS Console**
1. **SQS Console** → Seleccionar cola
2. **"Send and receive messages"**
3. **"Poll for messages"** → Ver contenido real
4. **CloudWatch** → Metrics y logs

## 🎯 Filtros y Routing

### **Message Filtering (SNS → SQS)**
```typescript
// En la suscripción SNS → SQS
filterPolicy: {
  eventType: sns.SubscriptionFilter.stringFilter({
    allowlist: ['USER_CREATED', 'USER_UPDATED']
  }),
  priority: sns.SubscriptionFilter.numericFilter({
    between: { start: 1, stop: 100 }
  })
}
```

### **Message Attributes**
```typescript
// En el producer
await sqs.send(new SendMessageCommand({
  QueueUrl: queueUrl,
  MessageBody: JSON.stringify({ event: "USER_CREATED" }),
  MessageAttributes: {
    "eventType": { DataType: "String", StringValue: "USER_CREATED" },
    "priority": { DataType: "Number", StringValue: "5" }
  }
}));
```

## ⚡ Performance y Costos

### **Long Polling vs Short Polling**
```typescript
// Long polling (recomendado)
receiveMessageWaitTime: Duration.seconds(20), // Reduce requests = menos costo

// Short polling (por defecto)
receiveMessageWaitTime: Duration.seconds(0), // Más requests = más costo
```

### **Batch Operations**
```typescript
// Enviar hasta 10 mensajes por request
const sendBatch = new SendMessageBatchCommand({
  QueueUrl: queueUrl,
  Entries: [
    { Id: "1", MessageBody: "Message 1" },
    { Id: "2", MessageBody: "Message 2" }
  ]
});

// Recibir hasta 10 mensajes por request
const receiveBatch = new ReceiveMessageCommand({
  QueueUrl: queueUrl,
  MaxNumberOfMessages: 10, // 1-10
  WaitTimeSeconds: 20
});
```

### **Cálculo de Costos**
- **Requests**: ~$0.40 por millón de requests
- **Data Transfer**: Gratis dentro de misma región
- **Long Polling**: Reduce número de requests → Ahorra dinero

## 🚨 Error Handling y Resilencia

### **Visibility Timeout Strategy**
```typescript
// Rule: visibilityTimeout > lambda timeout
visibilityTimeout: Duration.minutes(6), // Lambda timeout: 5min
```

### **Retry Strategy**
```typescript
deadLetterQueue: {
  maxReceiveCount: 3, // Exponential backoff implícito
  queue: dlq
}
```

### **Poison Message Handling**
1. **Mensaje falla** → Vuelve a cola principal
2. **Falla N veces** → Va a DLQ
3. **DLQ Analysis** → Debug manual/automático
4. **Fix & Redrive** → Volver a procesar

## 🔐 Seguridad Best Practices

### **IAM Policies**
```json
{
  "Effect": "Allow",
  "Action": [
    "sqs:SendMessage",
    "sqs:ReceiveMessage",
    "sqs:DeleteMessage"
  ],
  "Resource": "arn:aws:sqs:*:*:my-queue-prefix-*"
}
```

### **Encryption in Transit & Rest**
- **In Transit**: HTTPS por defecto
- **At Rest**: KMS_MANAGED para datos sensibles

### **VPC Endpoints**
```typescript
// Para tráfico interno sin internet
const vpcEndpoint = new ec2.VpcEndpoint(this, 'SqsEndpoint', {
  service: ec2.VpcEndpointService.SQS
});
```

## 📝 CDK Implementation Cheatsheet

### **Básico con DLQ**
```typescript
const dlq = new sqs.Queue(this, 'DLQ');
const queue = new sqs.Queue(this, 'MainQueue', {
  visibilityTimeout: Duration.minutes(6),
  deadLetterQueue: { queue: dlq, maxReceiveCount: 3 }
});
```

### **Con SNS Integration**
```typescript
const topic = sns.Topic.fromTopicArn(this, 'Topic', topicArn);
topic.addSubscription(new snsSubscriptions.SqsSubscription(queue, {
  rawMessageDelivery: true,
  filterPolicy: { eventType: sns.SubscriptionFilter.stringFilter(...) }
}));
```

### **Lambda Consumer**
```typescript
const consumer = new lambda.Function(this, 'Consumer', { /* ... */ });
consumer.addEventSource(new SqsEventSource(queue, {
  batchSize: 10, // 1-10
  maxBatchingWindow: Duration.seconds(5)
}));
queue.grantConsumeMessages(consumer);
```

## 🎯 Quick Decision Matrix

| Necesidad | Solución SQS |
|-----------|-------------|
| **Desacoplar servicios** | Standard Queue |
| **Orden garantizado** | FIFO Queue |
| **Manejo de errores** | DLQ + retry logic |
| **Multiple consumers** | SNS fan-out + SQS |
| **External access** | API Gateway + Lambda |
| **High throughput** | Batch operations + Long polling |
| **Cost optimization** | Long polling + batch processing |

---
*Última actualización: Oct 2025 - Para más detalles, consultar AWS SQS Documentation*