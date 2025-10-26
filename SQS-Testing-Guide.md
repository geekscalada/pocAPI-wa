# 🧪 Guía Completa de Testing - Patrón Producer → SNS → SQS → Consumer

## 🎯 ¿Qué hemos implementado?

### **Flujo Completo:**
```
Testing API → SNS Topic → SQS Queue → Consumer Lambda
     ↓              ↓          ↓           ↓
  HTTP POST    Pub/Sub     Queue      Process + Log
                             ↓           ↓
                         DLQ (errors)  CloudWatch
```

### **Componentes:**
1. **🚀 Testing API** - Endpoints HTTP para inyectar eventos fácilmente
2. **⚡ Consumer Lambda** - Procesa mensajes con logging completo
3. **📊 Observabilidad** - CloudWatch Logs + Métricas personalizadas
4. **🚨 Error Simulation** - Mecanismos para probar fallos y DLQ

---

## 🚀 Despliegue

### **1. Build de las Lambdas**
```bash
# Consumer Lambda
cd lambdas/consumer
npm install
npm run build-esbuild

# Publisher Lambda (si no está hecho)
cd ../publisher
npm install
npm run build-esbuild

# Volver a infra
cd ../../infra
```

### **2. Deploy del Stack Completo**
```bash
# Desde /infra
npm install
npx cdk synth --context env=dev --all
npx cdk deploy --all --context env=dev
```

### **3. Obtener las URLs de Testing**
Después del deploy, busca en los outputs:
- `TestingApiStack.ApiUrl` - URL base de la API
- Endpoints disponibles en `TestingApiStack.TestingEndpoints`

---

## 🧪 Testing del Flujo Completo

### **1. 📡 Enviar Eventos de Prueba**

#### **A. Evento Básico de Test**
```bash
curl -X POST https://YOUR-API-ID.execute-api.region.amazonaws.com/prod/send \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "TEST_EVENT",
    "id": "test-123",
    "data": { "message": "Hello from testing API" }
  }'
```

#### **B. Evento USER_CREATED**
```bash
curl -X POST https://YOUR-API-ID.execute-api.region.amazonaws.com/prod/send/user-created \
  -H "Content-Type: application/json" \
  -d '{
    "id": "user-456",
    "name": "John Doe",
    "email": "john@example.com"
  }'
```

#### **C. Evento que Forzará Error (para testing DLQ)**
```bash
curl -X POST https://YOUR-API-ID.execute-api.region.amazonaws.com/prod/send/error-test \
  -H "Content-Type: application/json" \
  -d '{}'
```

### **2. 👀 Verificar Procesamiento**

#### **A. CloudWatch Logs**
1. Ve a **AWS Console → CloudWatch → Log Groups**
2. Busca `/aws/lambda/poc-api-wa-dev-sqs-consumer`
3. Verás logs detallados como:
```
🚀 [CONSUMER] Starting batch processing. Records: 1
🔍 [PROCESSOR] Processing message abc-123-def
📝 [PROCESSOR] Message body: {"event":"TEST_EVENT","id":"test-123"...}
🎯 [PROCESSOR] Parsed payload: {"event":"TEST_EVENT","id":"test-123"...}
🧪 [TEST_EVENT] Processing test event for ID: test-123
✅ [PROCESSOR] Successfully processed TEST_EVENT for ID: test-123
📊 [CONSUMER] Batch completed - Success: 1, Errors: 0, Time: 1234ms
```

#### **B. SQS Console**
1. **AWS Console → SQS**
2. Busca colas:
   - `poc-api-wa-dev-main-queue` (procesamiento normal)
   - `poc-api-wa-dev-dlq` (mensajes fallidos)
3. **"Send and receive messages" → "Poll for messages"**

#### **C. CloudWatch Metrics**
1. **AWS Console → CloudWatch → Metrics**
2. **Custom Namespaces → "SQS-Consumer-POC"**
3. Métricas disponibles:
   - `MessagesProcessedSuccess` - Mensajes procesados exitosamente
   - `MessagesProcessedError` - Mensajes que fallaron
   - `BatchProcessingTime` - Tiempo de procesamiento por batch
   - `BatchSize` - Tamaño de los batches procesados

---

## 🚨 Testing de Errores y DLQ

### **1. Simular Errores Controlados**

#### **A. Error por Mensaje Específico**
```bash
curl -X POST https://YOUR-API-ID.execute-api.region.amazonaws.com/prod/send \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "TEST_EVENT",
    "id": "error-test-123",
    "forceError": true
  }'
```

#### **B. Error Global (Variable de Entorno)**
Actualizar la lambda consumer:
```bash
# En AWS Console → Lambda → poc-api-wa-dev-sqs-consumer → Configuration → Environment variables
FORCE_ERROR = true
ERROR_RATE = 50  # 50% de mensajes fallarán aleatoriamente
```

### **2. Observar Comportamiento de Reintentos**

#### **Flujo esperado:**
1. **Intento 1**: Mensaje falla → vuelve a la cola principal
2. **Intento 2**: Mensaje falla → vuelve a la cola principal  
3. **Intento 3**: Mensaje falla → **VA A DLQ**

#### **Verificar en CloudWatch Logs:**
```
❌ [PROCESSOR] Error processing message abc-123: Forced error for testing
⚠️ [CONSUMER] 1 messages will be retried by SQS
```

#### **Verificar en SQS Console:**
- **Main Queue**: `ApproximateReceiveCount` incrementa con cada intento
- **DLQ**: Después del 3er intento, mensaje aparece aquí

### **3. Métricas de Error**
En CloudWatch verás:
- `MessagesProcessedError` aumenta
- Puedes crear alarmas cuando `MessagesProcessedError > 0`

---

## 📊 Observabilidad Avanzada

### **1. Dashboard Personalizado**
Crear en CloudWatch:
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["SQS-Consumer-POC", "MessagesProcessedSuccess"],
          [".", "MessagesProcessedError"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "us-east-1",
        "title": "Message Processing"
      }
    }
  ]
}
```

### **2. Alarmas Críticas**
```bash
# Crear alarma para DLQ
aws cloudwatch put-metric-alarm \
  --alarm-name "SQS-Messages-In-DLQ" \
  --alarm-description "Messages stuck in Dead Letter Queue" \
  --metric-name ApproximateNumberOfVisibleMessages \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=QueueName,Value=poc-api-wa-dev-dlq
```

### **3. Logs Estructurados**
Los logs incluyen:
- **Event correlation**: Cada mensaje tiene un ID único
- **Processing time**: Tiempo de procesamiento por mensaje
- **Error context**: Stack traces completos
- **Batch information**: Tamaño y rendimiento de batches

---

## 🎛️ Configuración de Testing

### **Variables de Entorno del Consumer**
```bash
FORCE_ERROR=false          # true para forzar todos los errores
ERROR_RATE=0              # 0-100, porcentaje de errores aleatorios  
PROCESSING_DELAY=1000     # ms de delay artificial
LOG_LEVEL=INFO            # Nivel de logging
```

### **Configuraciones SQS**
```typescript
// En sqs-stack.ts
visibilityTimeout: Duration.minutes(6)  // Debe ser > lambda timeout
maxReceiveCount: 3                      // Intentos antes de DLQ
batchSize: 5                           // Mensajes por invocación
maxConcurrency: 2                      // Lambdas simultáneas
```

---

## 🐛 Troubleshooting

### **❌ Mensajes no llegan al Consumer**
1. Verificar **SQS Event Source Mapping** está activo
2. Comprobar **IAM permissions** del consumer
3. Revisar **visibility timeout** vs lambda timeout

### **❌ Errores no van a DLQ**
1. Verificar `maxReceiveCount = 3` en la cola principal
2. Comprobar que DLQ está configurada correctamente
3. Revisar logs para confirmar que errores están siendo thrown

### **❌ No aparecen métricas personalizadas**
1. Verificar **IAM permissions** para `cloudwatch:PutMetricData`
2. Comprobar que métricas se envían sin error en logs
3. Esperar 5-10 minutos para que aparezcan en CloudWatch

---

## 🎯 Casos de Uso de Testing

### **1. Load Testing**
Enviar múltiples mensajes rápidamente:
```bash
for i in {1..10}; do
  curl -X POST https://YOUR-API/send -H "Content-Type: application/json" \
    -d "{\"eventType\":\"LOAD_TEST\",\"id\":\"load-$i\"}" &
done
```

### **2. Error Rate Testing**
Configurar `ERROR_RATE=30` y enviar mensajes para ver distribución

### **3. Batch Processing Testing**
Enviar muchos mensajes seguidos para ver cómo se agrupan en batches

### **4. DLQ Recovery Testing**
1. Forzar errores → mensajes van a DLQ
2. Corregir configuración (FORCE_ERROR=false)  
3. "Redrive" mensajes de DLQ a cola principal

---

¡Con esta guía tienes todo lo necesario para entender completamente cómo funciona el patrón Producer → SNS → SQS → Consumer y cómo AWS maneja errores, reintentos y observabilidad! 🚀