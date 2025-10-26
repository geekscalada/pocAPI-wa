# 🔄 Batching vs Individual Processing - Comparación Práctica

## 🎯 Configuraciones para Experimentar

### **📦 Configuración Actual (Batching Habilitado)**
```typescript
// En sqs-stack.ts - Event Source Mapping
const sqsEventSource = new lambdaEventSources.SqsEventSource(this.mainQueue, {
  batchSize: 5, // 👈 BATCHING: Hasta 5 mensajes por invocación
  maxBatchingWindow: Duration.seconds(10), // Espera max 10s para llenar batch
  maxConcurrency: 2, // Máximo 2 lambdas ejecutando simultáneamente
  reportBatchItemFailures: true, // 🔑 Solo reintenta mensajes fallidos
});
```

### **📋 Configuración Individual (Sin Batching)**
```typescript
// Para comparar, cambiarías a:
const sqsEventSource = new lambdaEventSources.SqsEventSource(this.mainQueue, {
  batchSize: 1, // 👈 INDIVIDUAL: 1 mensaje = 1 invocación
  maxBatchingWindow: Duration.seconds(0), // Sin espera
  maxConcurrency: 10, // Más concurrencia ya que cada invocación es pequeña
  reportBatchItemFailures: false, // No necesario con batchSize=1
});
```

## 📊 Comparación Práctica

### **Escenario: Procesar 100 mensajes**

#### **🚀 Con Batching (batchSize=5)**
```
Timeline:
T+0s:  [Msg1,Msg2,Msg3,Msg4,Msg5] → Lambda1 (500ms cold start + 250ms process)
T+0s:  [Msg6,Msg7,Msg8,Msg9,Msg10] → Lambda2 (500ms cold start + 250ms process)
T+0.75s: [Msg11-15] → Lambda1 (ya warm: 250ms process)
T+0.75s: [Msg16-20] → Lambda2 (ya warm: 250ms process)
...

📊 Resultados:
- Invocaciones Lambda: 20 (100 mensajes ÷ 5)
- Tiempo total: ~10 segundos
- Cold starts: 2 (solo las primeras)
- Costo Lambda: 20 invocaciones
```

#### **⚡ Sin Batching (batchSize=1)**
```
Timeline:
T+0s: Msg1 → Lambda1 (500ms cold start + 50ms process)
T+0s: Msg2 → Lambda2 (500ms cold start + 50ms process)
T+0s: Msg3 → Lambda3 (500ms cold start + 50ms process)
...hasta maxConcurrency=10
T+0.55s: Msg11 → Lambda1 (ya warm: 50ms process)
...

📊 Resultados:
- Invocaciones Lambda: 100 (1 mensaje cada una)
- Tiempo total: ~6 segundos (más rápido)
- Cold starts: 10 (una por lambda concurrente)
- Costo Lambda: 100 invocaciones (5x más caro)
```

## 🚨 Manejo de Errores - Comportamiento Real

### **🔄 Con Batching + reportBatchItemFailures: true**

```typescript
// Batch procesado: [Msg1✅, Msg2❌, Msg3✅, Msg4❌, Msg5✅]
return {
  batchItemFailures: [
    { itemIdentifier: "msg2-id" },
    { itemIdentifier: "msg4-id" }
  ]
};

// Resultado:
// ✅ Msg1, Msg3, Msg5 → Procesados exitosamente, NO se reintentan
// ❌ Msg2, Msg4 → Vuelven a la cola principal para reintento
// 🎯 Eficiencia: Solo se reintenta lo que falló
```

### **⚠️ Con Batching + reportBatchItemFailures: false (comportamiento legacy)**

```typescript
// Batch procesado: [Msg1✅, Msg2❌, Msg3✅, Msg4❌, Msg5✅]
throw new Error("Batch failed");

// Resultado:
// ❌ TODO EL BATCH vuelve a la cola
// 💸 Ineficiencia: Msg1, Msg3, Msg5 se procesan de nuevo innecesariamente
```

### **🎯 Sin Batching (Individual)**

```typescript
// Cada mensaje es una invocación separada
// Msg1 → Procesa → ✅ Éxito
// Msg2 → Procesa → ❌ Falla → Solo Msg2 se reintenta
// Msg3 → Procesa → ✅ Éxito
// Msg4 → Procesa → ❌ Falla → Solo Msg4 se reintenta
// Msg5 → Procesa → ✅ Éxito

// 🎯 Granularidad perfecta, pero más costoso
```

## 🧪 Experimento Práctico

### **1. Configurar diferentes escenarios:**

```typescript
// Escenario A: Batching optimizado
batchSize: 5,
maxBatchingWindow: Duration.seconds(5),
reportBatchItemFailures: true

// Escenario B: Individual processing  
batchSize: 1,
maxBatchingWindow: Duration.seconds(0),
reportBatchItemFailures: false

// Escenario C: Batching grande para throughput
batchSize: 10,
maxBatchingWindow: Duration.seconds(20),
reportBatchItemFailures: true
```

### **2. Enviar mensajes de prueba:**

```bash
# Enviar 20 mensajes rápidamente
for i in {1..20}; do
  curl -X POST https://YOUR-API/send -H "Content-Type: application/json" \
    -d "{\"eventType\":\"BATCH_TEST\",\"id\":\"msg-$i\",\"data\":{\"index\":$i}}" &
done

# Enviar algunos mensajes que fallarán (para testing de reintentos)
for i in {21..25}; do
  curl -X POST https://YOUR-API/send -H "Content-Type: application/json" \
    -d "{\"eventType\":\"ERROR_TEST\",\"id\":\"error-$i\",\"forceError\":true}" &
done
```

### **3. Observar en CloudWatch:**

```bash
# Métricas a comparar:
- Duration de Lambda (tiempo por invocación)
- Invocations (número total de invocaciones)
- Errors (reintentos necesarios)
- Throttles (si hay limitaciones de concurrencia)
```

## 🎯 Decisión: ¿Cuándo usar cada enfoque?

### **✅ Usar BATCHING cuando:**
- **Alto volumen** de mensajes (>1000/min)
- **Costo** es una preocupación importante
- **Latencia individual** no es crítica (toleras 5-20s de delay)
- **Procesamiento relacionado** (transacciones, bulk updates)
- **Recursos compartidos** (conexiones DB, APIs rate-limited)

```typescript
// Ejemplo: Procesamiento de logs, ETL, bulk updates
batchSize: 10,
maxBatchingWindow: Duration.seconds(20),
```

### **✅ Usar INDIVIDUAL cuando:**
- **Baja latencia** es crítica (<1s response time)
- **Mensajes independientes** sin relación entre sí
- **Error isolation** es prioritario
- **Procesamiento simple** y rápido (<100ms per message)
- **Real-time** requirements

```typescript
// Ejemplo: Notificaciones push, validaciones críticas
batchSize: 1,
maxBatchingWindow: Duration.seconds(0),
```

### **✅ Híbrido (Batching con partial failures):**
```typescript
// Balance perfecto para la mayoría de casos
batchSize: 5, // Balance costo/latencia
maxBatchingWindow: Duration.seconds(10), // No más de 10s delay
reportBatchItemFailures: true, // Solo reintenta fallos
```

## 📊 Fórmulas de Decisión

### **💰 Cálculo de Costo:**
```
Individual: Messages × $0.0000002 × (1 + RetryRate)
Batching: (Messages ÷ BatchSize) × $0.0000002 × (1 + BatchRetryRate)

Ejemplo 10,000 mensajes/día:
Individual: 10,000 × $0.0000002 = $0.002/día
Batching (5): 2,000 × $0.0000002 = $0.0004/día
Ahorro: 80%
```

### **⏱️ Cálculo de Latencia:**
```
Individual: Processing Time + Cold Start (if any)
Batching: Max Batching Window + Processing Time + Cold Start (if any)

Ejemplo:
Individual: 0ms + 50ms = 50ms
Batching: 10,000ms + 250ms = 10,250ms (pero procesa 5x más)
```

---

## 🔧 Para tu implementación actual:

Tu configuración con `batchSize: 5` y `reportBatchItemFailures: true` es **excelente** porque:
- ✅ Reduce costos 80% vs individual
- ✅ Solo reintenta mensajes fallidos  
- ✅ Balance perfecto latencia/throughput
- ✅ Facilita debugging con logs de batch

¿Te gustaría que creemos diferentes configuraciones para experimentar con estos escenarios?