# 🚀 Guía para Probar el Sistema SQS/SNS con HTTP

## 📋 Prerequisitos

1. **Stacks desplegados:**
   - `SnsTestStack` (Topic SNS)
   - `SqsStack` (Cola SQS + Consumer Lambda)
   - `LambdaStack-prueba` (Publisher Lambda)
   - `TestingApiStack` (API Gateway + Auth)

2. **Usuario creado en DynamoDB:**
   ```bash
   aws dynamodb put-item \
     --table-name poc-api-wa-dev-auth-users \
     --item '{"username":{"S":"admin"},"password":{"S":"admin123"}}'
   ```

3. **Secreto JWT configurado:**
   - Debe existir `Secret-pipeline` en Secrets Manager
   - Debe contener la key `jwtSecret` con un valor (ej: "mi-secreto-jwt-super-seguro")

---

## 🔄 Flujo Completo

```
1. POST /auth/login → Obtener JWT
2. POST /send (con JWT) → Enviar evento a SNS
3. SNS → Enruta a SQS
4. Lambda Consumer → Procesa automáticamente
```

---

## 📝 Paso 1: Obtener la URL del API

```bash
cd infra
aws cloudformation describe-stacks \
  --stack-name TestingApiStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text
```

O desde CDK:
```bash
npx aws-cdk deploy TestingApiStack -c env=dev --outputs-file outputs.json
cat outputs.json
```

**Guarda la URL del API**, ejemplo: `https://abc123.execute-api.us-east-1.amazonaws.com/prod/`

---

## 🔑 Paso 2: Login y Obtener JWT

```bash
curl -X POST https://TU-API-URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**Respuesta esperada:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Guarda el token** para usarlo en las siguientes peticiones.

---

## 📤 Paso 3: Enviar Evento a SNS

### Evento Básico

```bash
curl -X POST https://TU-API-URL/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU-TOKEN-JWT" \
  -d '{
    "eventType": "USER_CREATED",
    "id": "user-123",
    "data": {
      "name": "John Doe",
      "email": "john@example.com"
    }
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "messageId": "12345678-1234-1234-1234-123456789012",
  "payload": {
    "event": "USER_CREATED",
    "id": "user-123",
    "data": { "name": "John Doe", "email": "john@example.com" },
    "source": "testing-api",
    "forceError": false
  },
  "message": "Event \"USER_CREATED\" sent successfully to SNS"
}
```

### Evento que Forzará Error (Para Probar DLQ)

```bash
curl -X POST https://TU-API-URL/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU-TOKEN-JWT" \
  -d '{
    "eventType": "ERROR_TEST",
    "forceError": true,
    "data": {
      "reason": "Testing DLQ behavior"
    }
  }'
```

Este mensaje fallará 3 veces y terminará en la Dead Letter Queue.

---

## 📊 Paso 4: Verificar el Procesamiento

### Ver Logs del Consumer Lambda

```bash
# Obtener el nombre de la lambda
aws lambda list-functions \
  --query 'Functions[?contains(FunctionName, `consumer`)].FunctionName' \
  --output text

# Ver logs recientes (últimos 10 minutos)
aws logs tail /aws/lambda/poc-api-wa-dev-sqs-consumer \
  --follow \
  --since 10m
```

### Verificar Mensajes en la Cola

```bash
# Cola principal
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name poc-api-wa-dev-main-queue --query 'QueueUrl' --output text) \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible

# Dead Letter Queue
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name poc-api-wa-dev-dlq --query 'QueueUrl' --output text) \
  --attribute-names ApproximateNumberOfMessages
```

### Ver Métricas en CloudWatch

```bash
# Abrir CloudWatch en browser
aws cloudwatch get-metric-statistics \
  --namespace SQS-Consumer-POC \
  --metric-name MessagesProcessedSuccess \
  --dimensions Name=LambdaFunction,Value=poc-api-wa-dev-sqs-consumer \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Sum
```

---

## 🧪 Ejemplos de Pruebas

### Test 1: Evento Simple
```json
{
  "eventType": "TEST_EVENT",
  "data": { "test": true }
}
```

### Test 2: Usuario Creado
```json
{
  "eventType": "USER_CREATED",
  "id": "user-456",
  "data": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "developer"
  }
}
```

### Test 3: Orden Colocada
```json
{
  "eventType": "ORDER_PLACED",
  "id": "order-789",
  "data": {
    "product": "Widget",
    "quantity": 5,
    "total": 99.99
  }
}
```

### Test 4: Forzar Error (para DLQ)
```json
{
  "eventType": "ERROR_TEST",
  "forceError": true,
  "data": {
    "testCase": "DLQ behavior"
  }
}
```

---

## 🐛 Troubleshooting

### Error 401: Unauthorized
- Verifica que el token JWT sea válido
- El token expira en 1 hora, obtén uno nuevo

### Error 403: Forbidden
- Verifica que el header sea exactamente: `Authorization: Bearer TOKEN`
- Sin comillas adicionales en el token

### Error 500: Internal Server Error
- Revisa los logs de la lambda publisher:
  ```bash
  aws logs tail /aws/lambda/poc-api-wa-dev-publisher --follow
  ```

### Mensajes no se procesan
1. Verifica que el consumer lambda tenga permisos SQS
2. Revisa los logs del consumer
3. Verifica que la cola tenga el event source mapping configurado:
   ```bash
   aws lambda list-event-source-mappings \
     --function-name poc-api-wa-dev-sqs-consumer
   ```

### JWT no funciona
1. Verifica que el secreto exista:
   ```bash
   aws secretsmanager get-secret-value --secret-id Secret-pipeline
   ```
2. Debe contener `{"jwtSecret": "algún-valor"}`

---

## 📈 Monitoreo Recomendado

1. **CloudWatch Logs Insights** - Query ejemplo:
   ```
   fields @timestamp, @message
   | filter @message like /✅|❌/
   | sort @timestamp desc
   | limit 20
   ```

2. **CloudWatch Métricas**:
   - `SQS-Consumer-POC/MessagesProcessedSuccess`
   - `SQS-Consumer-POC/MessagesProcessedError`
   - `SQS-Consumer-POC/BatchProcessingTime`
   - `SQS-Consumer-POC/ColdStarts`

3. **X-Ray** (si está habilitado):
   - Ver el trace completo: API → SNS → SQS → Lambda

---

## 🎯 Resultado Esperado

Cuando todo funciona correctamente:

1. ✅ Login retorna un JWT válido
2. ✅ Enviar evento retorna `messageId` de SNS
3. ✅ Consumer procesa el mensaje automáticamente (ver logs)
4. ✅ Logs del consumer muestran: `✅ [PROCESSOR] Successfully processed...`
5. ✅ Métricas en CloudWatch muestran procesamiento exitoso

---

## 📚 Recursos Adicionales

- [SQS Configuration Guide](./SQS-Configuration-Guide.md)
- [SQS Testing Guide](./SQS-Testing-Guide.md)
- [JWT Secret Configuration](./docs/JWT-Secret-Configuration.md)
