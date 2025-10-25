# 🚀 SQS Stack - Guía de Configuración y Experimentación

## 📋 Resumen de Implementación

He implementado un **SqsStack completo** que incluye:

### ✅ **Componentes Implementados:**
- **Cola Principal SQS** - Para procesar mensajes del SNS
- **Dead Letter Queue (DLQ)** - Para mensajes fallidos
- **Suscripción SNS -> SQS** - Conecta automáticamente el topic existente
- **Outputs** - ARNs y URLs exportados para otros stacks

## 🎛️ Configuraciones Disponibles para Experimentar

### 1. **⏱️ Configuraciones de Tiempo**

```typescript
// En el constructor de la cola principal:
visibilityTimeout: Duration.minutes(6), // Tiempo para procesar mensaje
retentionPeriod: Duration.days(4),      // Cuánto tiempo mantener mensajes  
receiveMessageWaitTime: Duration.seconds(20), // Long polling (recomendado >0)
```

**Valores recomendados para experimentar:**
- `visibilityTimeout`: 30s, 1m, 5m, 15m (debe ser > timeout de Lambda consumer)
- `retentionPeriod`: 1 día (testing), 4 días (desarrollo), 14 días (producción)
- `receiveMessageWaitTime`: 0 (short polling), 10s, 20s (long polling recomendado)

### 2. **🔄 Gestión de Errores y Reintentos**

```typescript
deadLetterQueue: {
  queue: this.deadLetterQueue,
  maxReceiveCount: 3, // Intentos antes de ir a DLQ
}
```

**Experimentar con:**
- `maxReceiveCount`: 1 (fail fast), 3 (recomendado), 5 (tolerante), 10+ (muy tolerante)

### 3. **🔒 Encriptación y Seguridad**

```typescript
// Opciones disponibles:
encryption: sqs.QueueEncryption.UNENCRYPTED,   // Sin encriptación (solo testing)
encryption: sqs.QueueEncryption.SQS_MANAGED,   // Encriptación básica AWS
encryption: sqs.QueueEncryption.KMS_MANAGED,   // Encriptación avanzada (actual)
```

### 4. **🚦 Colas FIFO vs Standard**

**Actualmente:** Cola Standard (descomentrar para FIFO)

```typescript
// Para habilitar FIFO (descomentrar estas líneas):
fifo: true,
contentBasedDeduplication: true,
deduplicationScope: sqs.DeduplicationScope.MESSAGE_GROUP,
fifoThroughputLimit: sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
```

**Cuándo usar cada tipo:**
- **Standard**: Mayor throughput, order no garantizado (recomendado para empezar)
- **FIFO**: Orden garantizado, menor throughput, útil para procesos secuenciales

### 5. **🎯 Filtros de Mensajes SNS**

```typescript
// En la suscripción (actualmente comentado):
filterPolicy: {
  eventType: sns.SubscriptionFilter.stringFilter({
    allowlist: ['USER_CREATED', 'USER_UPDATED'],
  }),
  priority: sns.SubscriptionFilter.numericFilter({
    between: { start: 1, stop: 100 },
  })
}
```

**Para experimentar:** Descomentar y modificar según tus tipos de eventos.

### 6. **📝 Formato de Mensaje**

```typescript
rawMessageDelivery: true, // Actual: mensaje directo
// rawMessageDelivery: false, // Mensaje envuelto en metadata SNS
```

**Diferencia:**
- `true`: Recibe directamente el mensaje del publisher
- `false`: Recibe mensaje con metadata adicional de SNS

## 🧪 Experimentos Sugeridos

### 📊 **1. Monitorear Métricas**
Descomentar las alarmas de CloudWatch para ver:
- Profundidad de cola (`ApproximateNumberOfVisibleMessages`)
- Mensajes en DLQ
- Tiempo de procesamiento

### 🔄 **2. Probar Diferentes Configuraciones de Reintentos**
```bash
# Cambiar maxReceiveCount y observar comportamiento:
maxReceiveCount: 1  # Falla rápido
maxReceiveCount: 3  # Balance
maxReceiveCount: 10 # Muy tolerante
```

### 🎯 **3. Implementar Filtros de Mensajes**
1. Descomentar `filterPolicy`
2. Modificar el publisher para enviar diferentes `eventType`
3. Observar qué mensajes llegan a la cola

### ⚡ **4. Optimizar Long Polling**
```bash
# Probar diferentes valores:
receiveMessageWaitTime: Duration.seconds(0)  # Short polling
receiveMessageWaitTime: Duration.seconds(20) # Long polling (menos requests)
```

### 🔒 **5. Experimentar con Encriptación**
Cambiar entre `SQS_MANAGED` y `KMS_MANAGED` para ver diferencias de costo y seguridad.

## 🚀 Próximos Pasos

### 1. **Desplegar la Infraestructura**
```bash
cd infra
npm install
npx cdk synth --context env=dev
npx cdk deploy SqsStack --context env=dev
```

### 2. **Crear Lambda Consumer**
El siguiente paso será crear una Lambda que:
- Se active con mensajes de SQS (Event Source Mapping)
- Procese mensajes por lotes
- Maneje errores correctamente

### 3. **Probar el Flujo Completo**
Producer (Lambda) -> SNS -> SQS -> Consumer (Lambda)

## 📚 Recursos de Aprendizaje

- **AWS SQS Best Practices**: Configuraciones óptimas de producción
- **Event-Driven Patterns**: Cómo diseñar sistemas desacoplados
- **Error Handling**: Estrategias de manejo de fallos y circuit breakers
- **Cost Optimization**: Cómo Long Polling reduce costos

---

*Esta configuración te permite experimentar fácilmente con todas las opciones de SQS descomentando/comentando líneas específicas. ¡Perfecto para aprender cómo cada configuración afecta el comportamiento del sistema!*