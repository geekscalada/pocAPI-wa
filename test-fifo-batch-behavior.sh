#!/bin/bash

# 🧪 Test FIFO Batch Behavior con batchItemFailures
# Valida que cuando A2 falla, A3 se procesa (comportamiento incorrecto de batchItemFailures)

set -e

echo "🧪 =============================================="
echo "   Test: FIFO + batchItemFailures"
echo "   Escenario: A1, A2 (falla), A3"
echo "==============================================="
echo ""

# Variables
API_URL="${API_URL:-https://your-api-gateway-url.amazonaws.com/dev/publish}"
MESSAGE_GROUP_ID="test-group-A"
DELAY_BETWEEN_MESSAGES=2

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para enviar mensaje
send_message() {
    local ID=$1
    local FORCE_ERROR=${2:-false}
    
    echo -e "${BLUE}📤 Enviando mensaje ${ID}...${NC}"
    
    RESPONSE=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"eventType\": \"FIFO_TEST\",
            \"id\": \"${ID}\",
            \"messageGroupId\": \"${MESSAGE_GROUP_ID}\",
            \"data\": {
                \"testCase\": \"batch-item-failures\",
                \"position\": \"${ID}\",
                \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
            },
            \"forceError\": ${FORCE_ERROR}
        }")
    
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    echo ""
}

# Función para verificar logs
check_logs() {
    echo -e "${YELLOW}⏳ Esperando 10 segundos para que los mensajes se procesen...${NC}"
    sleep 10
    
    echo -e "${BLUE}📋 Verificando logs de CloudWatch...${NC}"
    echo ""
    echo "Ejecuta este comando para ver los logs:"
    echo ""
    echo -e "${GREEN}aws logs tail /aws/lambda/pocAPI-wa-dev-consumer --follow --profile your-profile${NC}"
    echo ""
    echo "Busca estos patrones:"
    echo "  ✅ [FIFO TEST] Procesando A3 - Este mensaje NO debería procesarse..."
    echo "  ❌ [FIFO TEST] Forzando fallo de mensaje A2..."
    echo ""
}

# Validar que API_URL está configurada
if [[ "$API_URL" == "https://your-api-gateway-url.amazonaws.com/dev/publish" ]]; then
    echo -e "${RED}❌ ERROR: Configura la variable API_URL${NC}"
    echo ""
    echo "Ejemplo:"
    echo "  export API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/dev/publish"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ API URL configurada: $API_URL${NC}"
echo ""

# Preguntar confirmación
read -p "¿Continuar con el test? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Test cancelado"
    exit 0
fi

echo ""
echo -e "${YELLOW}🚀 Iniciando test...${NC}"
echo ""
echo -e "${BLUE}ℹ️  Configuración de Batching:${NC}"
echo "   - batchSize: 10 mensajes"
echo "   - maxBatchingWindow: 5 segundos"
echo "   - Delay entre mensajes: ${DELAY_BETWEEN_MESSAGES}s"
echo ""
echo -e "${GREEN}✅ Los 3 mensajes llegarán en ~3s, Lambda los agrupará en 1 batch${NC}"
echo ""
sleep 2

# Enviar A1 (éxito)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Enviar mensaje A1 (debe procesar OK)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
send_message "A1" false
sleep $DELAY_BETWEEN_MESSAGES

# Enviar A2 (fallo intencional)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Enviar mensaje A2 (FORZAR ERROR)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
send_message "A2" false  # El consumer tiene lógica para fallar A2
sleep $DELAY_BETWEEN_MESSAGES

# Enviar A3 (éxito - pero podría procesarse incorrectamente)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Enviar mensaje A3 (debe procesar OK)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
send_message "A3" false
sleep $DELAY_BETWEEN_MESSAGES

echo ""
echo -e "${GREEN}✅ Mensajes enviados correctamente${NC}"
echo ""

# Explicación del resultado esperado
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${YELLOW}📚 RESULTADO ESPERADO:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Si Lambda procesa [A1, A2, A3] en un BATCH:"
echo ""
echo "  1️⃣  A1 se procesa OK ✅"
echo "  2️⃣  A2 FALLA ❌"
echo "  3️⃣  A3 se procesa OK ✅ (PROBLEMA!)"
echo ""
echo "Lambda retorna:"
echo "  { batchItemFailures: [{ itemIdentifier: 'messageId-A2' }] }"
echo ""
echo -e "${RED}⚠️  COMPORTAMIENTO INCORRECTO:${NC}"
echo "  - SQS considera A3 como procesado exitosamente"
echo "  - A3 NO se volverá a procesar"
echo "  - Solo A2 se reintentará"
echo ""
echo -e "${GREEN}✅ COMPORTAMIENTO CORRECTO (lo que deberías hacer):${NC}"
echo "  - Retornar A2 Y A3 en batchItemFailures"
echo "  - Esto bloquea A3 hasta que A2 se procese OK"
echo "  - Garantiza orden FIFO estricto"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check_logs

echo ""
echo -e "${BLUE}📊 Para ver métricas de la cola:${NC}"
echo ""
echo "  ./monitor-sqs.sh"
echo ""
