# ⚡ Testing Rápido: FIFO + batchItemFailures

## 📋 Procedimiento con Postman (5 minutos)

### 1️⃣ Obtener API URL

```bash
aws cloudformation describe-stacks \
  --stack-name pocAPI-wa-dev-testing-api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text \
  --profile your-profile
```

Resultado: `https://abc123.execute-api.us-east-1.amazonaws.com/dev`

---

### 2️⃣ Enviar 3 Mensajes (Postman)

#### 🟢 A1 - Mensaje Normal

```json
POST {{API_URL}}/publish
Content-Type: application/json

{
  "eventType": "FIFO_TEST",
  "id": "A1",
  "messageGroupId": "test-group-A"
}
```

⏱️ Esperar 2 segundos

---

#### 🔴 A2 - Fallo Automático

```json
POST {{API_URL}}/publish
Content-Type: application/json

{
  "eventType": "FIFO_TEST",
  "id": "A2",
  "messageGroupId": "test-group-A"
}
```

> Consumer fallará automáticamente (lógica: `id === "A2"`)

⏱️ Esperar 2 segundos

---

#### 🟡 A3 - Verifica Comportamiento

```json
POST {{API_URL}}/publish
Content-Type: application/json

{
  "eventType": "FIFO_TEST",
  "id": "A3",
  "messageGroupId": "test-group-A"
}
```

---

### 3️⃣ Ver Logs

```bash
aws logs tail /aws/lambda/pocAPI-wa-dev-consumer --follow --profile your-profile
```

**Busca:**
```
✅ [SUCCESS] ID: A1
❌ Forzando fallo de mensaje A2
⚠️ Procesando A3 - NO debería procesarse si A2 falló
```

---

## 📊 ¿Qué Validas?

Si ves que **A3 se procesa**, confirmas:
- `batchItemFailures` reporta solo A2
- **SQS elimina A3** (éxito implícito)
- ❌ **Orden FIFO se rompe**

---

## ✅ Solución Correcta

Reportar **A2 y todos los posteriores**:

```typescript
// En consumer Lambda
const failedIndex = results.findIndex(r => r.status === 'rejected');
return {
  batchItemFailures: event.Records
    .slice(failedIndex)  // A2, A3
    .map(r => ({ itemIdentifier: r.messageId }))
};
```

---

## 📚 Docs Completas

- `FIFO-BATCH-TESTING-GUIDE.md` - Guía detallada
- `docs/FIFO-Batch-Test-Design.md` - Diseño conceptual
- `test-fifo-batch-behavior.sh` - Script automatizado
