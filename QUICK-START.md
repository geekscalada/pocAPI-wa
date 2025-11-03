# 🚀 Instrucciones Rápidas - Validación y Deploy Automático

## Configuración Inicial (Solo Primera Vez)

### Paso 1: Configurar Secretos en AWS

El proyecto usa un secreto centralizado `Secret-pipeline` que contiene:
- `gitHubToken`: Token de GitHub para el pipeline
- `jwtSecret`: Secreto para firmar tokens JWT

```bash
# 1. Navegar a la carpeta del pipeline
cd pipeline

# 2. Copiar template de variables de entorno
cp .env.example .env

# 3. Generar secreto JWT seguro
openssl rand -base64 64

# 4. Editar .env y configurar ambos secretos
nano .env
# O usar vim: vim .env
# O usar VS Code: code .env

# Contenido del .env:
# GITHUB_TOKEN=ghp_tu_token_de_github_aqui
# JWT_SECRET=<pegar-secreto-generado-arriba>

# 5. Deploy del secreto en AWS Secrets Manager (solo primera vez)
npm install
npx cdk deploy SecretPipelineStack
```

**Nota**: Este paso se hace **solo una vez**. El secreto queda guardado en AWS Secrets Manager.

## Desarrollo Diario

#### Paso 2: Validar Stack Localmente

```bash
# Desde la raíz del proyecto
./validate-stack.sh
```

Este script:
- ✅ Compila todas las lambdas (auth, consumer, publisher)
- ✅ Instala dependencias si es necesario
- ✅ Ejecuta `cdk synth` para validar la configuración
- ✅ Verifica que no hay errores antes del push

### Paso 3: Push para Deploy Automático

```bash
# Commit tus cambios
git add .
git commit -m "feat: add JWT authentication"

# Push a la rama configurada en el pipeline
git push origin dev  # o la rama que uses
```

El **pipeline automático** se encargará de:
1. Compilar todas las lambdas
2. Ejecutar CDK deploy
3. Crear/actualizar recursos en AWS

## 🎯 Resultado

Después del deploy exitoso del pipeline:

1. ✅ API Gateway con endpoints protegidos por JWT
2. ✅ Lambda de Login (público) - genera tokens JWT
3. ✅ Lambda Authorizer - valida tokens en cada request
4. ✅ DynamoDB Table para usuarios
5. ✅ AWS Secrets Manager con el secreto JWT configurado

## 🧪 Próximos Pasos

### 1. Seedear un Usuario de Prueba

```bash
# Obtener el nombre de la tabla de los outputs de CDK
TABLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name <tu-stack-name> \
  --query 'Stacks[0].Outputs[?OutputKey==`AuthUsersTableName`].OutputValue' \
  --output text)

# Crear usuario admin
aws dynamodb put-item \
  --table-name $TABLE_NAME \
  --item '{
    "username": {"S": "admin"},
    "password": {"S": "admin123"}
  }'
```

### 2. Obtener Token JWT

```bash
# Obtener URL de la API
API_URL=$(aws cloudformation describe-stacks \
  --stack-name <tu-stack-name> \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

# Login
curl -X POST "${API_URL}auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Respuesta: {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### 3. Usar Token en Endpoints Protegidos

```bash
# Guardar token en variable
TOKEN="<pegar-token-aqui>"

# Probar endpoint protegido
curl -X POST "${API_URL}send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "TEST_EVENT",
    "data": {"message": "Hello from authenticated API!"}
  }'
```

## 📚 Documentación Adicional

- **README principal**: [README.md](README.md)
- **Auth Lambdas**: `lambdas/auth/` (código fuente)
- **Resumen de refactorización**: [REFACTORING-SUMMARY.md](REFACTORING-SUMMARY.md)

## ⚠️ Notas Importantes

### Seguridad - Solo POC
- ⚠️ Las contraseñas se almacenan en **texto plano** en DynamoDB
- ⚠️ Esto es **SOLO PARA DEMOSTRACIÓN**
- ✅ En producción usar bcrypt/argon2 para hashear passwords

### Archivo .env
- ❌ **NUNCA** commitear `infra/.env` al repositorio
- ✅ Ya está en `.gitignore`
- ✅ Solo commitear `infra/.env.example`

### Secreto JWT
- 🔐 Se guarda en AWS Secrets Manager durante el deploy
- 🔐 Las lambdas lo leen desde Secrets Manager (no desde .env)
- 🔐 Si no configuras `.env`, CDK genera uno automático

## 🛠️ Troubleshooting

### Error: "Cannot find module 'dotenv'"
```bash
cd infra
npm install
```

### Error: "No se puede leer .env"
```bash
# Verificar que existe
ls -la infra/.env

# Si no existe, crearlo
cd infra
cp .env.example .env
# Editar y configurar JWT_SECRET
```

### Lambda no compila
```bash
cd lambdas/auth
rm -rf node_modules dist
npm install
npm run build
```

### Ver logs de errores
```bash
# Login lambda
aws logs tail /aws/lambda/<project>-<env>-auth-login --follow

# Authorizer lambda
aws logs tail /aws/lambda/<project>-<env>-auth-authorizer --follow
```
