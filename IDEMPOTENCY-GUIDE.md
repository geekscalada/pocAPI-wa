# 🔑 Idempotencia con AWS Lambda Powertools - Guía Completa

## 📋 Overview

Esta POC demuestra **idempotencia** en un consumer Lambda usando **AWS Lambda Powertools**, comparando el comportamiento **con** y **sin** idempotencia activada.

### ¿Qué es Idempotencia?
Garantiza que procesar el mismo mensaje múltiples veces produce el mismo resultado que procesarlo una sola vez. Crítico para sistemas distribuidos donde los duplicados son inevitables.

---

## 🏗️ Arquitectura

```
API Gateway → SNS → SQS → Lambda Consumer
                              ↓
                         DynamoDB (Idempotency Table)
                              ↓
                         CloudWatch Metrics
```

**Flujo con Idempotencia:**
1. Mensaje llega al consumer
2. Powertools verifica DynamoDB usando `messageId`
3. Si existe → Skip (duplicado detectado)
4. Si no existe → Procesa y registra en DynamoDB
5. Métricas reportan duplicados detectados

---

## 🔧 Setup

### 1. Instalar Dependencias

```bash
cd lambdas/consumer
npm install
```

Esto instalará:
- `@aws-lambda-powertools/idempotency` - Biblioteca principal
- `@aws-sdk/client-dynamodb` - Cliente DynamoDB v3

### 2. Compilar Consumer

```bash
npm run build
```

### 3. Deploy Infraestructura

```bash
cd ../../infra
npx tsc
npx aws-cdk deploy SqsStack -c env=dev
```

Esto despliega:
- ✅ `poc-api-wa-dev-idempotency` - Tabla DynamoDB
- ✅ Lambda consumer con permisos
- ✅ Variable `IDEMPOTENCY_TABLE` configurada
- ✅ Variable `ENABLE_IDEMPOTENCY=false` (por defecto)

---

## 🎯 Cómo Funciona (Lambda Powertools)

### Código Principal

```typescript
import { 
  IdempotencyConfig, 
  makeIdempotent, 
  DynamoDBPersistenceLayer 
} from '@aws-lambda-powertools/idempotency';

// Setup persistence
const persistence = new DynamoDBPersistenceLayer({
  tableName: process.env.IDEMPOTENCY_TABLE
});

// Configure idempotency
const config = new IdempotencyConfig({
  eventKeyJmesPath: 'messageId',        // SQS messageId as key
  expiresAfterSeconds: 604800,          // 7 days
  payloadValidationJmesPath: 'body'     // Validate full body
});

// Wrap processor
const idempotentProcessor = makeIdempotent(processRecordCore, {
  persistenceStore: persistence,
  config: config
});
```

### Tabla DynamoDB

**Estructura:**
```json
{
  "id": "messageId#<hash>",        // PK
  "expiration": 1234567890,        // TTL (7 days)
  "status": "COMPLETED",
  "data": "<response-hash>",
  "validation": "<payload-hash>"
}
```

**Flujo:**
1. Powertools calcula hash del messageId + payload
2. Intenta crear item con condición: "si no existe"
3. Si falla (ya existe) → lanza `IdempotencyItemAlreadyExistsError`
4. Capturamos el error y marcamos como duplicado

---

## 🧪 Testing

### Preparación

```bash
# 1. Obtener API URL y Token
cd ../../
API_URL=$(aws cloudformation describe-stacks \
  --stack-name TestingApiStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

TOKEN=$(curl -s -X POST "${API_URL}auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# 2. Hacer scripts ejecutables
chmod +x test-idempotency.sh monitor-sqs.sh
```

### Test A: Sin Idempotencia ⚠️

**Objetivo:** Ver que los duplicados se procesan múltiples veces

```bash
./test-idempotency.sh "$API_URL" "$TOKEN"
# Seleccionar opción 1: Test A
```

**Qué hace:**
1. Desactiva idempotencia (`ENABLE_IDEMPOTENCY=false`)
2. Envía 3 mensajes idénticos (mismo eventType y ID)
3. Lambda procesa los 3 mensajes
4. Lógica de negocio se ejecuta 3 veces

**Resultado esperado:**
```
✅ [1] abc-123 - SUCCESS
✅ [2] abc-123 - SUCCESS  ← DUPLICADO procesado
✅ [3] abc-123 - SUCCESS  ← DUPLICADO procesado

Success: 3, Errors: 0, Duplicates: 0
```

**Logs:**
```
✅ [PROCESSOR] Processing: abc-123
✅ [SUCCESS] USER_CREATED processed

✅ [PROCESSOR] Processing: abc-123  ← Mismo mensaje
✅ [SUCCESS] USER_CREATED processed  ← Procesado de nuevo

✅ [PROCESSOR] Processing: abc-123  ← Mismo mensaje
✅ [SUCCESS] USER_CREATED processed  ← Procesado de nuevo
```

### Test B: Con Idempotencia ✅

**Objetivo:** Ver que los duplicados se detectan y se saltan

```bash
./test-idempotency.sh "$API_URL" "$TOKEN"
# Seleccionar opción 2: Test B
```

**Qué hace:**
1. Activa idempotencia (`ENABLE_IDEMPOTENCY=true`)
2. Envía 3 mensajes idénticos
3. Solo el primero se procesa completamente
4. Los duplicados se detectan y se saltan

**Resultado esperado:**
```
✅ [1] abc-456 - SUCCESS
🔁 [2] abc-456 - DUPLICATE  ← Detectado y saltado
🔁 [3] abc-456 - DUPLICATE  ← Detectado y saltado

Success: 1, Errors: 0, Duplicates: 2
```

**Logs:**
```
✅ [PROCESSOR] Processing: abc-456
✅ [SUCCESS] USER_CREATED processed

🔁 [IDEMPOTENCY] Duplicate detected: abc-456  ← Powertools detecta
🔁 [2] abc-456 - DUPLICATE

🔁 [IDEMPOTENCY] Duplicate detected: abc-456  ← Powertools detecta
🔁 [3] abc-456 - DUPLICATE
```

### Test Comparativo 📊

Ejecuta ambos tests consecutivamente para comparar:

```bash
./test-idempotency.sh "$API_URL" "$TOKEN"
# Seleccionar opción 3: Test Comparativo
```

---

## 📊 Monitoreo

### Métricas en CloudWatch

```bash
# Ver duplicados detectados
aws cloudwatch get-metric-statistics \
  --namespace SQS-Consumer-POC \
  --metric-name DuplicatesDetected \
  --dimensions Name=LambdaFunction,Value=poc-api-wa-dev-sqs-consumer \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

**Métricas disponibles:**
- `MessagesProcessedSuccess` - Mensajes procesados correctamente
- `MessagesProcessedError` - Mensajes con error
- `DuplicatesDetected` - **Duplicados detectados y saltados**
- `BatchProcessingTime` - Tiempo de procesamiento
- `ColdStarts` - Cold starts detectados

### Logs

```bash
# Ver logs con filtro de idempotencia
aws logs tail /aws/lambda/poc-api-wa-dev-sqs-consumer \
  --follow \
  --filter-pattern "IDEMPOTENCY"
```

### Tabla de Idempotencia

```bash
# Ver registros en DynamoDB
aws dynamodb scan \
  --table-name poc-api-wa-dev-idempotency \
  --limit 10
```

Cada entrada muestra:
- `id` - Hash del messageId
- `expiration` - TTL (7 días)
- `status` - COMPLETED/IN_PROGRESS
- `validation` - Hash del payload

---

## 🔄 Activar/Desactivar Idempotencia

### Opción 1: AWS CLI

```bash
# Activar
aws lambda update-function-configuration \
  --function-name poc-api-wa-dev-sqs-consumer \
  --environment "Variables={
    ENVIRONMENT=dev,
    PROJECT_NAME=poc-api-wa,
    IDEMPOTENCY_TABLE=poc-api-wa-dev-idempotency,
    ENABLE_IDEMPOTENCY=true,
    FORCE_ERROR=false,
    ERROR_RATE=0,
    PROCESSING_DELAY=1000,
    LOG_LEVEL=INFO
  }"

# Desactivar
aws lambda update-function-configuration \
  --function-name poc-api-wa-dev-sqs-consumer \
  --environment "Variables={
    ENVIRONMENT=dev,
    PROJECT_NAME=poc-api-wa,
    IDEMPOTENCY_TABLE=poc-api-wa-dev-idempotency,
    ENABLE_IDEMPOTENCY=false,
    FORCE_ERROR=false,
    ERROR_RATE=0,
    PROCESSING_DELAY=1000,
    LOG_LEVEL=INFO
  }"
```

### Opción 2: Script Interactivo

```bash
./test-idempotency.sh "$API_URL" "$TOKEN"
# Seleccionar opción 4: Activar/Desactivar idempotencia
```

### Opción 3: CDK (permanente)

Edita `infra/lib/sqs-stack.ts`:

```typescript
environment: {
  // ...
  ENABLE_IDEMPOTENCY: 'true',  // Cambiar a 'true'
}
```

Luego redeploy:
```bash
cd infra
npx aws-cdk deploy SqsStack -c env=dev
```

---

## 🎓 Conceptos Clave

### 1. Clave de Idempotencia

```typescript
eventKeyJmesPath: 'messageId'
```

Usa el `messageId` de SQS como clave única. **Importante:** SQS garantiza que cada mensaje tiene un messageId único, incluso si el contenido es idéntico.

**Para duplicados lógicos** (mismo evento de negocio):
```typescript
// Opción A: Usar un campo del payload
eventKeyJmesPath: 'body.id'  // Ej: userId, orderId

// Opción B: Combinar campos
eventKeyJmesPath: '[body.eventType, body.id]'
```

### 2. Validación de Payload

```typescript
payloadValidationJmesPath: 'body'
```

Powertools calcula un hash del body completo. Si el messageId es el mismo pero el body cambió, **se procesa de nuevo**.

### 3. Expiración

```typescript
expiresAfterSeconds: 604800  // 7 días
```

Después de 7 días, el registro se elimina automáticamente (DynamoDB TTL). Mensajes duplicados después de este tiempo se procesarán.

### 4. Estados en DynamoDB

- `IN_PROGRESS` - Procesamiento en curso
- `COMPLETED` - Procesado exitosamente
- `EXPIRED` - Expirado (limpiado por TTL)

### 5. Manejo de Errores

Si el procesamiento falla:
- Powertools **NO** registra el mensaje como completado
- SQS reintentará el mensaje
- El mensaje se procesará en el siguiente intento

---

## 🆚 Comparación: Manual vs Powertools

### Implementación Manual (antes)

```typescript
// ❌ Más código
// ❌ Propenso a race conditions
// ❌ Necesitas manejar errores de DynamoDB
// ❌ Sin validación de payload
// ❌ Sin manejo de expiración automático

const item = await dynamodb.getItem({ Key: { messageId } });
if (item.Item) {
  return 'duplicate';
}

await processMessage();

await dynamodb.putItem({ Item: { messageId, ttl } });
```

### Lambda Powertools (ahora)

```typescript
// ✅ Una línea de código
// ✅ Maneja race conditions automáticamente
// ✅ Validación de payload incluida
// ✅ TTL automático
// ✅ Logging y métricas integradas

const processor = makeIdempotent(processRecordCore, {
  persistenceStore: persistence,
  config: config
});
```

---

## 🚀 Casos de Uso Reales

### 1. Pagos Duplicados
```typescript
eventKeyJmesPath: '[body.orderId, body.paymentMethod]'
```
Evita cobrar dos veces por el mismo pedido.

### 2. Emails Duplicados
```typescript
eventKeyJmesPath: '[body.userId, body.emailType, body.timestamp]'
```
Evita enviar el mismo email múltiples veces.

### 3. Actualizaciones de Inventario
```typescript
eventKeyJmesPath: '[body.productId, body.operation, body.requestId]'
```
Evita descontar inventario múltiples veces.

---

## 📈 Performance

### Con Idempotencia Habilitada:

**Primer mensaje (no duplicado):**
- +20-50ms: Verificación en DynamoDB (read)
- +20-50ms: Escritura en DynamoDB (write)
- Total overhead: ~40-100ms

**Mensajes duplicados:**
- +20-50ms: Verificación en DynamoDB
- Procesamiento: 0ms (saltado)
- Total: ~20-50ms (muy rápido)

**Cold start:**
- +50-100ms: Inicialización de Powertools

### Costos:

- **DynamoDB**: On-demand (pay per request)
  - Read: $0.25 per million
  - Write: $1.25 per million
- **Lambda**: Sin cambio (o menos si saltas duplicados)

**Ejemplo:** 1M mensajes con 10% duplicados
- Reads: 1M × $0.25 = $0.25
- Writes: 900K × $1.25 = $1.13
- **Total: $1.38** para garantizar idempotencia

---

## 🐛 Troubleshooting

### Error: "Cannot find module '@aws-lambda-powertools/idempotency'"

```bash
cd lambdas/consumer
npm install @aws-lambda-powertools/idempotency
npm run build
cd ../../infra
npx aws-cdk deploy SqsStack -c env=dev
```

### Duplicados no se detectan

1. Verifica que idempotencia está activada:
   ```bash
   aws lambda get-function-configuration \
     --function-name poc-api-wa-dev-sqs-consumer \
     --query 'Environment.Variables.ENABLE_IDEMPOTENCY'
   ```

2. Verifica que la tabla existe:
   ```bash
   aws dynamodb describe-table \
     --table-name poc-api-wa-dev-idempotency
   ```

3. Verifica logs:
   ```bash
   aws logs tail /aws/lambda/poc-api-wa-dev-sqs-consumer \
     --filter-pattern "IDEMPOTENCY"
   ```

### Todos los mensajes se marcan como duplicados

La clave de idempotencia puede ser incorrecta. Verifica:
```typescript
eventKeyJmesPath: 'messageId'  // Debe coincidir con estructura SQS
```

---

## 📚 Referencias

- [AWS Lambda Powertools - Idempotency](https://docs.powertools.aws.dev/lambda/typescript/latest/utilities/idempotency/)
- [DynamoDB TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- [SQS Message Attributes](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-metadata.html)
