# 🔐 Resumen: Gestión Segura de Secretos JWT

## ✅ Implementación Final

### 1. **CDK Stack** (`infra/lib/testing-api-stack.ts`)
```typescript
// Referencia al secreto existente (NO crea uno nuevo)
const pipelineSecret = secretsmanager.Secret.fromSecretNameV2(
  this,
  'PipelineSecret',
  'Secret-pipeline'  // ← Nombre del secreto en AWS
);

// Configuración de lambdas con ARN (NO con el valor del secreto)
environment: {
  JWT_SECRET_ARN: pipelineSecret.secretArn,  // ← Solo ARN (seguro)
  JWT_SECRET_KEY: 'jwtSecret'                // ← Key del JSON
}

// Permisos IAM automáticos
pipelineSecret.grantRead(loginLambda);
pipelineSecret.grantRead(authorizerLambda);
```

### 2. **Helper Compartido** (`lambdas/auth/src/utils/secretCache.ts`)
```typescript
// Caché en memoria (persiste entre warm starts)
let cachedSecret: string | null = null;

export async function getJwtSecret(): Promise<string> {
  // Warm start: retornar caché (0ms)
  if (cachedSecret) return cachedSecret;
  
  // Cold start: leer de Secrets Manager (150ms)
  const response = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.JWT_SECRET_ARN })
  );
  
  // Cachear y retornar
  cachedSecret = parseSecret(response);
  return cachedSecret;
}
```

### 3. **Lambdas** (`login.ts` y `authorizer.ts`)
```typescript
import { getJwtSecret } from './utils/secretCache.js';

export const handler = async (event) => {
  // Obtener secreto (con caché automático)
  const secret = await getJwtSecret();
  
  // Usar para firmar/verificar JWT
  const token = signJwt(payload, secret);
};
```

## 🎯 ¿Qué NO está en el repositorio?

| ❌ NO está en Git | ✅ Sí está en Git |
|-------------------|-------------------|
| Valor del secreto JWT | Nombre del secreto: `'Secret-pipeline'` |
| ARN completo | Código para leer el secreto |
| Credenciales | Key del JSON: `'jwtSecret'` |
| Tokens reales | Lógica de caché |

## 📊 Flujo de Ejecución

```
┌─────────────────────────────────────────────────────────┐
│ Cold Start (primera invocación o tras 15min)           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Request → Lambda                                     │
│  2. getJwtSecret() → cachedSecret == null               │
│  3. Secrets Manager API call (~150ms) ⏱                 │
│  4. cachedSecret = valor del secreto                    │
│  5. Procesar request                                     │
│                                                          │
│  Tiempo total: ~300-400ms                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Warm Start (invocaciones subsiguientes <15min)         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Request → Lambda                                     │
│  2. getJwtSecret() → cachedSecret != null ✅            │
│  3. return cachedSecret (0ms) ⚡                        │
│  4. Procesar request                                     │
│                                                          │
│  Tiempo total: ~20-50ms (6-10x más rápido)             │
└─────────────────────────────────────────────────────────┘
```

## 🛡️ Seguridad

### Variables de Entorno (lo que SÍ ves en AWS Console)
```json
{
  "JWT_SECRET_ARN": "arn:aws:secretsmanager:eu-west-1:123456789:secret:Secret-pipeline-AbCdEf",
  "JWT_SECRET_KEY": "jwtSecret",
  "USERS_TABLE": "poc-api-wa-dev-auth-users"
}
```
✅ **Seguro**: Solo referencias, no secretos reales

### Caché en Memoria (lo que NO ves en ningún lado)
```typescript
let cachedSecret = "eyJhbGciOiJIUzI1NiIs..."; // ← Solo en RAM
```
✅ **Seguro**: 
- No persiste en disco
- No visible en consola AWS
- Se destruye al reciclar el contenedor
- Requiere IAM para leerlo inicialmente

## 💰 Coste

```
Escenario: 1 millón de requests/mes

Sin caché:
- 1,000,000 llamadas a Secrets Manager
- $0.05 por 10,000 llamadas
- Total: $5.00/mes

Con caché (implementado):
- ~10,000 cold starts (solo estas llaman a Secrets Manager)
- $0.05 total
- Total: $0.05/mes

Ahorro: 99% ($4.95/mes)
```

## 🚀 Setup Inicial

```bash
# 1. Verificar que el secreto existe
aws secretsmanager describe-secret --secret-id Secret-pipeline

# 2. Si no existe, crearlo
aws secretsmanager create-secret \
  --name Secret-pipeline \
  --secret-string '{
    "gitHubToken": "ghp_xxxxx",
    "jwtSecret": "'"$(openssl rand -base64 32)"'"
  }'

# 3. Deploy CDK (automáticamente configura todo)
cd infra
npm run build
npx cdk deploy --all --context env=dev
```

## ✅ Checklist de Seguridad

- [x] Secretos en AWS Secrets Manager (no en código)
- [x] Solo ARN en variables de entorno (no valor)
- [x] Caché en memoria para rendimiento
- [x] Permisos IAM granulares (grantRead)
- [x] Código compartido sin duplicación
- [x] Logs de CloudWatch para debugging
- [x] Rotación automática posible (solo cold start lee)

## 📚 Archivos Involucrados

```
pocAPI-wa/
├── infra/lib/testing-api-stack.ts    # CDK: configura ARN y permisos
├── lambdas/auth/
│   ├── src/
│   │   ├── login.ts                  # Usa getJwtSecret()
│   │   ├── authorizer.ts             # Usa getJwtSecret()
│   │   └── utils/
│   │       └── secretCache.ts        # Caché compartido
└── docs/
    ├── JWT-Secret-Configuration.md    # Documentación completa
    └── JWT-Secret-Summary.md          # Este resumen
```

## 🎓 Conceptos Clave

1. **Separation of Concerns**: Secreto en AWS, referencia en código
2. **Defense in Depth**: IAM + Secrets Manager + caché temporal
3. **Performance**: Caché reduce latencia 6-10x
4. **Cost Optimization**: 99% reducción en llamadas API
5. **Zero Trust**: Nunca hardcodear secretos en código/config
