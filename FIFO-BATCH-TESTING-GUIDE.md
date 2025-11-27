# 🧪 Guía de Testing: FIFO + batchItemFailures

## 🎯 Objetivo del Test

Validar que en una cola **FIFO** con **batchItemFailures**, cuando tenemos mensajes `A1`, `A2`, `A3` en el mismo grupo y **A2 falla**, el mensaje **A3 se procesa** aunque no lo bloquees manualmente en `batchItemFailures`.

### ⚠️ Hipótesis a Validar

> **Si solo reportas A2 como fallido en `batchItemFailures`, Lambda considera A3 como procesado exitosamente, incluso si no hiciste nada con él.**

---

## 📋 Requisitos Previos

1. **Desplegar la infraestructura FIFO**:
   ```bash
   cd infra
   npx cdk deploy --all --context env=dev --profile your-profile
   ```

2. **Obtener la URL del API Gateway**:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name pocAPI-wa-dev-testing-api \
     --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
     --output text \
     --profile your-profile
   ```

3. **Configurar variables de entorno**:
   ```bash
   export API_URL="https://xxx.execute-api.us-east-1.amazonaws.com/dev/publish"
   ```

---

## 🚀 Procedimiento con Postman

### Paso 1: Enviar mensaje A1 (Éxito esperado)

**Request:**
```http
POST {{API_URL}}/publish
Content-Type: application/json

{
  "eventType": "FIFO_TEST",
  "id": "A1",
  "messageGroupId": "test-group-A",
  "data": {
    "testCase": "batch-item-failures",
    "position": "A1",
    "timestamp": "2025-11-27T10:00:00Z"
  },
  "forceError": false
}
```

**Expected Response:**
```json
{
  "success": true,
  "messageId": "xxx-xxx-xxx",
  "payload": {
    "event": "FIFO_TEST",
    "id": "A1",
    ...
  },
  "message": "Event \"FIFO_TEST\" sent successfully to SNS"
}
```

**⏱️ Esperar:** 2-3 segundos antes del siguiente mensaje

---

### Paso 2: Enviar mensaje A2 (Fallo forzado)

**Request:**
```http
POST {{API_URL}}/publish
Content-Type: application/json

{
  "eventType": "FIFO_TEST",
  "id": "A2",
  "messageGroupId": "test-group-A",
  "data": {
    "testCase": "batch-item-failures",
    "position": "A2",
    "timestamp": "2025-11-27T10:00:05Z"
  },
  "forceError": false
}
```

> **Nota:** El consumer tiene lógica específica para fallar automáticamente cuando `payload.id === "A2"`

**Expected Response:**
```json
{
  "success": true,
  "messageId": "xxx-xxx-xxx",
  ...
}
```

**⏱️ Esperar:** 2-3 segundos antes del siguiente mensaje

---

### Paso 3: Enviar mensaje A3 (Éxito esperado)

**Request:**
```http
POST {{API_URL}}/publish
Content-Type: application/json

{
  "eventType": "FIFO_TEST",
  "id": "A3",
  "messageGroupId": "test-group-A",
  "data": {
    "testCase": "batch-item-failures",
    "position": "A3",
    "timestamp": "2025-11-27T10:00:10Z"
  },
  "forceError": false
}
```

**Expected Response:**
```json
{
  "success": true,
  "messageId": "xxx-xxx-xxx",
  ...
}
```

---

## 📊 Validación de Resultados

### Opción 1: Verificar Logs en CloudWatch

```bash
aws logs tail /aws/lambda/pocAPI-wa-dev-consumer \
  --follow \
  --profile your-profile
```

### Logs Esperados:

#### ✅ Procesamiento de A1:
```
🎯 [EVENT] FIFO_TEST | ID: A1
✅ [SUCCESS] FIFO_TEST processed
```

#### ❌ Fallo de A2:
```
🎯 [EVENT] FIFO_TEST | ID: A2
🚨 [FIFO TEST] Forzando fallo de mensaje A2 para testing de batchItemFailures
❌ Fallo intencional del mensaje A2 - Testing FIFO batch behavior
```

#### ⚠️ Procesamiento de A3 (PROBLEMA):
```
🎯 [EVENT] FIFO_TEST | ID: A3
⚠️ [FIFO TEST] Procesando A3 - Este mensaje NO debería procesarse si A2 falló en el mismo batch
✅ [SUCCESS] FIFO_TEST processed
```

### Opción 2: Monitorear la Cola SQS

```bash
./monitor-sqs.sh
```

Observa:
- **ApproximateNumberOfMessagesVisible**: A2 debería reaparecer
- **ApproximateNumberOfMessagesNotVisible**: A3 desaparece (procesado)

---

## 🔍 Interpretación de Resultados

### ❌ Comportamiento ACTUAL (Incorrecto):

| Mensaje | Estado | Retornado en batchItemFailures | SQS Action |
|---------|--------|-------------------------------|------------|
| A1 | ✅ Éxito | No | Eliminado de la cola |
| A2 | ❌ Fallo | Sí (`itemIdentifier: A2`) | Se reintenta |
| A3 | ✅ Éxito | **No** | **❌ Eliminado (PROBLEMA)** |

**Consecuencia:** A3 se procesa **antes** de que A2 se complete exitosamente, **rompiendo el orden FIFO**.

---

### ✅ Comportamiento CORRECTO (Lo que deberías hacer):

```typescript
// En el consumer Lambda, cuando A2 falla:
return {
  batchItemFailures: [
    { itemIdentifier: messageIdA2 },  // A2 falla
    { itemIdentifier: messageIdA3 }   // 🚨 Bloquear A3 también
  ]
};
```

| Mensaje | Estado | Retornado en batchItemFailures | SQS Action |
|---------|--------|-------------------------------|------------|
| A1 | ✅ Éxito | No | Eliminado de la cola |
| A2 | ❌ Fallo | Sí | Se reintenta |
| A3 | ⏸️ Bloqueado | **Sí** | **✅ Vuelve a la cola** |

**Resultado:** A3 **NO** se procesa hasta que A2 se complete exitosamente, **preservando el orden FIFO**.

---

## 🧪 Escenarios Adicionales para Explorar

### Test 2: Validar reintentos de A2

1. Envía A1, A2, A3 (mismo procedimiento)
2. A2 falla 3 veces (maxReceiveCount = 3)
3. A2 va a DLQ
4. **¿Qué pasa con A3?**

### Test 3: Múltiples grupos

```json
{
  "id": "B1",
  "messageGroupId": "test-group-B"  // Diferente grupo
}
```

**Pregunta:** ¿Los mensajes del grupo B se procesan mientras A2 está fallando?

**Respuesta esperada:** Sí, porque FIFO es **por grupo**, no global.

---

## 📚 Recursos de Aprendizaje

### Documentación AWS:
- [SQS FIFO Queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html)
- [Lambda Batch Item Failures](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting)

### Conceptos Clave:
- **MessageGroupId**: Agrupa mensajes para orden FIFO
- **batchItemFailures**: Solo reporta fallos, no éxitos
- **Implicit Success**: Todo lo NO reportado = éxito
- **Partial Batch Response**: Reintentar solo fallos

---

## 🎓 Conclusión

Este test demuestra que **`batchItemFailures` requiere gestión manual del orden FIFO**. Debes:

1. ✅ **Detectar fallo en posición N**
2. ✅ **Reportar fallo de N**
3. ✅ **Reportar fallo de N+1, N+2, ... (todos los siguientes)**

Si no haces el paso 3, **rompes el orden FIFO** porque SQS asume que los mensajes siguientes se procesaron correctamente.

---

## 🔧 Limpieza

```bash
# Destruir stack
npx cdk destroy --all --context env=dev --profile your-profile

# Limpiar logs
aws logs delete-log-group \
  --log-group-name /aws/lambda/pocAPI-wa-dev-consumer \
  --profile your-profile
```
