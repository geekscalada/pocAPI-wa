#!/bin/bash

# ========================================
# 🔍 Validación Local de Stack y Lambdas
# ========================================
# Este script valida que:
# 1. Todas las lambdas se pueden compilar correctamente
# 2. Los stacks de CDK se pueden sintetizar sin errores
# 3. No hay errores de configuración antes del push
# ========================================

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔍 Iniciando validación del stack..."
echo ""

# ========================================
# 1. Validar Lambdas de Autenticación
# ========================================
echo "📦 [1/4] Validando lambdas de autenticación..."
cd lambdas/auth

if [ ! -d "node_modules" ]; then
  echo "   ⚠️  Instalando dependencias..."
  npm install > /dev/null 2>&1
fi

echo "   🔨 Compilando TypeScript..."
npm run build

if [ -d "dist" ] && [ -f "dist/login.js" ] && [ -f "dist/authorizer.js" ]; then
  echo "   ✅ Auth lambdas compiladas correctamente"
else
  echo "   ❌ Error: No se generaron los archivos esperados en dist/"
  exit 1
fi

cd "$SCRIPT_DIR"

# ========================================
# 2. Validar Lambda Consumer (si existe)
# ========================================
echo ""
echo "📦 [2/4] Validando lambda consumer..."
if [ -d "lambdas/consumer" ]; then
  cd lambdas/consumer
  
  if [ ! -d "node_modules" ]; then
    echo "   ⚠️  Instalando dependencias..."
    npm install > /dev/null 2>&1
  fi
  
  echo "   🔨 Compilando TypeScript..."
  npm run build
  
  if [ -d "dist" ]; then
    echo "   ✅ Consumer lambda compilada correctamente"
  else
    echo "   ❌ Error: No se generó el directorio dist/"
    exit 1
  fi
  
  cd "$SCRIPT_DIR"
else
  echo "   ⏭️  Consumer lambda no encontrada, saltando..."
fi

# ========================================
# 3. Validar Lambda Publisher (si existe)
# ========================================
echo ""
echo "📦 [3/4] Validando lambda publisher..."
if [ -d "lambdas/publisher" ]; then
  cd lambdas/publisher
  
  if [ ! -d "node_modules" ]; then
    echo "   ⚠️  Instalando dependencias..."
    npm install > /dev/null 2>&1
  fi
  
  echo "   🔨 Compilando TypeScript..."
  npm run build
  
  if [ -d "dist" ]; then
    echo "   ✅ Publisher lambda compilada correctamente"
  else
    echo "   ❌ Error: No se generó el directorio dist/"
    exit 1
  fi
  
  cd "$SCRIPT_DIR"
else
  echo "   ⏭️  Publisher lambda no encontrada, saltando..."
fi

# ========================================
# 4. Validar CDK Synth
# ========================================
echo ""
echo "☁️  [4/4] Validando CDK stacks..."
cd infra

if [ ! -d "node_modules" ]; then
  echo "   ⚠️  Instalando dependencias de CDK..."
  npm install > /dev/null 2>&1
fi

echo "   🔨 Compilando CDK stack..."
npm run build

# Verificar si existe .env, si no, avisar
if [ ! -f ".env" ]; then
  echo "   ⚠️  Advertencia: No existe infra/.env"
  echo "   ℹ️  CDK generará un JWT_SECRET automáticamente"
fi

# Intentar synth para cada environment
echo "   🔄 Ejecutando CDK synth..."

# Intentar con el contexto dev (ajusta según tu configuración)
if npx cdk synth --context env=dev > /dev/null 2>&1; then
  echo "   ✅ CDK synth exitoso (env=dev)"
else
  echo "   ❌ Error en CDK synth"
  echo ""
  echo "   Ejecuta manualmente para ver el error:"
  echo "   cd infra && npx cdk synth --context env=dev"
  exit 1
fi

cd "$SCRIPT_DIR"

# ========================================
# Resumen Final
# ========================================
echo ""
echo "════════════════════════════════════════"
echo "✅ VALIDACIÓN COMPLETA EXITOSA"
echo "════════════════════════════════════════"
echo ""
echo "✓ Todas las lambdas compiladas correctamente"
echo "✓ CDK synth ejecutado sin errores"
echo "✓ Stack listo para deploy automático vía pipeline"
echo ""
echo "📝 Próximo paso: git push para activar el pipeline"
echo ""
