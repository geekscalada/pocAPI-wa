# 📚 Laboratorio AWS - Proyecto pocAPI-wa

## 🎯 ¿Qué es este proyecto?

Este es un **laboratorio personal** diseñado para explorar, experimentar y aprender sobre las tecnologías de **Amazon Web Services (AWS)** a través de **Proof of Concepts (POCs)** prácticos. El proyecto utiliza **Infrastructure as Code (IaC)** con **AWS CDK** para desplegar y gestionar recursos de forma automatizada.

## 🏗️ Arquitectura Actual

El proyecto actualmente implementa una arquitectura serverless compuesta por los siguientes componentes principales:

### 🔧 Infraestructura Core

- **📦 S3 Bucket**: Almacenamiento interno privado con carpetas organizadas (`input/` y `output/`)
- **🔔 SNS Topic**: Sistema de mensajería para eventos y notificaciones
- **⚡ Lambda Functions**: Dos funciones serverless especializadas
- **🚀 CI/CD Pipeline**: Pipeline automatizado con AWS CodePipeline

### 📋 Componentes Detallados

#### 1. **Lambda "S3 Processor" (`lambda-s3-poc`)**
- **Propósito**: Procesamiento de archivos CSV almacenados en S3
- **Funcionalidad**: 
  - Descarga archivos CSV desde la carpeta `input/` del bucket
  - Procesa los datos (transformación de columnas a mayúsculas)
  - Guarda el resultado procesado en la carpeta `output/`
- **Runtime**: Node.js 20.x
- **Servicios**: Incluye servicios especializados para lectura y escritura CSV

#### 2. **Lambda "Publisher" (`publisher`)**
- **Propósito**: Publicación de mensajes en SNS
- **Funcionalidad**: 
  - Envía eventos y notificaciones al topic de SNS
  - Gestiona attributes y metadata de mensajes
- **Runtime**: Node.js 20.x
- **Integración**: Conectada directamente con el SNS topic

#### 3. **S3 Bucket (Internal Private)**
- **Nombre**: `{proyecto}-{entorno}-internal-private-bucket`
- **Estructura**: 
  ```
  📁 input/     # Archivos para procesar
  📁 output/    # Archivos procesados
  ```
- **Permisos**: Las lambdas tienen permisos de lectura/escritura

#### 4. **SNS Topic ("test")**
- **Propósito**: Sistema de mensajería entre componentes
- **Configuración**: Topic estándar (no FIFO)
- **Exportación**: ARN exportado para uso entre stacks

## 🛠️ Tecnologías y Herramientas

### Backend & Infrastructure
- **AWS CDK v2** - Infrastructure as Code en TypeScript
- **AWS Lambda** - Compute serverless
- **Amazon S3** - Almacenamiento de objetos
- **Amazon SNS** - Simple Notification Service
- **AWS CodePipeline** - CI/CD automatizado

### Desarrollo
- **TypeScript** - Lenguaje de programación tipado
- **Node.js 20.x** - Runtime JavaScript
- **AWS SDK v3** - SDK oficial de AWS
- **CSV Processing** - Servicios personalizados para manejo CSV

## 📁 Estructura del Proyecto

```
pocAPI-wa/
├── infra/                    # 🏗️ Infraestructura CDK
│   ├── lib/
│   │   ├── lambda-stack.ts          # Stack de Lambdas
│   │   ├── internal-bucket-stack.ts # Stack del S3 Bucket
│   │   └── sns-test-stack.ts        # Stack de SNS
│   ├── const/
│   │   └── buckets.ts               # Configuraciones de buckets
│   └── bin/
│       └── app.ts                   # Aplicación principal CDK
├── lambdas/                  # ⚡ Funciones Lambda
│   ├── my-lambda/                   # Lambda procesadora de CSV
│   │   └── src/
│   │       ├── index.ts             # Handler principal
│   │       └── services/            # Servicios especializados
│   └── publisher/                   # Lambda publicadora SNS
│       └── src/
│           └── index.ts             # Handler de publicación
├── pipeline/                 # 🚀 Pipeline CI/CD
│   ├── lib/
│   │   └── pipeline-stack.ts        # Stack del pipeline
│   └── bin/
│       └── app.ts                   # App del pipeline
└── scripts/                  # 🗑️ Scripts de limpieza
    ├── delete-rollback-complete-stacks.bash
    ├── deleteAllBuckets.bash
    ├── deleteAllRoles.bash
    └── deleteAllUsers.bash
```

## 🎯 Casos de Uso Implementados

### 1. **Procesamiento de Archivos CSV**
- Subir archivo CSV a S3 (`input/`)
- Lambda procesa automáticamente el archivo
- Resultado guardado en S3 (`output/`)

### 2. **Sistema de Mensajería Event-Driven (Completo)**
- **Producer**: Lambda publisher envía eventos a SNS ✅
- **SNS Topic**: Recibe y distribuye mensajes ✅  
- **SQS FIFO Queue**: Cola con orden garantizado ✅
- **Consumer**: Lambda procesa mensajes de SQS ✅
- **Patrón Completo**: Producer -> SNS -> SQS FIFO -> Consumer ✅
- **Features**:
  - Soporte para FIFO con `MessageGroupId`
  - Batch processing con `batchItemFailures`
  - Dead Letter Queue (DLQ) para manejo de errores
  - Idempotency con DynamoDB y Lambda Powertools

### 3. **Pipeline Multi-Entorno**
- Despliegue automatizado en diferentes entornos (dev, pre, pro)
- Triggered por cambios en ramas específicas de GitHub
- Gestión de configuraciones por entorno

### 4. **🧪 Testing FIFO + batchItemFailures (Laboratorio Activo)**
- **Objetivo**: Validar comportamiento de SQS FIFO con fallos parciales en batch
- **Escenario**: Mensajes A1, A2 (falla), A3 en el mismo grupo
- **Hipótesis**: A3 se procesa aunque A2 falle, si no se bloquea manualmente
- **Documentación**: `FIFO-BATCH-TESTING-GUIDE.md` y `docs/FIFO-Batch-Test-Design.md`
- **Script**: `test-fifo-batch-behavior.sh`

## 🧪 Laboratorio Activo: FIFO + batchItemFailures Deep Dive

### 🎯 **Objetivo de Aprendizaje Actual**
Estoy validando el comportamiento de **SQS FIFO** con **batch processing** y **batchItemFailures** para entender:
- ¿Cómo funciona el orden FIFO cuando hay fallos parciales en un batch?
- ¿Qué pasa con mensajes posteriores si un mensaje intermedio falla?
- ¿Es suficiente con reportar solo el mensaje fallido en `batchItemFailures`?

### ✅ **Implementación Completa del Patrón:**

#### 1. **Producer (Publisher Lambda)** ✅ 
- Envía mensajes a SNS con `MessageGroupId`
- Soporta FIFO con atributos personalizados
- Expone API REST vía API Gateway

#### 2. **SNS Topic** ✅
- Topic "test" para distribuir eventos
- Suscripción a SQS FIFO configurada

#### 3. **SQS FIFO Queue** ✅
- Cola `.fifo` con orden garantizado
- `contentBasedDeduplication` habilitado
- Dead Letter Queue (DLQ) configurada
- `maxReceiveCount: 3`

#### 4. **Consumer Lambda** ✅
- Procesa mensajes en batch
- Usa `batchItemFailures` para reintentos parciales
- Lógica especial: Falla automáticamente si `id === "A2"`
- Logging avanzado para validar comportamiento

### 🔬 **Experimento Actual:**

**Escenario de Test:**
```
Grupo FIFO: "test-group-A"
Mensajes: A1 → A2 → A3

Resultado esperado:
- A1: ✅ Procesa OK
- A2: ❌ Falla intencionalmente  
- A3: ⚠️ Se procesa (validar si esto es correcto)
```

**Hipótesis a validar:**
> "Si solo reporto A2 en `batchItemFailures`, Lambda considera A3 como procesado exitosamente, rompiendo potencialmente el orden FIFO."

### 🎓 **Aprendizajes Clave:**
- `batchItemFailures` solo reporta **lo que falló**, no lo que debe bloquearse
- FIFO requiere **gestión manual** de mensajes posteriores al fallo
- Solución: Reportar **todos los mensajes desde el fallo en adelante**

## �🚀 Características del Laboratorio

### ✅ **Lo que está funcionando:**
- Infraestructura completamente automatizada con CDK
- Pipeline CI/CD multi-entorno
- Procesamiento serverless de archivos CSV
- Sistema de mensajería con SNS (parte del patrón)
- Gestión de permisos IAM automática
- **Producer Lambda -> SNS** (primera parte del patrón completo)

### 🔬 **Próximas Experimentaciones:**
- **Completar patrón SNS -> SQS -> Consumer** (exploración actual)
- Implementar Dead Letter Queues y manejo de errores
- Añadir métricas y alertas de CloudWatch
- Probar diferentes configuraciones de SQS (FIFO vs Standard)
- Experimentar con batch processing en Lambda
- Implementar API Gateway para endpoints REST
- Añadir bases de datos (DynamoDB, RDS)
- Implementar EventBridge para patrones event-driven más complejos
- Experimentar con Step Functions para workflows complejos

## 🎓 Propósito Educativo

Este proyecto serve como:
- **Sandbox de AWS**: Entorno seguro para experimentar con servicios
- **Laboratorio IaC**: Práctica con Infrastructure as Code
- **POC Repository**: Base para probar nuevas arquitecturas
- **Learning Path**: Evolución incremental de conocimientos AWS
- **Best Practices**: Implementación de patrones recomendados

## 🔧 Comandos Útiles

### Despliegue Inicial
```bash
cd infra
npm install
npx cdk bootstrap --context env=dev --all --profile your-profile
npx cdk deploy --context env=dev --all --profile your-profile
```

### Limpieza Completa
```bash
npx cdk destroy --all --profile your-profile --context env=dev
```

---

*Este proyecto está en constante evolución, sirviendo como base para explorar nuevas funcionalidades y patrones arquitectónicos en AWS.*


## VPCs y transitgateway
Si en algún momento hay que realizar la implementación de VPCs y transitgateway para que el laboratorio pueda tener las pruebas de conexión dentro de una red interna, has de revisar el docuento: IRTP.md
Esta implementación ha de ser exclusívamente para las lambdas y no pondremos ALB delante de la APIGTW. 

