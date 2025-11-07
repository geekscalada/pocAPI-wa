# 🔐 Configuración de Secretos JWT

## Arquitectura de Seguridad

Este proyecto usa **AWS Secrets Manager** con **caché en memoria** para gestionar el secreto JWT de forma segura y eficiente.

## ✅ Flujo Implementado

```
┌─────────────────────────────────────────────────────────────┐
│  CDK Stack (testing-api-stack.ts)                           │
│                                                              │
│  const pipelineSecret = Secret.fromSecretNameV2(            │
│    'PipelineSecret',                                         │
│    'Secret-pipeline'  ← Nombre del secreto en AWS          │
│  );                                                          │
│                                                              │
│  Lambda Config:                                              │
│  environment: {                                              │
│    JWT_SECRET_ARN: pipelineSecret.secretArn  ← ARN (seguro) │
│    JWT_SECRET_KEY: 'jwtSecret'  ← Key dentro del JSON      │
│  }                                                           │
│                                                              │
│  Permisos:                                                   │
│  pipelineSecret.grantRead(loginLambda)  ← IAM automático    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Lambda Runtime (login.ts / authorizer.ts)                  │
│                                                              │
│  let cachedSecret: string | null = null;  ← Caché memoria   │
│                                                              │
│  async function getJwtSecret() {                            │
│    if (cachedSecret) {                                       │
│      return cachedSecret;  ← Warm start: 0ms ⚡             │
│    }                                                         │
│                                                              │
│    // Cold start: leer de Secrets Manager                   │
│    const response = await sm.send(                          │
│      GetSecretValueCommand({ SecretId: JWT_SECRET_ARN })    │
│    );  ← Solo en cold start: ~150ms 🔄                      │
│                                                              │
│    cachedSecret = parseSecret(response);                    │
│    return cachedSecret;                                      │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

## 🔒 ¿Qué NO está expuesto en el repo?

```typescript
// ❌ NUNCA en el código:
const secret = "mi-secreto-super-secreto-12345";

// ✅ Solo referencias:
JWT_SECRET_ARN: pipelineSecret.secretArn
// → arn:aws:secretsmanager:eu-west-1:123456789:secret:Secret-pipeline-AbCdEf

JWT_SECRET_KEY: 'jwtSecret'
// → Nombre de la key dentro del JSON del secreto
```

**En el repositorio solo hay:**
- ✅ Nombre del secreto: `'Secret-pipeline'` (público, no sensible)
- ✅ Key del JSON: `'jwtSecret'` (público, no sensible)
- ✅ Código que LEE el secreto (público, no sensible)

**NO hay en el repositorio:**
- ❌ El valor real del secreto JWT
- ❌ ARN completo hardcoded (se resuelve en deploy)
- ❌ Credenciales de ningún tipo

## 📝 Configuración del Secreto en AWS

### 1. Estructura del secreto `Secret-pipeline`

El secreto debe existir en AWS Secrets Manager con este formato JSON:

```json
{
  "gitHubToken": "ghp_xxxxxxxxxxxxx",
  "jwtSecret": "tu-secreto-jwt-aleatorio-muy-largo-y-seguro"
}
```

### 2. Crear/actualizar el secreto

```bash
# Opción 1: Desde AWS Console
# 1. Ir a AWS Secrets Manager
# 2. Buscar "Secret-pipeline"
# 3. Editar → "Plaintext"
# 4. Asegurarse que tiene la key "jwtSecret"

# Opción 2: AWS CLI
aws secretsmanager create-secret \
  --name Secret-pipeline \
  --secret-string '{
    "gitHubToken": "ghp_xxxxx",
    "jwtSecret": "'"$(openssl rand -base64 32)"'"
  }'

# Opción 3: Actualizar secreto existente (solo jwtSecret)
aws secretsmanager update-secret \
  --secret-id Secret-pipeline \
  --secret-string '{
    "gitHubToken": "ghp_xxxxx",
    "jwtSecret": "nuevo-secreto-jwt-generado"
  }'
```

### 3. Generar un secreto JWT seguro

```bash
# Opción 1: OpenSSL (recomendado)
openssl rand -base64 32

# Opción 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Opción 3: Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## ⚡ Rendimiento: Caché en Memoria

### Cold Start (primera invocación o tras 15min inactiva)
```
┌──────────────┐
│ Request      │
└──────┬───────┘
       │
       ▼
┌────────────────────────┐
│ Lambda Cold Start      │  ~150-200ms
│ - Inicializar runtime  │
│ - Cargar dependencias  │
└──────┬─────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ getJwtSecret()                   │
│ - cachedSecret == null ✗        │
│ - Llamada a Secrets Manager  ⏱  │  ~100-150ms
│ - Cachear en memoria            │
└──────┬──────────────────────────┘
       │
       ▼
┌──────────────┐
│ Process      │  ~20-50ms
│ Request      │
└──────────────┘

Total: ~270-400ms
```

### Warm Start (invocaciones subsiguientes en <15min)
```
┌──────────────┐
│ Request      │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────┐
│ getJwtSecret()                   │
│ - cachedSecret != null ✓        │
│ - return cachedSecret           │  ~0.001ms ⚡
└──────┬──────────────────────────┘
       │
       ▼
┌──────────────┐
│ Process      │  ~20-50ms
│ Request      │
└──────────────┘

Total: ~20-50ms (5-10x más rápido)
```

## 💰 Ahorro de Costes

```
Sin caché:
- 1,000,000 requests/mes
- Todas llaman a Secrets Manager
- Coste: $0.05 por 10,000 llamadas
- Total: $5.00/mes en Secrets Manager

Con caché (implementado):
- 1,000,000 requests/mes
- Solo ~10,000 cold starts llaman a Secrets Manager
- Coste: $0.05
- Total: $0.05/mes en Secrets Manager

Ahorro: $4.95/mes (99% reducción) 💰
```

## 🔐 Ventajas de Seguridad

| Aspecto | Sin Secrets Manager | Con Secrets Manager + Caché |
|---------|---------------------|------------------------------|
| **Visible en consola AWS** | ❌ Sí (texto plano) | ✅ No (solo ARN) |
| **En repositorio Git** | ❌ Sí (riesgo leak) | ✅ No (solo referencias) |
| **Rotación de secreto** | ❌ Requiere redeploy | ✅ Automático tras cold start |
| **Auditoría (CloudTrail)** | ❌ Difícil | ✅ Todas las lecturas logueadas |
| **Permisos granulares** | ❌ No posible | ✅ IAM por recurso |
| **Cifrado en reposo** | ❌ Depende | ✅ KMS automático |

## 🚀 Deployment

```bash
# 1. Asegurarse que el secreto existe
aws secretsmanager describe-secret --secret-id Secret-pipeline

# 2. Deploy CDK
cd infra
npm run build
npx cdk deploy --all --context env=dev

# 3. Las lambdas automáticamente tienen:
#    - Permisos IAM para leer el secreto
#    - Variables de entorno con el ARN
#    - Código con caché en memoria
```

## 🧪 Testing

```bash
# Ver el ARN configurado en la lambda (NO el secreto)
aws lambda get-function-configuration \
  --function-name poc-api-wa-dev-auth-login \
  --query 'Environment.Variables'

# Output:
# {
#   "JWT_SECRET_ARN": "arn:aws:secretsmanager:...:secret:Secret-pipeline-xxxxx",
#   "JWT_SECRET_KEY": "jwtSecret",
#   "USERS_TABLE": "poc-api-wa-dev-auth-users"
# }

# Ver logs de CloudWatch (verificar caché)
aws logs tail /aws/lambda/poc-api-wa-dev-auth-login --follow

# Cold start:
# 🔄 Cold start: fetching JWT secret from Secrets Manager
# ✅ JWT secret cached for future invocations

# Warm starts:
# ✅ JWT secret retrieved from cache (warm start)
```

## 📚 Referencias

- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [Lambda Environment Variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html)
- [Lambda Execution Context Reuse](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-context.html)
