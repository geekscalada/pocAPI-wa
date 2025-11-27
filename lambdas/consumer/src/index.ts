import { SQSEvent, SQSBatchResponse, SQSRecord } from 'aws-lambda';

interface NotificationPayload {
  event: string;
  id: string;
  shouldFail?: 'yes' | 'no';
  data?: any;
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 BATCH STARTED - ${new Date().toISOString()}`);
  console.log(`📦 Batch Size: ${event.Records.length} mensajes`);
  console.log(`${'='.repeat(70)}\n`);

  const failedMessageIds: string[] = [];

  // Procesar cada mensaje
  for (let i = 0; i < event.Records.length; i++) {
    const record = event.Records[i];
    
    try {
      await processMessage(record, i + 1, event.Records.length);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Mensaje ${i + 1} FALLÓ: ${errorMessage}\n`);
      failedMessageIds.push(record.messageId);
    }
  }

  // Resumen
  const successCount = event.Records.length - failedMessageIds.length;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 RESUMEN:`);
  console.log(`   Total:   ${event.Records.length}`);
  console.log(`   Éxitos:  ${successCount}`);
  console.log(`   Fallos:  ${failedMessageIds.length}`);
  console.log(`${'='.repeat(70)}\n`);

  // Retornar batch item failures si hay errores
  if (failedMessageIds.length > 0) {
    console.log(`🔄 Reportando ${failedMessageIds.length} mensaje(s) fallido(s) para reintento\n`);
    return {
      batchItemFailures: failedMessageIds.map(id => ({ itemIdentifier: id }))
    };
  }

  console.log(`✅ Todos los mensajes procesados correctamente\n`);
  return { batchItemFailures: [] };
};

async function processMessage(record: SQSRecord, index: number, total: number): Promise<void> {
  console.log(`${'─'.repeat(70)}`);
  console.log(`📨 MENSAJE ${index}/${total}`);
  console.log(`🆔 MessageId: ${record.messageId.substring(0, 30)}...`);
  console.log(`🔢 ReceiveCount: ${record.attributes.ApproximateReceiveCount}`);

  // Parse payload
  const parsed = JSON.parse(record.body);
  let payload: NotificationPayload;

  if (parsed.Type === 'Notification' && parsed.Message) {
    // SNS wrapped
    payload = JSON.parse(parsed.Message);
  } else {
    // Direct SQS
    payload = parsed;
  }

  console.log(`🏷️  ID: ${payload.id}`);
  console.log(`📌 Event: ${payload.event}`);
  console.log(`🎚️  shouldFail: ${payload.shouldFail || 'no'}`);

  // Verificar si debe fallar
  if (payload.shouldFail === 'yes') {
    console.log(`🚨 Mensaje configurado para FALLAR`);
    throw new Error(`Fallo intencional del mensaje ${payload.id}`);
  }

  // Simular procesamiento
  console.log(`⏳ Procesando...`);
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log(`✅ Mensaje ${payload.id} procesado correctamente`);
}
