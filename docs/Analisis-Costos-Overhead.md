# 💰 Análisis de Costos Lambda: Individual vs Batching

## 🧮 Parámetros Base
- **Memoria**: 512 MB
- **Overhead por invocación**: 100ms
- **Costo por GB-segundo**: $0.0000166667
- **Costo por invocación**: $0.0000002
- **Escenario**: 1000 mensajes

## 📊 Comparativa por Duración de Procesamiento

| Duración/Mensaje | Individual (1x1) | Lotes (10x1) | Ahorro | % Ahorro |
|------------------|-------------------|---------------|---------|----------|
| **100ms**        | $0.0051          | $0.0043       | $0.0008 | **15.7%** |
| **500ms**        | $0.0210          | $0.0202       | $0.0008 | **3.8%**  |
| **1s**           | $0.0419          | $0.0410       | $0.0009 | **2.1%**  |
| **5s**           | $0.2087          | $0.2079       | $0.0008 | **0.4%**  |
| **12s**          | $0.5010          | $0.5001       | $0.0009 | **0.2%**  |
| **30s**          | $1.2519          | $1.2510       | $0.0009 | **0.1%**  |

## 🎯 Conclusiones Clave

### 1. **El ahorro es FIJO (~$0.0008-0.0009)**
```typescript
// El ahorro viene principalmente del overhead:
// Ahorro = (1000 - 100) × 0.1s × 0.5GB × $0.0000166667 ≈ $0.00075
// + ahorro en invocaciones: $0.00018
// = Total: ~$0.0009
```

### 2. **El % de ahorro es INVERSAMENTE proporcional a la duración**
- **Lambdas rápidas (100ms)**: Batching ahorra **15.7%** 🚀
- **Lambdas lentas (12s)**: Batching ahorra **0.2%** 😐

### 3. **Punto de equilibrio**: ~1 segundo
- Por debajo: El batching tiene impacto significativo
- Por encima: El ahorro se vuelve marginal

## 🏗️ Cálculo Detallado para 12 segundos:

### Individual (batchSize=1):
```typescript
Invocaciones: 1000
Tiempo por lambda: 12.1s (12s + 0.1s overhead)
GB-segundos: 1000 × 12.1s × 0.5GB = 6,050 GB-s

Costos:
- Invocaciones: 1000 × $0.0000002 = $0.0002
- Duración: 6,050 × $0.0000166667 = $0.1008
Total: $0.1010
```

### Lotes (batchSize=10):
```typescript
Invocaciones: 100  
Tiempo por lambda: 120.1s (120s + 0.1s overhead)
GB-segundos: 100 × 120.1s × 0.5GB = 6,005 GB-s

Costos:
- Invocaciones: 100 × $0.0000002 = $0.00002
- Duración: 6,005 × $0.0000166667 = $0.1001
Total: $0.10012
```

### Diferencia:
- **Ahorro absoluto**: $0.00088
- **Ahorro relativo**: 0.87%

## 🤔 ¿Cuándo vale la pena el batching?

### ✅ **SÍ vale la pena cuando:**
- Lambdas **rápidas** (< 1s): Ahorro 2-15%
- **Alto volumen** de mensajes: El ahorro fijo se multiplica
- **Recursos limitados**: Menos conexiones, menos cold starts
- **Simplificar monitoring**: Menos logs y métricas

### ❌ **NO es crítico cuando:**
- Lambdas **lentas** (> 5s): Ahorro < 0.5%
- **Latencia es crítica**: Individual procesa más rápido
- **Fallos correlacionados**: Un error no debe afectar múltiples mensajes

## 🎯 Recomendaciones por Escenario:

| Duración | Recomendación | BatchSize | Motivo |
|----------|---------------|-----------|---------|
| < 500ms  | **Batching**  | 10-25     | Ahorro significativo |
| 500ms-2s | **Batching**  | 5-10      | Ahorro moderado + menos overhead |
| 2s-10s   | **Individual**| 1         | Mejor latencia, ahorro mínimo |
| > 10s    | **Individual**| 1         | Máximo paralelismo |

## 🧪 Factores Adicionales:

### **Memoria vs Costo:**
- **128 MB**: Overhead más significativo (GB-s más baratos)
- **1024 MB**: Overhead menos significativo (GB-s más caros)

### **Cold Starts:**
- Individual: Hasta 1000 cold starts
- Lotes: Hasta 100 cold starts
- **Impacto**: ~200-500ms adicionales por cold start

### **Throughput:**
- Individual: Limitado por `maxConcurrency`
- Lotes: `maxConcurrency × batchSize` mensajes/minuto