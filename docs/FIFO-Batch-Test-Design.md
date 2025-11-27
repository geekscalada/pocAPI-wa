# 🧠 Diseño del Test: FIFO + batchItemFailures

## 🎯 Pregunta de Investigación

> **"En una cola FIFO con batchSizes, cuando tengo A1, A2, A3 dentro de un grupo y A2 falla, ¿se procesará A3 aunque use batchItemFailures?"**

### 🔬 Hipótesis
**SÍ**, A3 se procesará porque `batchItemFailures` solo reporta **qué falló**, no **qué se bloqueó**. SQS asume que todo lo no reportado = éxito.

---

## 🏗️ Arquitectura del Test

```
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│   Postman   │─────▶│ API Gateway │─────▶│  Publisher   │
│  (3 calls)  │      │   (REST)    │      │   Lambda     │
└─────────────┘      └─────────────┘      └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌───────────────┐
                                          │   SNS Topic   │
                                          │    "test"     │
                                          └───────┬───────┘
                                                  │
                                                  ▼
                                          ┌───────────────┐
                                          │  SQS FIFO     │
                                          │  .fifo queue  │
                                          │               │
                                          │  MessageGroup │
                                          │  "test-group-A"│
                                          └───────┬───────┘
                                                  │
                                                  │ Batch Trigger
                                                  │ (size=10, window=5s)
                                                  ▼
                                          ┌───────────────┐
                                          │  Consumer     │
                                          │  Lambda       │
                                          │               │
                                          │  Logs:        │
                                          │  • A1 ✅      │
                                          │  • A2 ❌      │
                                          │  • A3 ✅ (!)  │
                                          └───────────────┘
```

---

## 📝 Flujo de Mensajes

### Envío desde Postman

```javascript
// Call 1 (t=0s)
POST /publish
{
  "id": "A1",
  "messageGroupId": "test-group-A",
  "eventType": "FIFO_TEST"
}

// Call 2 (t=2s)
POST /publish
{
  "id": "A2",  // 🚨 Consumer forzará fallo
  "messageGroupId": "test-group-A",
  "eventType": "FIFO_TEST"
}

// Call 3 (t=4s)
POST /publish
{
  "id": "A3",
  "messageGroupId": "test-group-A",
  "eventType": "FIFO_TEST"
}
```

### Procesamiento en Consumer Lambda

#### ⚙️ Configuración Lambda:
- **Batch Size**: 10 mensajes máximo
- **Batch Window**: 5 segundos
- **Report Batch Item Failures**: ✅ Habilitado

#### 🔄 Ejecución:

```typescript
// Lambda recibe batch [A1, A2, A3]
handler(event: SQSEvent) {
  
  const results = await Promise.allSettled([
    processBusinessLogic(A1),  // ✅ Success
    processBusinessLogic(A2),  // ❌ Throws error (id === "A2")
    processBusinessLogic(A3),  // ✅ Success
  ]);
  
  // Mapeo de resultados:
  // A1: fulfilled ✅
  // A2: rejected  ❌ → failedMessageIds.push(messageId_A2)
  // A3: fulfilled ✅
  
  // Retorno:
  return {
    batchItemFailures: [
      { itemIdentifier: messageId_A2 }  // Solo A2
    ]
  };
}
```

### 🎭 Comportamiento de SQS

```
SQS recibe respuesta de Lambda:
{
  batchItemFailures: [ { itemIdentifier: "msg-A2-id" } ]
}

SQS interpreta:
┌─────┬──────────┬────────────────────────────────────┐
│ Msg │ Status   │ Action                             │
├─────┼──────────┼────────────────────────────────────┤
│ A1  │ ✅ OK    │ Delete from queue                  │
│ A2  │ ❌ FAIL  │ Retry (increment receiveCount)     │
│ A3  │ ✅ OK    │ Delete from queue ⚠️ PROBLEMA      │
└─────┴──────────┴────────────────────────────────────┘

RESULTADO: A3 se procesó ANTES de que A2 se complete → Orden FIFO roto
```

---

## 🧪 Validación del Test

### ✅ Éxito del Test (Valida la hipótesis):

**Verás en CloudWatch Logs:**

```
🎯 [EVENT] FIFO_TEST | ID: A1
✅ [SUCCESS] FIFO_TEST processed

🎯 [EVENT] FIFO_TEST | ID: A2
🚨 [FIFO TEST] Forzando fallo de mensaje A2...
❌ Error: Fallo intencional del mensaje A2

🎯 [EVENT] FIFO_TEST | ID: A3
⚠️ [FIFO TEST] Procesando A3 - Este mensaje NO debería procesarse si A2 falló
✅ [SUCCESS] FIFO_TEST processed

📊 [SUMMARY] Success: 2, Errors: 1
⚠️ [RETRY] 1 messages will be retried by SQS
```

**Interpretación:**
- ✅ A3 se procesó (ver logs)
- ✅ A2 se marcó para reintento
- ❌ **Orden FIFO comprometido**

---

## 🔧 Modificaciones del Código

### 1. SQS Stack (FIFO habilitado)
```typescript
this.mainQueue = new sqs.Queue(this, 'MainQueue', {
  queueName: `${projectName}-${environmentName}-main-queue.fifo`, // ✅ .fifo
  fifo: true,  // ✅
  contentBasedDeduplication: true,  // ✅
  deliveryDelay: Duration.seconds(0),  // 🚨 FIFO no permite > 0
  // ...
});
```

### 2. Publisher Lambda (MessageGroupId)
```typescript
const { messageGroupId } = body;

if (messageGroupId) {
  attributes.messageGroupId = { 
    DataType: 'String', 
    StringValue: messageGroupId 
  };
}
```

### 3. Consumer Lambda (Fallo selectivo)
```typescript
async function processBusinessLogic(record: SQSRecord): Promise<void> {
  const payload = parsePayload(record);
  
  // 🚨 Forzar fallo de A2
  if (payload.id === 'A2') {
    throw new Error(`❌ Fallo intencional del mensaje A2`);
  }
  
  // Logging especial para A3
  if (payload.id === 'A3') {
    console.warn(`⚠️ [FIFO TEST] Procesando A3 - NO debería procesarse si A2 falló`);
  }
  
  // Procesar normalmente...
}
```

---

## 📊 Comparativa: Comportamiento Incorrecto vs Correcto

### ❌ Incorrecto (Actual):

```typescript
return {
  batchItemFailures: [
    { itemIdentifier: messageIdA2 }  // Solo A2
  ]
};
```

**Resultado:**
- A1: ✅ Eliminado
- A2: 🔄 Reintentado
- A3: ✅ Eliminado (PROBLEMA - se procesó fuera de orden)

---

### ✅ Correcto (Solución):

```typescript
// Detectar posición del fallo
const failedIndex = results.findIndex(r => r.status === 'rejected');

// Reportar fallo de todos los mensajes desde el fallo en adelante
const itemsToRetry = event.Records
  .slice(failedIndex)  // A2, A3
  .map(record => ({ itemIdentifier: record.messageId }));

return {
  batchItemFailures: itemsToRetry  // A2 y A3
};
```

**Resultado:**
- A1: ✅ Eliminado
- A2: 🔄 Reintentado
- A3: 🔄 Reintentado (preserva orden FIFO)

---

## 🎓 Conceptos Clave Aprendidos

### 1. **batchItemFailures es explícito**
- Solo reportas lo que **falló**
- SQS asume que lo no reportado = **éxito**

### 2. **FIFO requiere gestión manual de orden**
- Si falla el mensaje N, debes bloquear N+1, N+2, ...
- No es automático con `batchItemFailures`

### 3. **Implicit success vs Explicit failure**
```
NO reportado en batchItemFailures = ÉXITO implícito
Reportado en batchItemFailures = FALLO explícito
```

### 4. **Responsabilidad del desarrollador**
- AWS te da las herramientas
- **TÚ** debes implementar la lógica correcta

---

## 🚀 Próximos Pasos

### Exploración 1: Dead Letter Queue
**Pregunta:** ¿Qué pasa con A3 si A2 va a DLQ después de 3 reintentos?

### Exploración 2: Múltiples Grupos
**Pregunta:** ¿El fallo en grupo A bloquea al grupo B?
**Respuesta esperada:** No, FIFO es por grupo.

### Exploración 3: Batch Size = 1
**Pregunta:** ¿Desaparece el problema con batch size = 1?
**Respuesta:** Sí, pero pierdes throughput.

---

## 📚 Referencias

- [AWS SQS FIFO](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html)
- [Lambda Batch Item Failures](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting)
- [FIFO Ordering Best Practices](https://aws.amazon.com/blogs/compute/new-for-aws-lambda-sqs-fifo-as-an-event-source/)

---

**Autor:** José (Laboratorio de aprendizaje AWS)  
**Fecha:** 27 Noviembre 2025  
**Objetivo:** Comprender profundamente SQS FIFO + Lambda batch processing
