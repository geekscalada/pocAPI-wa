import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

// 🔧 Cliente CloudWatch para métricas personalizadas
const cloudwatch = new CloudWatchClient({});

// 🌡️ Global variable para detectar cold starts
declare global {
  var isWarm: boolean;
}

// 📊 Interface para el payload esperado del SNS/SQS
interface NotificationPayload {
  event: string;
  id: string;
  data?: any;
  timestamp?: string;
  source?: string;
  forceError?: boolean;
}

// 🎯 Configuración de simulación de errores (para testing)
interface ProcessingConfig {
  forceError?: boolean;
  errorRate?: number; // 0-100, porcentaje de errores
  processingDelay?: number; // ms de delay artificial
}

export const handler = async (event: SQSEvent, context: Context) => {
  // ⏱️ TIMING: Handler start
  const handlerStartTime = Date.now();
  
  // 🔥 DETECTAR COLD START
  const isColdStart = !global.isWarm;
  global.isWarm = true;
  
  console.log(`🚀 [CONSUMER] Starting batch processing. Records: ${event.Records.length}`);
  console.log(`🔥 [COLD START] Is cold start: ${isColdStart ? 'YES ❄️' : 'NO 🔥'}`);
  console.log(`🔍 [CONSUMER] Context:`, JSON.stringify({
    functionName: context.functionName,
    requestId: context.awsRequestId,
    remainingTime: context.getRemainingTimeInMillis(),
    isColdStart: isColdStart
  }));

  // ⏱️ TIMING: Overhead setup complete
  const setupCompleteTime = Date.now();
  const setupOverhead = setupCompleteTime - handlerStartTime;
  console.log(`⏱️ [TIMING] Setup overhead: ${setupOverhead}ms`);

  // 📊 Métricas del batch
  let successCount = 0;
  let errorCount = 0;
  const batchStartTime = Date.now();
  const failedMessageIds: string[] = [];

  // 🔄 Procesar cada mensaje del batch
  const results = await Promise.allSettled(
    event.Records.map(record => processMessage(record, context))
  );

  // 📈 Contar resultados y recopilar fallos
  results.forEach((result, index) => {
    const record = event.Records[index];
    if (result.status === 'fulfilled') {
      successCount++;
      console.log(`✅ [CONSUMER] Message ${index + 1} (${record.messageId}) processed successfully`);
    } else {
      errorCount++;
      failedMessageIds.push(record.messageId);
      console.error(`❌ [CONSUMER] Message ${index + 1} (${record.messageId}) failed:`, result.reason);
    }
  });

  const processingTime = Date.now() - batchStartTime;

  // ⏱️ TIMING: Calculate overhead vs processing
  const totalHandlerTime = Date.now() - handlerStartTime;
  const actualProcessingTime = processingTime;
  const totalOverhead = totalHandlerTime - actualProcessingTime;
  
  console.log(`⏱️ [TIMING] Total handler time: ${totalHandlerTime}ms`);
  console.log(`⏱️ [TIMING] Actual processing time: ${actualProcessingTime}ms`);
  console.log(`⏱️ [TIMING] Total overhead: ${totalOverhead}ms`);
  console.log(`⏱️ [TIMING] Overhead per message: ${totalOverhead / event.Records.length}ms`);
  console.log(`⏱️ [TIMING] Processing per message: ${actualProcessingTime / event.Records.length}ms`);

  // 📊 Enviar métricas a CloudWatch (incluyendo timing detallado)
  await sendMetrics(successCount, errorCount, processingTime, event.Records.length, totalOverhead, setupCompleteTime - handlerStartTime);

  console.log(`📊 [CONSUMER] Batch completed - Success: ${successCount}, Errors: ${errorCount}, Time: ${processingTime}ms`);

  // 🎯 PARTIAL BATCH FAILURE: Solo reintentar mensajes que fallaron
  if (errorCount > 0) {
    console.warn(`⚠️ [CONSUMER] ${errorCount} messages will be retried individually by SQS`);
    console.log(`🔄 [CONSUMER] Failed message IDs:`, failedMessageIds);
    
    // � RETORNAR SOLO LOS IDs DE MENSAJES FALLIDOS
    // Esto le dice a SQS que solo reintente estos mensajes específicos
    return {
      batchItemFailures: failedMessageIds.map(id => ({ itemIdentifier: id }))
    };
  }

  // ✅ Todo exitoso
  return {
    statusCode: 200,
    body: `Successfully processed ${successCount} messages`
  };
};

// 🔧 Procesar un mensaje individual
async function processMessage(record: SQSRecord, context: Context): Promise<void> {
  const messageId = record.messageId;
  const receiptHandle = record.receiptHandle;
  
  console.log(`🔍 [PROCESSOR] Processing message ${messageId}`);
  console.log(`📝 [PROCESSOR] Message body:`, record.body);
  console.log(`📋 [PROCESSOR] Message attributes:`, JSON.stringify(record.messageAttributes));

  try {
    // 📦 Parsear el payload (puede venir de SNS o directo)
    let payload: NotificationPayload;
    
    try {
      const parsed = JSON.parse(record.body);
      
      // 🔍 Detectar si viene de SNS (wrapped) o directo
      if (parsed.Type === 'Notification' && parsed.Message) {
        console.log(`📡 [PROCESSOR] Message from SNS topic: ${parsed.TopicArn}`);
        payload = JSON.parse(parsed.Message);
      } else {
        console.log(`📬 [PROCESSOR] Direct SQS message`);
        payload = parsed;
      }
    } catch (parseError) {
      throw new Error(`Failed to parse message: ${parseError}`);
    }

    console.log(`🎯 [PROCESSOR] Parsed payload:`, JSON.stringify(payload));

    // 🎛️ Leer configuración de simulación de errores desde variables de entorno
    const config: ProcessingConfig = {
      forceError: process.env.FORCE_ERROR === 'true',
      errorRate: parseInt(process.env.ERROR_RATE || '0'),
      processingDelay: parseInt(process.env.PROCESSING_DELAY || '0')
    };

    // 🎲 Simular errores aleatorios (para testing)
    if (config.errorRate && config.errorRate > 0) {
      const randomError = Math.random() * 100;
      if (randomError < config.errorRate) {
        throw new Error(`🎲 Simulated random error (${config.errorRate}% rate)`);
      }
    }

    // 🚨 Forzar error si está configurado globalmente
    if (config.forceError) {
      throw new Error(`🚨 Forced error for testing (FORCE_ERROR=true)`);
    }

    // 🚨 Forzar error si el mensaje específico lo requiere
    if (payload.forceError === true) {
      console.log(`🚨 [PROCESSOR] Message contains forceError=true, simulating failure...`);
      throw new Error(`🚨 Message-specific forced error for event: ${payload.event}`);
    }

    // ⏱️ Simular delay de procesamiento
    if (config.processingDelay && config.processingDelay > 0) {
      console.log(`⏱️ [PROCESSOR] Simulating ${config.processingDelay}ms processing delay...`);
      await new Promise(resolve => setTimeout(resolve, config.processingDelay));
    }

    // 🔄 Procesar según el tipo de evento
    await processEventByType(payload, messageId);

    // ✅ Logging de éxito
    console.log(`✅ [PROCESSOR] Successfully processed ${payload.event} for ID: ${payload.id}`);

  } catch (error) {
    // 🚨 Logging detallado del error
    console.error(`❌ [PROCESSOR] Error processing message ${messageId}:`, {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      messageBody: record.body,
      receiptHandle: receiptHandle,
      attemptsMade: record.attributes?.ApproximateReceiveCount || 'unknown'
    });

    // 🔄 Re-throw para que SQS maneje el retry
    throw error;
  }
}

// 🎯 Procesar diferentes tipos de eventos
async function processEventByType(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`🎯 [EVENT_PROCESSOR] Processing event type: ${payload.event}`);

  switch (payload.event) {
    case 'USER_CREATED':
      await processUserCreated(payload, messageId);
      break;
      
    case 'USER_UPDATED':
      await processUserUpdated(payload, messageId);
      break;
      
    case 'ORDER_PLACED':
      await processOrderPlaced(payload, messageId);
      break;
      
    case 'TEST_EVENT':
      await processTestEvent(payload, messageId);
      break;
      
    default:
      console.warn(`⚠️ [EVENT_PROCESSOR] Unknown event type: ${payload.event}. Processing as generic.`);
      await processGenericEvent(payload, messageId);
  }
}

// 🏷️ Procesadores específicos por tipo de evento
async function processUserCreated(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`👤 [USER_CREATED] Processing user creation for ID: ${payload.id}`);
  
  // Aquí irían las operaciones específicas:
  // - Enviar email de bienvenida
  // - Crear perfil en sistema CRM
  // - Configurar permisos por defecto
  
  console.log(`👤 [USER_CREATED] User ${payload.id} setup completed`);
}

async function processUserUpdated(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`🔄 [USER_UPDATED] Processing user update for ID: ${payload.id}`);
  
  // Operaciones de actualización:
  // - Sincronizar con sistemas externos
  // - Invalidar caché
  // - Notificar a servicios dependientes
  
  console.log(`🔄 [USER_UPDATED] User ${payload.id} synchronization completed`);
}

async function processOrderPlaced(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`🛒 [ORDER_PLACED] Processing order for ID: ${payload.id}`);
  
  // Operaciones de pedido:
  // - Reservar inventario
  // - Procesar pago
  // - Enviar confirmación
  
  console.log(`🛒 [ORDER_PLACED] Order ${payload.id} processing initiated`);
}

async function processTestEvent(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`🧪 [TEST_EVENT] Processing test event for ID: ${payload.id}`);
  
  // Para testing y debugging
  console.log(`🧪 [TEST_EVENT] Test payload:`, JSON.stringify(payload.data));
  
  console.log(`🧪 [TEST_EVENT] Test event ${payload.id} processed successfully`);
}

async function processGenericEvent(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`🔄 [GENERIC] Processing generic event: ${payload.event} for ID: ${payload.id}`);
  
  // Procesamiento genérico para eventos desconocidos
  console.log(`🔄 [GENERIC] Generic processing completed for ${payload.id}`);
}

// 📊 Enviar métricas personalizadas a CloudWatch
async function sendMetrics(
  successCount: number, 
  errorCount: number, 
  processingTime: number, 
  totalMessages: number,
  totalOverhead?: number,
  setupTime?: number
): Promise<void> {
  try {
    const metrics = [
      {
        MetricName: 'MessagesProcessedSuccess',
        Value: successCount,
        Unit: 'Count' as const,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer-lambda' }
        ]
      },
      {
        MetricName: 'MessagesProcessedError',
        Value: errorCount,
        Unit: 'Count' as const,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer-lambda' }
        ]
      },
      {
        MetricName: 'BatchProcessingTime',
        Value: processingTime,
        Unit: 'Milliseconds' as const,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer-lambda' }
        ]
      },
      {
        MetricName: 'BatchSize',
        Value: totalMessages,
        Unit: 'Count' as const,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer-lambda' }
        ]
      },
      {
        MetricName: 'ColdStarts',
        Value: global.isWarm ? 0 : 1,
        Unit: 'Count' as const,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer-lambda' }
        ]
      }
    ];

    // 📊 Agregar métricas de timing detalladas si están disponibles
    if (totalOverhead !== undefined) {
      metrics.push({
        MetricName: 'TotalOverheadMs',
        Value: totalOverhead,
        Unit: 'Milliseconds' as const,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer-lambda' }
        ]
      });
      
      metrics.push({
        MetricName: 'OverheadPerMessageMs',
        Value: totalOverhead / totalMessages,
        Unit: 'Milliseconds' as const,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer-lambda' }
        ]
      });
    }

    if (setupTime !== undefined) {
      metrics.push({
        MetricName: 'SetupTimeMs',
        Value: setupTime,
        Unit: 'Milliseconds' as const,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer-lambda' }
        ]
      });
    }

    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'SQS-Consumer-POC',
      MetricData: metrics
    }));

    console.log(`📊 [METRICS] Sent ${metrics.length} metrics to CloudWatch`);
  } catch (error) {
    console.error(`❌ [METRICS] Failed to send metrics:`, error);
    // No re-throw - las métricas no deben fallar el procesamiento
  }
}