// Comments in English (following best practices)
import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { 
  IdempotencyConfig, 
  makeIdempotent
} from '@aws-lambda-powertools/idempotency';
import { DynamoDBPersistenceLayer } from '@aws-lambda-powertools/idempotency/dynamodb';

// 🔧 CloudWatch client
const cloudwatch = new CloudWatchClient({});

// 🔑 Idempotency setup (exact pattern as proposed)
const persistence = new DynamoDBPersistenceLayer({ 
  tableName: process.env.IDEMPOTENCY_TABLE! 
});

const idempotencyConfig = new IdempotencyConfig({
  eventKeyJmesPath: 'body.Message.id',  // Use the event ID from the payload (allows testing duplicates)
  expiresAfterSeconds: 604800            // 7 days (same as DynamoDB TTL)
});

// 🌡️ Global variable para detectar cold starts
declare global {
  var isWarm: boolean;
}

// 📊 Interfaces
interface NotificationPayload {
  event: string;
  id: string;
  data?: any;
  timestamp?: string;
  source?: string;
  forceError?: boolean;
}

interface ProcessingConfig {
  forceError?: boolean;
  errorRate?: number;
  processingDelay?: number;
}

// Business logic extracted (will be wrapped by idempotency)
async function processBusinessLogic(record: SQSRecord): Promise<void> {
  const messageId = record.messageId;
  
  console.log(`🔍 [PROCESSOR] Processing: ${messageId}`);

  // Parse payload (from SNS or direct)
  let payload: NotificationPayload;
  
  try {
    const parsed = JSON.parse(record.body);
    
    // SNS wrapped message
    if (parsed.Type === 'Notification' && parsed.Message) {
      payload = JSON.parse(parsed.Message);
    } else {
      // Direct SQS message
      payload = parsed;
    }
  } catch (parseError) {
    throw new Error(`Parse error: ${parseError}`);
  }

  console.log(`🎯 [EVENT] ${payload.event} | ID: ${payload.id}`);

  // Configuration for error simulation
  const config: ProcessingConfig = {
    forceError: process.env.FORCE_ERROR === 'true',
    errorRate: parseInt(process.env.ERROR_RATE || '0'),
    processingDelay: parseInt(process.env.PROCESSING_DELAY || '0')
  };

  // Simulate random errors
  if (config.errorRate && config.errorRate > 0) {
    if (Math.random() * 100 < config.errorRate) {
      throw new Error(`🎲 Simulated random error (${config.errorRate}% rate)`);
    }
  }

  // Force error if configured
  if (config.forceError || payload.forceError === true) {
    throw new Error(`🚨 Forced error for testing`);
  }

  // Processing delay
  if (config.processingDelay && config.processingDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, config.processingDelay));
  }

  // Process by event type
  await processEventByType(payload, messageId);

  console.log(`✅ [SUCCESS] ${payload.event} processed`);
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
  
  console.log(`🚀 [CONSUMER] Batch size: ${event.Records.length}`);
  console.log(`🔥 [COLD START] ${isColdStart ? 'YES ❄️' : 'NO 🔥'}`);
  console.log(`🔑 [IDEMPOTENCY] ${idempotencyEnabled ? 'ENABLED ✅' : 'DISABLED ⚠️'}`);

  const setupCompleteTime = Date.now();
  const setupOverhead = setupCompleteTime - handlerStartTime;
  console.log(`⏱️ [TIMING] Setup: ${setupOverhead}ms`);

  // Metrics
  let successCount = 0;
  let errorCount = 0;
  let duplicatesDetected = 0;
  const batchStartTime = Date.now();
  const failedMessageIds: string[] = [];

  // Process each record in the batch
  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      // 🐛 DEBUG: Log complete record structure
      console.log('═══════════════════════════════════════');
      console.log('📦 [DEBUG] SQS Record completo:');
      console.log(JSON.stringify(record, null, 2));
      console.log('───────────────────────────────────────');
      console.log('🆔 [DEBUG] MessageId:', record.messageId);
      console.log('📄 [DEBUG] Body (raw string):', record.body);
      
      try {
        const snsNotification = JSON.parse(record.body);
        console.log('📨 [DEBUG] SNS Notification:', JSON.stringify(snsNotification, null, 2));
        console.log('📝 [DEBUG] SNS Message (raw):', snsNotification.Message);
        
        const payload = JSON.parse(snsNotification.Message);
        console.log('🎯 [DEBUG] Payload parseado:', JSON.stringify(payload, null, 2));
        console.log('🔑 [DEBUG] Payload ID:', payload.id);
        console.log('📌 [DEBUG] Payload Event:', payload.event);
      } catch (error) {
        console.error('❌ [DEBUG] Error parsing:', error);
      }
      console.log('═══════════════════════════════════════');
      
      await processBusinessLogic(record);
      return 'success';
    })
  );

  // Count results
  results.forEach((result, index) => {
    const record = event.Records[index];
    if (result.status === 'fulfilled') {
      successCount++;
      console.log(`✅ [${index + 1}] ${record.messageId} - SUCCESS`);
    } else {
      errorCount++;
      failedMessageIds.push(record.messageId);
      console.error(`❌ [${index + 1}] ${record.messageId} - ERROR:`, result.reason);
    }
  });

  const processingTime = Date.now() - batchStartTime;
  const totalTime = Date.now() - handlerStartTime;

  console.log(`📊 [SUMMARY] Success: ${successCount}, Errors: ${errorCount}, Duplicates: ${duplicatesDetected}`);
  console.log(`⏱️ [TIMING] Processing: ${processingTime}ms, Total: ${totalTime}ms`);

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
    console.warn(`⚠️ [RETRY] ${errorCount} messages will be retried by SQS`);
    return {
      batchItemFailures: failedMessageIds.map(id => ({ itemIdentifier: id }))
    };
  }

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
