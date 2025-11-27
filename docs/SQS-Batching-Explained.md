# 📦 SQS Batching: Cómo Lambda Agrupa Mensajes

## 🎯 Concepto Básico

Cuando configuras una Lambda con SQS como event source, Lambda **no invoca tu función por cada mensaje individual**. En su lugar, **agrupa múltiples mensajes** en un batch y hace **una sola invocación** con ese batch.

---

## ⚙️ Parámetros de Configuración

### 1. `batchSize` (Tamaño del Batch)

```typescript
batchSize: 10  // Rango: 1-10 para colas estándar, 1-10 para FIFO
```

**Significado:**
- **Máximo** número de mensajes que Lambda agrupará en una invocación
- No es un mínimo, Lambda puede invocar con menos mensajes

**Ejemplo:**
```
batchSize: 10

Escenario A: Hay 15 mensajes en la cola
→ Invocación 1: 10 mensajes
→ Invocación 2: 5 mensajes

Escenario B: Hay 3 mensajes en la cola
→ Invocación 1: 3 mensajes (no espera a 10)
```

---

### 2. `maxBatchingWindow` (Ventana de Agrupación)

```typescript
maxBatchingWindow: Duration.seconds(5)  // Rango: 0-300 segundos
```

**Significado:**
- Tiempo **máximo** que Lambda esperará para llenar el batch antes de invocar
- Si se alcanza el `batchSize` antes, invoca inmediatamente

**Comportamiento:**
```
maxBatchingWindow: 5 segundos
batchSize: 10

T=0s:  Llega mensaje A1  → Lambda empieza a contar (0/10 mensajes)
T=1s:  Llega mensaje A2  → Lambda sigue esperando (2/10 mensajes)
T=2s:  Llega mensaje A3  → Lambda sigue esperando (3/10 mensajes)
T=5s:  ⏰ Timeout alcanzado → Lambda invoca con [A1, A2, A3]

O si llegan 10 mensajes antes de 5s:
T=0s:  Llegan 10 mensajes → Lambda invoca inmediatamente (no espera)
```

---

## 🧪 Aplicación al Test FIFO

### Configuración Actual:

```typescript
batchSize: 10
maxBatchingWindow: Duration.seconds(5)
```

### Escenario del Test:

```
T=0s:   POST /publish → Mensaje A1 → SNS → SQS
T=1s:   POST /publish → Mensaje A2 → SNS → SQS  
T=2s:   POST /publish → Mensaje A3 → SNS → SQS

SQS tiene ahora: [A1, A2, A3] (3 mensajes)

Lambda detecta mensajes disponibles:
- Tiene 3 mensajes (< batchSize de 10)
- Ha pasado < 5 segundos desde el primer mensaje
- Lambda ESPERA hasta que:
  a) Llegue el mensaje #10, O
  b) Pasen 5 segundos desde A1

En nuestro caso:
T=5s: Lambda invoca con batch = [A1, A2, A3]
```

---

## 🚨 Factores que Afectan el Batching

### 1. **Velocidad de Envío**

```bash
# ✅ CORRECTO - Mensajes en mismo batch
A1 enviado en T=0s
A2 enviado en T=1s  
A3 enviado en T=2s
→ Total: 2s < 5s window → Mismo batch

# ❌ INCORRECTO - Mensajes en batches diferentes
A1 enviado en T=0s
→ Lambda invoca a los 5s con solo [A1]
A2 enviado en T=7s
A3 enviado en T=8s
→ Lambda invoca nuevamente con [A2, A3]
```

### 2. **Latencia de SNS → SQS**

```
Publisher → SNS (50-100ms) → SQS → Lambda
```

Aunque envíes los mensajes rápido desde Postman, puede haber un pequeño delay en SNS/SQS. **Recomendación:** espera 1 segundo entre mensajes.

### 3. **MessageGroupId (FIFO)**

En colas **FIFO**, Lambda agrupa mensajes **solo del mismo MessageGroupId** por defecto (según configuración):

```typescript
// Configuración FIFO
deduplicationScope: DeduplicationScope.MESSAGE_GROUP
fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID
```

**Ejemplo:**
```
Cola FIFO con:
- A1 (group: "test-group-A")
- A2 (group: "test-group-A")
- B1 (group: "test-group-B")
- A3 (group: "test-group-A")

Batch resultante: [A1, A2, A3] (solo grupo A)
B1 se procesará en otra invocación
```

---

## 📊 Validar el Batching

### En CloudWatch Logs:

```typescript
// Lambda consumer logea:
console.log(`🚀 [CONSUMER] Batch size: ${event.Records.length}`);

// Deberías ver:
🚀 [CONSUMER] Batch size: 3  // ✅ Confirmado: 3 mensajes en 1 batch
```

### Con AWS CLI:

```bash
# Ver métricas de Lambda
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --dimensions Name=FunctionName,Value=pocAPI-wa-dev-consumer \
  --start-time 2025-11-27T10:00:00Z \
  --end-time 2025-11-27T10:10:00Z \
  --period 60 \
  --statistics Maximum
```

Si ves `ConcurrentExecutions = 1` con 3 mensajes procesados → Confirmado que fue 1 batch.

---

## 🎓 Conclusiones Clave

1. **`batchSize` es un máximo, no un mínimo**
   - Lambda puede invocar con menos mensajes

2. **`maxBatchingWindow` es un timeout, no una garantía**
   - Lambda puede invocar antes si se llena el batch

3. **Para garantizar batching en tests:**
   - Envía mensajes **rápidamente** (< maxBatchingWindow)
   - Usa el mismo `MessageGroupId` en FIFO
   - Verifica logs para confirmar batch size

4. **En FIFO, el orden se mantiene dentro del batch**
   - Los mensajes en el batch están ordenados por secuencia FIFO
   - Pero `batchItemFailures` puede romper este orden si no se maneja bien

---

## 🧪 Próximos Experimentos

### Experimento 1: Batch Size = 1
```typescript
batchSize: 1  // Cada mensaje se procesa individualmente
```

**Pregunta:** ¿Desaparece el problema de FIFO + batchItemFailures?
**Respuesta esperada:** Sí, pero pierdes throughput.

### Experimento 2: MaxBatchingWindow = 0
```typescript
maxBatchingWindow: Duration.seconds(0)
```

**Pregunta:** ¿Lambda invoca inmediatamente al primer mensaje?
**Respuesta esperada:** Sí, pero puede agrupar si llegan muy rápido.

### Experimento 3: Múltiples Grupos Simultáneos
```
Enviar simultáneamente:
- Grupo A: A1, A2, A3
- Grupo B: B1, B2, B3
```

**Pregunta:** ¿Cómo se distribuyen en los batches?

---

## 📚 Referencias

- [Lambda SQS Event Source](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html)
- [SQS Batch Item Failures](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting)
- [CDK SqsEventSource](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_event_sources.SqsEventSource.html)
