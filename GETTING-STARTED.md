# 🚀 Getting Started - POC JWT Auth API

## 📋 Pre-requisitos

✅ Stack desplegado exitosamente
✅ AWS CLI configurado con las credenciales correctas

## 1️⃣ Obtener URL de la API

```bash
# Obtener la URL de la API desde los outputs de CloudFormation
aws cloudformation describe-stacks \
  --stack-name poc-api-wa-dev-testing-api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text

# Guardar en variable (Linux/Mac)
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name poc-api-wa-dev-testing-api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

echo "API URL: $API_URL"
```

## 2️⃣ Seedear Usuario de Prueba en DynamoDB

```bash
# Obtener nombre de la tabla
TABLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name poc-api-wa-dev-testing-api \
  --query 'Stacks[0].Outputs[?contains(OutputValue, `auth-users`)].OutputValue' \
  --output text | grep -o 'poc-api-wa-dev-auth-users')

echo "Tabla: $TABLE_NAME"

# Crear usuario admin/admin123
aws dynamodb put-item \
  --table-name $TABLE_NAME \
  --item '{
    "username": {"S": "admin"},
    "password": {"S": "admin123"}
  }'

echo "✅ Usuario creado: admin / admin123"
```

## 3️⃣ Probar Login (Obtener Token JWT)

```bash
# Login para obtener token
curl -X POST "${API_URL}auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' | jq

# Guardar token en variable
TOKEN=$(curl -s -X POST "${API_URL}auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' | jq -r '.token')

echo "Token JWT: $TOKEN"
```

**Respuesta esperada:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 4️⃣ Probar Endpoints Protegidos

### A) Endpoint GET / (Público - No requiere auth)

```bash
curl "${API_URL}" | jq
```

**Respuesta esperada:**
```json
{
  "api": "poc-api-wa-dev-testing-api",
  "description": "Testing API for SQS Consumer POC",
  "endpoints": {
    "POST /send": "Send test events",
    "POST /send/user-created": "Send USER_CREATED event",
    ...
  }
}
```

### B) Endpoint POST /send (PROTEGIDO - Requiere JWT)

```bash
# Enviar evento de prueba CON autenticación
curl -X POST "${API_URL}send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "TEST_EVENT",
    "data": {
      "message": "Hello from authenticated API!",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }' | jq
```

**Respuesta esperada:**
```json
{
  "success": true,
  "messageId": "abc123...",
  "payload": {
    "event": "TEST_EVENT",
    "id": "test-1699...",
    "data": {
      "message": "Hello from authenticated API!",
      "timestamp": "2025-11-04T00:15:30Z"
    },
    "source": "testing-api"
  },
  "message": "Event \"TEST_EVENT\" sent successfully"
}
```

### C) Endpoint POST /send/user-created (PROTEGIDO)

```bash
curl -X POST "${API_URL}send/user-created" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "José García",
    "email": "jose@example.com"
  }' | jq
```

### D) Endpoint POST /send/error-test (PROTEGIDO - Para testing DLQ)

```bash
curl -X POST "${API_URL}send/error-test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

## 5️⃣ Probar Errores de Autenticación

### Sin Token (Debe fallar con 401)

```bash
curl -X POST "${API_URL}send" \
  -H "Content-Type: application/json" \
  -d '{"eventType": "TEST"}' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Respuesta esperada:** `{"message":"Unauthorized"}` con status 401

### Token Inválido (Debe fallar con 401)

```bash
curl -X POST "${API_URL}send" \
  -H "Authorization: Bearer invalid-token-here" \
  -H "Content-Type: application/json" \
  -d '{"eventType": "TEST"}' \
  -w "\nHTTP Status: %{http_code}\n"
```

### Credenciales Incorrectas en Login (Debe fallar con 401)

```bash
curl -X POST "${API_URL}auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "wrongpassword"
  }' | jq
```

**Respuesta esperada:**
```json
{
  "error": "invalid credentials"
}
```

## 6️⃣ Verificar Secreto JWT en Secrets Manager

```bash
# Ver el secreto completo (solo si tienes permisos)
aws secretsmanager get-secret-value \
  --secret-id Secret-pipeline \
  --query 'SecretString' \
  --output text | jq

# Debería mostrar algo como:
# {
#   "gitHubToken": "ghp_...",
#   "jwtSecret": "jhsdlaJHASDFB__871827623g__l132"
# }
```

## 7️⃣ Monitorizar Logs de las Lambdas

### Logs de Login Lambda

```bash
aws logs tail /aws/lambda/poc-api-wa-dev-auth-login --follow
```

### Logs de Authorizer Lambda

```bash
aws logs tail /aws/lambda/poc-api-wa-dev-auth-authorizer --follow
```

### Logs de Test Controller Lambda

```bash
aws logs tail /aws/lambda/poc-api-wa-dev-test-controller --follow
```

## 8️⃣ Verificar Cola SQS (Si aplicable)

```bash
# Listar colas
aws sqs list-queues | jq

# Ver mensajes en la cola (aproximado)
QUEUE_URL=$(aws sqs list-queues --queue-name-prefix poc-api-wa-dev | jq -r '.QueueUrls[0]')
aws sqs get-queue-attributes \
  --queue-url $QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages
```

## 🎯 Script Completo de Testing

Guarda esto como `test-api.sh`:

```bash
#!/bin/bash
set -e

echo "🔍 Obteniendo configuración..."
API_URL=$(aws cloudformation describe-stacks \
  --stack-name poc-api-wa-dev-testing-api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

echo "📍 API URL: $API_URL"
echo ""

echo "🔐 Haciendo login..."
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

if [ "$TOKEN" = "null" ]; then
  echo "❌ Error en login:"
  echo $LOGIN_RESPONSE | jq
  exit 1
fi

echo "✅ Token obtenido: ${TOKEN:0:50}..."
echo ""

echo "📤 Enviando evento de prueba..."
curl -s -X POST "${API_URL}send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "POC_TEST",
    "data": {
      "message": "Testing POC API",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }' | jq

echo ""
echo "✅ Test completado!"
```

Hazlo ejecutable y corre:
```bash
chmod +x test-api.sh
./test-api.sh
```

## 🧹 Cleanup (Cuando termines de probar)

```bash
# Eliminar usuario de prueba
aws dynamodb delete-item \
  --table-name poc-api-wa-dev-auth-users \
  --key '{"username": {"S": "admin"}}'

# O destruir todo el stack
cd infra
npx cdk destroy --all --context env=dev
```

## 📚 Recursos Adicionales

- **Documentación**: Ver `README.md`, `QUICK-START.md`, `REFACTORING-SUMMARY.md`
- **Logs CloudWatch**: AWS Console → CloudWatch → Log Groups
- **API Gateway**: AWS Console → API Gateway → poc-api-wa-dev-testing-api
- **DynamoDB**: AWS Console → DynamoDB → Tables → poc-api-wa-dev-auth-users
- **Secrets Manager**: AWS Console → Secrets Manager → Secret-pipeline

---

⚠️ **Nota de Seguridad POC**: 
- Las contraseñas están en texto plano en DynamoDB (solo para POC)
- En producción usar bcrypt/argon2 para hashear passwords
- El token JWT expira en 1 hora
