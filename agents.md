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

### 2. **Sistema de Notificaciones (Parcial - En Exploración)**
- **Producer**: Lambda publisher envía eventos a SNS ✅
- **SNS Topic**: Recibe y distribuye mensajes ✅  
- **SQS Integration**: Pendiente de implementar 🚧
- **Consumer**: Lambda para procesar colas, pendiente 🚧
- **Patrón Completo**: Producer -> SNS -> SQS -> Consumer (en progreso)

### 3. **Pipeline Multi-Entorno**
- Despliegue automatizado en diferentes entornos (dev, pre, pro)
- Triggered por cambios en ramas específicas de GitHub
- Gestión de configuraciones por entorno

## 🧪 Exploración Actual: Patrón Producer -> SNS -> SQS -> Consumer

### 🎯 **Objetivo de Aprendizaje Actual**
Estoy explorando el patrón de **mensajería asíncrona** con colas de AWS para entender cómo funcionan los sistemas event-driven y el desacoplamiento de componentes.

### ✅ **Componentes YA Implementados:**

#### 1. **Producer** ✅ 
- **Lambda Publisher**: Funciona correctamente
- **Envío a SNS**: Utiliza AWS SDK v3 (`SNSClient`, `PublishCommand`)
- **Message Attributes**: Configurado con metadata y tipos de evento
- **Permisos**: IAM configurado para publicar en SNS

#### 2. **SNS Topic** ✅
- **Topic "test"**: Creado y funcional
- **Cross-Stack Integration**: ARN exportado entre stacks
- **Subscription Ready**: Preparado para recibir suscripciones

### ❌ **Componentes PENDIENTES:**

#### 3. **SQS Queue** 🚧 (En exploración)
- **Cola Principal**: Para recibir mensajes del SNS
- **Dead Letter Queue (DLQ)**: Para manejo de errores y reintentos
- **Configuración**: Visibility timeout, message retention, etc.

#### 4. **SNS -> SQS Subscription** � (En exploración)
- **Suscripción**: Conectar el topic SNS con la cola SQS
- **Filter Policy**: Opcional, para filtrar mensajes por tipo
- **Raw Message Delivery**: Configuración de formato de mensaje

#### 5. **Consumer Lambda** 🚧 (Próximo paso)
- **Event Source Mapping**: SQS como trigger de Lambda
- **Batch Processing**: Procesamiento por lotes de mensajes
- **Error Handling**: Gestión de fallos y DLQ
- **Message Deletion**: Confirmación de procesamiento exitoso

### 🎓 **Aprendizajes Objetivo:**
- **Desacoplamiento**: Separación entre productores y consumidores
- **Escalabilidad**: Manejo de picos de carga con colas
- **Resilencia**: Reintentos automáticos y manejo de errores
- **Observabilidad**: Métricas de colas y procesamiento
- **Patrones Event-Driven**: Arquitecturas basadas en eventos

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