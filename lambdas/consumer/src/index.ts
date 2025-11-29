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

  // Agrupar mensajes por MessageGroupId
  const messagesByGroup = new Map<string, SQSRecord[]>();
  event.Records.forEach(record => {
    const groupId = record.attributes.MessageGroupId || 'default';
    if (!messagesByGroup.has(groupId)) {
      messagesByGroup.set(groupId, []);
    }
    messagesByGroup.get(groupId)!.push(record);
  });

  console.log(`📊 Grupos detectados: ${messagesByGroup.size}`);
  messagesByGroup.forEach((records, groupId) => {
    console.log(`   📁 Grupo "${groupId}": ${records.length} mensaje(s)`);
  });
  console.log();

  const failedMessageIds: string[] = [];
  const blockedGroups = new Set<string>();

  // Procesar cada grupo
  for (const [groupId, records] of messagesByGroup.entries()) {
    console.log(`\n${'┌'.repeat(35)} GRUPO: ${groupId} ${'┐'.repeat(35 - groupId.length)}`);
    
    let firstFailureInGroup = -1;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const globalIndex = event.Records.indexOf(record) + 1;

      // Si ya falló un mensaje anterior en este grupo, bloquear este también
      if (firstFailureInGroup !== -1) {
        console.log(`🔒 Mensaje ${i + 1} BLOQUEADO (grupo ${groupId} tiene fallo previo)`);
        failedMessageIds.push(record.messageId);
        continue;
      }

      try {
        await processMessage(record, globalIndex, event.Records.length, groupId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Mensaje ${i + 1} FALLÓ: ${errorMessage}`);
        
        // Marcar el primer fallo de este grupo
        firstFailureInGroup = i;
        blockedGroups.add(groupId);
        failedMessageIds.push(record.messageId);
        
        console.log(`\n🛑 FIFO: Bloqueando grupo "${groupId}" desde mensaje ${i + 1}`);
        console.log(`   Los siguientes mensajes de este grupo serán reportados como fallidos\n`);

        // Bloquear todos los mensajes posteriores del mismo grupo
        for (let j = i + 1; j < records.length; j++) {
          failedMessageIds.push(records[j].messageId);
          console.log(`   🔒 Bloqueando mensaje ${j + 1} del grupo "${groupId}"`);
        }
        break; // Salir del loop de este grupo
      }
    }

    console.log(`${'└'.repeat(70)}\n`);
  }

  // Resumen
  const successCount = event.Records.length - failedMessageIds.length;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 RESUMEN FINAL:`);
  console.log(`   Total mensajes:     ${event.Records.length}`);
  console.log(`   Grupos totales:     ${messagesByGroup.size}`);
  console.log(`   Grupos bloqueados:  ${blockedGroups.size}`);
  console.log(`   Mensajes exitosos:  ${successCount}`);
  console.log(`   Mensajes fallidos:  ${failedMessageIds.length}`);
  if (blockedGroups.size > 0) {
    console.log(`   🔒 Grupos con orden preservado: ${Array.from(blockedGroups).join(', ')}`);
  }
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

async function processMessage(record: SQSRecord, index: number, total: number, groupId?: string): Promise<void> {
  console.log(`${'─'.repeat(70)}`);
  console.log(`📨 MENSAJE ${index}/${total}${groupId ? ` [Grupo: ${groupId}]` : ''}`);
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
