import { SQSEvent, SQSBatchResponse } from 'aws-lambda';

interface NotificationPayload {
  event: string;
  id: string;
  shouldFail?: 'yes' | 'no';
  data?: any;
}

// ═══════════════════════════════════════════════════════════════
// 📨 MAIN HANDLER (with conditional idempotency)
// ═══════════════════════════════════════════════════════════════

const handlerLogic = async (event: SQSEvent, context: Context) => {
  const handlerStartTime = Date.now();

  
  
  // Cold start detection
  const isColdStart = !global.isWarm;
  global.isWarm = true;
  
  // Check if idempotency is enabled
  const idempotencyEnabled = process.env.ENABLE_IDEMPOTENCY === 'true';
  
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  🚀 BATCH STARTED - ${new Date().toISOString()}            ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`📦 [BATCH SIZE] ${event.Records.length} mensajes`);
  console.log(`🔥 [COLD START] ${isColdStart ? 'YES ❄️' : 'NO 🔥'}`);
  console.log(`🔑 [IDEMPOTENCY] ${idempotencyEnabled ? 'ENABLED ✅' : 'DISABLED ⚠️'}`);

  const setupCompleteTime = Date.now();
  const setupOverhead = setupCompleteTime - handlerStartTime;
  console.log(`⏱️ [TIMING] Setup: ${setupOverhead}ms`);
  console.log('');

  // Metrics
  let successCount = 0;
  let errorCount = 0;
  let duplicatesDetected = 0;
  const batchStartTime = Date.now();
  const failedMessageIds: string[] = [];

  // Process each record in the batch
  const results = await Promise.allSettled(
    event.Records.map(async (record, index) => {
      console.log('');
      console.log(`┌─────────────────────────────────────────────────────────────┐`);
      console.log(`│  MENSAJE ${index + 1}/${event.Records.length} - ${new Date().toISOString()}  │`);
      console.log(`└─────────────────────────────────────────────────────────────┘`);
      console.log(`🆔 MessageId: ${record.messageId}`);
      console.log(`� ReceiveCount: ${record.attributes.ApproximateReceiveCount || 'N/A'}`);
      
      // Parse para obtener ID y shouldFail
      let payloadId = 'UNKNOWN';
      let shouldFail = 'unknown';
      try {
        const snsNotification = JSON.parse(record.body);
        if (snsNotification.Type === 'Notification' && snsNotification.Message) {
          const payload = JSON.parse(snsNotification.Message);
          payloadId = payload.id || 'N/A';
          shouldFail = payload.shouldFail || 'no';
        }
      } catch (e) {
        console.error('⚠️ Error parsing para preview:', e);
      }
      
      console.log(`🏷️ Payload ID: ${payloadId}`);
      console.log(`🎚️ shouldFail: ${shouldFail}`);
      console.log(`⏳ Iniciando procesamiento...`);
      
      await processBusinessLogic(record);
      
      console.log(`✅ Mensaje ${payloadId} procesado exitosamente`);
      return 'success';
    })
  );

  // Count results and extract IDs
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 RESULTADOS DEL BATCH                                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  results.forEach((result, index) => {
    const record = event.Records[index];
    
    // Extraer payload ID para logging
    let payloadId = 'UNKNOWN';
    try {
      const parsed = JSON.parse(record.body);
      if (parsed.Type === 'Notification' && parsed.Message) {
        const payload = JSON.parse(parsed.Message);
        payloadId = payload.id || 'N/A';
      }
    } catch (e) { /* ignore */ }
    
    if (result.status === 'fulfilled') {
      successCount++;
      console.log(`✅ [${index + 1}/${event.Records.length}] SUCCESS - ID: ${payloadId} (${record.messageId.substring(0, 8)}...)`);
    } else {
      errorCount++;
      failedMessageIds.push(record.messageId);
      console.error(`❌ [${index + 1}/${event.Records.length}] FAILED  - ID: ${payloadId} (${record.messageId.substring(0, 8)}...)`);
      console.error(`   └─ Error: ${result.reason.message || result.reason}`);
    }
  });

  const processingTime = Date.now() - batchStartTime;
  const totalTime = Date.now() - handlerStartTime;

  console.log('');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`� Total Mensajes: ${event.Records.length}`);
  console.log(`✅ Éxitos:  ${successCount}`);
  console.log(`❌ Fallos:  ${errorCount}`);
  console.log(`♻️  Duplicados: ${duplicatesDetected}`);
  console.log(`⏱️  Tiempo Procesamiento: ${processingTime}ms`);
  console.log(`⏱️  Tiempo Total: ${totalTime}ms`);
  console.log('─────────────────────────────────────────────────────────────────');

  // Send metrics to CloudWatch
  await sendMetrics(
    successCount,
    errorCount,
    processingTime,
    event.Records.length,
    setupOverhead,
    duplicatesDetected
  );

  // Return batch item failures for SQS partial batch response
  if (errorCount > 0) {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  🔄 REPORTANDO BATCH ITEM FAILURES                           ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(`⚠️ [batchItemFailures] Reportando ${errorCount} mensaje(s) fallido(s)`);
    console.log(`📋 MessageIds que se reintentarán:`);
    failedMessageIds.forEach((id, idx) => {
      console.log(`   ${idx + 1}. ${id.substring(0, 20)}...`);
    });
    console.log('');
    console.log(`🔍 [IMPORTANTE] Los mensajes NO reportados (${successCount} éxitos) serán eliminados de la cola`);
    console.log(`🔍 [IMPORTANTE] Los mensajes reportados (${errorCount} fallos) se reintentarán`);
    console.log('');
    
    return {
      batchItemFailures: failedMessageIds.map(id => ({ itemIdentifier: id }))
    };
  }

  console.log('');
  console.log('✅ [SUCCESS] Todos los mensajes procesados correctamente - No hay reintentos');
  console.log('');
  
  return {
    statusCode: 200,
    body: `Processed ${successCount} messages (${duplicatesDetected} duplicates skipped)`
  };
};

// ═══════════════════════════════════════════════════════════════
// 🎯 EXPORT HANDLER (with conditional idempotency wrapper)
// ═══════════════════════════════════════════════════════════════

// Apply idempotency wrapper only if enabled via environment variable
export const handler = process.env.ENABLE_IDEMPOTENCY === 'true'
  ? makeIdempotent(handlerLogic, {
      persistenceStore: persistence,
      config: idempotencyConfig
    })
  : handlerLogic;



// ═══════════════════════════════════════════════════════════════
// 🎯 EVENT TYPE PROCESSORS
// ═══════════════════════════════════════════════════════════════

async function processEventByType(payload: NotificationPayload, messageId: string): Promise<void> {
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
      await processGenericEvent(payload, messageId);
  }
}

async function processUserCreated(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`👤 [USER_CREATED] ${payload.id}`);
  // Business logic here
}

async function processUserUpdated(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`🔄 [USER_UPDATED] ${payload.id}`);
  // Business logic here
}

async function processOrderPlaced(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`🛒 [ORDER_PLACED] ${payload.id}`);
  // Business logic here
}

async function processTestEvent(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`🧪 [TEST_EVENT] ${payload.id}`);
  // Business logic here
}

async function processGenericEvent(payload: NotificationPayload, messageId: string): Promise<void> {
  console.log(`🔄 [GENERIC] ${payload.event} - ${payload.id}`);
  // Business logic here
}

// ═══════════════════════════════════════════════════════════════
// 📊 CLOUDWATCH METRICS
// ═══════════════════════════════════════════════════════════════

async function sendMetrics(
  successCount: number,
  errorCount: number,
  processingTime: number,
  totalMessages: number,
  setupTime: number,
  duplicatesDetected: number
): Promise<void> {
  try {
    const metrics = [
      {
        MetricName: 'MessagesProcessedSuccess',
        Value: successCount,
        Unit: 'Count' as const,
        Timestamp: new Date(),
        Dimensions: [{ Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer' }]
      },
      {
        MetricName: 'MessagesProcessedError',
        Value: errorCount,
        Unit: 'Count' as const,
        Timestamp: new Date(),
        Dimensions: [{ Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer' }]
      },
      {
        MetricName: 'DuplicatesDetected',
        Value: duplicatesDetected,
        Unit: 'Count' as const,
        Timestamp: new Date(),
        Dimensions: [{ Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer' }]
      },
      {
        MetricName: 'BatchProcessingTime',
        Value: processingTime,
        Unit: 'Milliseconds' as const,
        Timestamp: new Date(),
        Dimensions: [{ Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer' }]
      },
      {
        MetricName: 'BatchSize',
        Value: totalMessages,
        Unit: 'Count' as const,
        Timestamp: new Date(),
        Dimensions: [{ Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer' }]
      },
      {
        MetricName: 'ColdStarts',
        Value: global.isWarm ? 0 : 1,
        Unit: 'Count' as const,
        Timestamp: new Date(),
        Dimensions: [{ Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer' }]
      },
      {
        MetricName: 'SetupTimeMs',
        Value: setupTime,
        Unit: 'Milliseconds' as const,
        Timestamp: new Date(),
        Dimensions: [{ Name: 'LambdaFunction', Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'consumer' }]
      }
    ];

    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'SQS-Consumer-POC',
      MetricData: metrics
    }));

    console.log(`📊 [METRICS] Sent ${metrics.length} metrics to CloudWatch`);
  } catch (error) {
    console.error(`❌ [METRICS] Failed:`, error);
  }
}
