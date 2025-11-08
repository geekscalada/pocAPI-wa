# 🎯 SQS en Acción - Guía Rápida

## 🚀 Scripts Disponibles

### 1️⃣ Monitor SQS (`./monitor-sqs.sh`)
Visualiza el estado de las colas en tiempo real

```bash
./monitor-sqs.sh us-east-1
```

**Opciones del menú:**
- 📊 **Ver estadísticas** → Mensajes disponibles, en proceso, retrasados
- 👀 **Peek mensajes** → Ver mensajes sin eliminarlos
- 🔄 **Monitoreo continuo** → Actualización cada 3 segundos
- 🗑️ **Purgar colas** → Limpiar todo
- 📤 **Enviar directo** → Mensaje directo a SQS (bypass SNS)
- 🔍 **Atributos detallados** → Configuración completa

### 2️⃣ Test de Comportamiento (`./test-sqs-behavior.sh`)
Pruebas interactivas para ver SQS en acción

```bash
# Primero obtén tu token
TOKEN=$(curl -s -X POST https://TU-API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# Ejecuta las pruebas
./test-sqs-behavior.sh https://TU-API $TOKEN
```

**Tests disponibles:**
1. 📤 **Envío Simple** - Ver flujo básico
2. 📦 **Batching** - 10 mensajes agrupados
3. 🔄 **Visibility Timeout** - Mensajes "bloqueados"
4. 💥 **DLQ Test** - Mensajes que fallan → DLQ
5. 🚀 **Carga Alta** - 50 mensajes paralelos
6. 📊 **Demo Completa** - Todos los escenarios

---

## 🎬 Demo Rápida - Ver SQS en Acción

### Setup Inicial (1 vez)
```bash
# 1. Obtener API URL
cd infra
API_URL=$(aws cloudformation describe-stacks \
  --stack-name TestingApiStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

echo "API URL: $API_URL"

# 2. Login y obtener token
TOKEN=$(curl -s -X POST "${API_URL}auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

echo "Token: ${TOKEN:0:30}..."

# 3. Guardar en variables de entorno
export API_URL
export TOKEN
```

### 🎯 Escenario 1: Ver Mensajes Fluyendo

**Terminal 1 - Monitor:**
```bash
cd /home/jose/pocAPI-wa/pocAPI-wa
./monitor-sqs.sh us-east-1
# Selecciona opción 4 (Monitoreo continuo)
```

**Terminal 2 - Enviar eventos:**
```bash
# Enviar 5 mensajes
for i in {1..5}; do
  curl -X POST "${API_URL}send" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"eventType\":\"TEST_$i\",\"data\":{\"index\":$i}}"
  echo ""
  sleep 1
done
```

**Terminal 3 - Ver logs del consumer:**
```bash
aws logs tail /aws/lambda/poc-api-wa-dev-sqs-consumer --follow --since 5m
```

**🔍 Qué observar:**
- Terminal 1: Verás mensajes aparecer y desaparecer de la cola
- Terminal 2: Cada envío exitoso a SNS
- Terminal 3: La lambda procesando en batches

---

### 🎯 Escenario 2: Batching en Acción

```bash
# Enviar 10 mensajes rápidamente
for i in {1..10}; do
  curl -s -X POST "${API_URL}send" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"eventType\":\"BATCH_$i\",\"data\":{\"index\":$i}}" > /dev/null &
done
wait

echo "✅ 10 mensajes enviados"
```

**🔍 Observa en los logs:**
```
🚀 [CONSUMER] Starting batch processing. Records: 5
```

La lambda procesa **5 mensajes juntos** (configurado en `batchSize=5`)

**Ventajas del batching:**
- ✅ Menos invocaciones lambda = menos costos
- ✅ Mejor throughput
- ✅ Overhead compartido entre mensajes

---

### 🎯 Escenario 3: Visibility Timeout

**Qué es:** Cuando una lambda toma un mensaje, SQS lo hace "invisible" temporalmente.

```bash
# Enviar mensaje
curl -X POST "${API_URL}send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"eventType":"VISIBILITY_TEST","data":{"test":true}}'

# Inmediatamente después, en el monitor:
./monitor-sqs.sh us-east-1
# Opción 1: Ver estadísticas
```

**Verás:**
```
📊 Main Queue:
   📬 Mensajes disponibles: 0        ← El mensaje ya no está visible
   🔒 Mensajes en procesamiento: 1   ← Está siendo procesado
   ⏰ Mensajes retrasados: 0
```

**Configuración actual:**
- `visibilityTimeout: 6 minutos` (cola)
- `lambda timeout: 5 minutos`

**¿Por qué 6 min > 5 min?**
- Lambda tiene 5 min para procesar
- Si falla/timeout, el mensaje vuelve visible después de 6 min
- Evita que otro consumer lo tome mientras se procesa

---

### 🎯 Escenario 4: Dead Letter Queue (DLQ)

**Objetivo:** Ver mensajes que fallan repetidamente → DLQ

```bash
# Enviar mensaje que fallará
curl -X POST "${API_URL}send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"eventType":"ERROR_TEST","forceError":true,"data":{"willFail":true}}'
```

**🔍 Qué sucede:**

1. **Intento 1** (t=0s):
   - Lambda intenta procesar
   - `forceError=true` → lanza excepción
   - SQS: `ApproximateReceiveCount = 1`

2. **Intento 2** (t=~30s):
   - Mensaje vuelve visible
   - Lambda lo intenta de nuevo
   - Falla otra vez
   - SQS: `ApproximateReceiveCount = 2`

3. **Intento 3** (t=~60s):
   - Última oportunidad
   - Falla de nuevo
   - SQS: `ApproximateReceiveCount = 3`

4. **💀 A la DLQ** (t=~90s):
   - `maxReceiveCount: 3` alcanzado
   - Mensaje movido automáticamente a DLQ
   - Ya no se reintenta más

**Verificar en DLQ:**
```bash
./monitor-sqs.sh us-east-1
# Opción 3: Peek mensajes (DLQ)
```

**Monitorear el proceso:**
```bash
aws logs tail /aws/lambda/poc-api-wa-dev-sqs-consumer --follow | grep -E "❌|ERROR|retry"
```

---

### 🎯 Escenario 5: Concurrencia y Throughput

```bash
# Enviar 50 mensajes
for i in {1..50}; do
  curl -s -X POST "${API_URL}send" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"eventType\":\"LOAD_$i\",\"data\":{\"index\":$i}}" > /dev/null &
done
wait
```

**Configuración:**
- `batchSize: 5` → cada lambda procesa hasta 5 mensajes
- `maxConcurrency: 5` → máximo 5 lambdas simultáneas
- Capacidad: **25 mensajes por wave**

**Cálculo:**
- 50 mensajes ÷ 25 capacidad = **2 waves**
- Wave 1: 25 mensajes procesados
- Wave 2: 25 mensajes restantes

**Ver en CloudWatch:**
```bash
aws cloudwatch get-metric-statistics \
  --namespace SQS-Consumer-POC \
  --metric-name BatchSize \
  --dimensions Name=LambdaFunction,Value=poc-api-wa-dev-sqs-consumer \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum
```

---

## 📊 Métricas Interesantes de SQS

### Ver en tiempo real:
```bash
# Mensajes en cola
watch -n 2 'aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name poc-api-wa-dev-main-queue --query QueueUrl --output text) \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
  --output json | jq ".Attributes"'
```

### Métricas del Consumer:
```bash
# Tasa de éxito
aws cloudwatch get-metric-statistics \
  --namespace SQS-Consumer-POC \
  --metric-name MessagesProcessedSuccess \
  --dimensions Name=LambdaFunction,Value=poc-api-wa-dev-sqs-consumer \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Tasa de errores
aws cloudwatch get-metric-statistics \
  --namespace SQS-Consumer-POC \
  --metric-name MessagesProcessedError \
  --dimensions Name=LambdaFunction,Value=poc-api-wa-dev-sqs-consumer \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Tiempo de procesamiento
aws cloudwatch get-metric-statistics \
  --namespace SQS-Consumer-POC \
  --metric-name BatchProcessingTime \
  --dimensions Name=LambdaFunction,Value=poc-api-wa-dev-sqs-consumer \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

---

## 🎓 Conceptos Clave de SQS

### 1. **Visibility Timeout**
```
Mensaje disponible → Lambda lo toma → Invisible (6min) → Lambda procesa → Eliminado
                                    ↓ (si falla/timeout)
                                    Visible de nuevo → Reintento
```

### 2. **Batching**
```
Sin batching:  1 mensaje = 1 lambda invocation (más caro)
Con batching:  5 mensajes = 1 lambda invocation (80% más barato)
```

### 3. **Dead Letter Queue**
```
Intento 1 → Falla → Intento 2 → Falla → Intento 3 → Falla → DLQ
(Evita loops infinitos de mensajes erróneos)
```

### 4. **Long Polling**
```
Short polling (0s):  Consulta inmediata, puede retornar vacío
Long polling (20s):  Espera hasta 20s por mensajes (reduce costos, mejor eficiencia)
```

### 5. **Message Retention**
```
Main Queue:  4 días (configurable 1-14 días)
DLQ:        14 días (máximo tiempo para analizar fallos)
```

---

## 🐛 Troubleshooting

### Mensajes no se procesan
```bash
# 1. Verificar event source mapping
aws lambda list-event-source-mappings \
  --function-name poc-api-wa-dev-sqs-consumer

# 2. Verificar permisos
aws iam get-role-policy \
  --role-name <consumer-lambda-role> \
  --policy-name <policy-name>

# 3. Ver errores en logs
aws logs tail /aws/lambda/poc-api-wa-dev-sqs-consumer \
  --since 30m \
  --filter-pattern "ERROR"
```

### Mensajes en DLQ
```bash
# Ver mensajes en DLQ
./monitor-sqs.sh us-east-1
# Opción 3: Peek DLQ

# Reenviar mensaje desde DLQ a main queue
aws sqs send-message \
  --queue-url $(aws sqs get-queue-url --queue-name poc-api-wa-dev-main-queue --query QueueUrl --output text) \
  --message-body "MENSAJE_DESDE_DLQ"
```

---

## 📚 Recursos Adicionales

- [SQS Configuration Guide](./SQS-Configuration-Guide.md)
- [SQS Testing Guide](./SQS-Testing-Guide.md)
- [Cold Starts Analysis](./Cold-Starts-Reality-Check.md)
- [Batching vs Individual Guide](./Batching-vs-Individual-Guide.md)
