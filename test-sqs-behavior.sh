#!/bin/bash

# 🧪 SQS Testing - Pruebas de comportamiento de SQS
# Demuestra visibilityTimeout, batching, DLQ, etc.

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 SQS Behavior Testing Suite${NC}"
echo "=================================="
echo ""

# Configuración
API_URL=${1:-""}
JWT_TOKEN=${2:-""}

if [ -z "$API_URL" ]; then
    echo -e "${YELLOW}⚠️  No se proporcionó API_URL${NC}"
    echo "Uso: ./test-sqs-behavior.sh <API_URL> <JWT_TOKEN>"
    echo ""
    echo "Ejemplo:"
    echo "  ./test-sqs-behavior.sh https://abc123.execute-api.us-east-1.amazonaws.com/prod/ eyJhbGc..."
    exit 1
fi

if [ -z "$JWT_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  No se proporcionó JWT_TOKEN${NC}"
    echo "Primero obtén un token:"
    echo "  curl -X POST ${API_URL}auth/login -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"password\":\"admin123\"}'"
    exit 1
fi

# Limpiar URL (eliminar trailing slash)
API_URL=${API_URL%/}

echo -e "${GREEN}✅ Configuración:${NC}"
echo "   API URL: $API_URL"
echo "   Token: ${JWT_TOKEN:0:20}..."
echo ""

# Función para enviar evento
send_event() {
    local event_type=$1
    local data=$2
    local force_error=${3:-false}
    
    response=$(curl -s -X POST "${API_URL}/send" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${JWT_TOKEN}" \
        -d "{
            \"eventType\": \"${event_type}\",
            \"data\": ${data},
            \"forceError\": ${force_error}
        }")
    
    echo "$response"
}

# Menú de pruebas
show_test_menu() {
    echo ""
    echo "================================"
    echo "🧪 Pruebas Disponibles:"
    echo "================================"
    echo "1) 📤 Envío Simple - 1 mensaje"
    echo "2) 📦 Batching - 10 mensajes rápidos"
    echo "3) 🔄 Visibility Timeout - Ver mensaje 'bloqueado'"
    echo "4) ⏰ Mensajes Retrasados - Con delay"
    echo "5) 💥 DLQ Test - Enviar mensajes que fallarán"
    echo "6) 🚀 Carga Alta - 50 mensajes"
    echo "7) 📊 Test Completo - Demostración de todos los features"
    echo "0) 🚪 Salir"
    echo ""
    echo -n "Selecciona una prueba: "
}

# Test 1: Envío Simple
test_simple() {
    echo ""
    echo -e "${BLUE}📤 Test 1: Envío Simple${NC}"
    echo "================================"
    echo "Envía 1 mensaje y muestra el flujo completo"
    echo ""
    
    result=$(send_event "SIMPLE_TEST" '{"test":"simple","timestamp":"'$(date -Iseconds)'"}' false)
    
    echo -e "${GREEN}✅ Respuesta:${NC}"
    echo "$result" | jq '.'
    
    msg_id=$(echo "$result" | jq -r '.messageId')
    
    echo ""
    echo -e "${YELLOW}🔍 Ahora:${NC}"
    echo "   1. El mensaje está en SNS"
    echo "   2. SNS lo envía a SQS"
    echo "   3. La Lambda Consumer lo procesará automáticamente"
    echo "   4. Revisa los logs del consumer para ver el procesamiento"
    echo ""
    echo "MessageId: $msg_id"
}

# Test 2: Batching
test_batching() {
    echo ""
    echo -e "${BLUE}📦 Test 2: Batching${NC}"
    echo "================================"
    echo "Envía 10 mensajes rápidos para ver cómo SQS los agrupa"
    echo ""
    
    echo "Enviando 10 mensajes..."
    for i in {1..10}; do
        send_event "BATCH_TEST_$i" '{"index":'$i',"timestamp":"'$(date -Iseconds)'"}' false > /dev/null &
        echo -ne "   📤 Enviado: $i/10\r"
    done
    wait
    echo ""
    
    echo ""
    echo -e "${GREEN}✅ 10 mensajes enviados${NC}"
    echo ""
    echo -e "${YELLOW}🔍 Observa:${NC}"
    echo "   - La Lambda Consumer tiene batchSize=5"
    echo "   - Debería procesar estos mensajes en 2 batches"
    echo "   - maxBatchingWindow=10s: espera hasta 10s para llenar batch"
    echo "   - maxConcurrency=5: máximo 5 lambdas simultáneas"
    echo ""
    echo "Revisa los logs para ver cómo se agrupan:"
    echo "   aws logs tail /aws/lambda/poc-api-wa-dev-sqs-consumer --follow"
}

# Test 3: Visibility Timeout
test_visibility() {
    echo ""
    echo -e "${BLUE}🔄 Test 3: Visibility Timeout${NC}"
    echo "================================"
    echo "Demuestra cómo funciona el visibility timeout"
    echo ""
    
    echo "Enviando mensaje..."
    result=$(send_event "VISIBILITY_TEST" '{"note":"Este mensaje estará invisible 6min mientras se procesa"}' false)
    msg_id=$(echo "$result" | jq -r '.messageId')
    
    echo ""
    echo -e "${GREEN}✅ Mensaje enviado: $msg_id${NC}"
    echo ""
    echo -e "${YELLOW}🔍 Visibility Timeout configurado: 6 minutos${NC}"
    echo ""
    echo "¿Qué sucede?"
    echo "   1. ✅ SQS recibe el mensaje (visible)"
    echo "   2. 🔒 Lambda lo recoge → mensaje invisible por 6 min"
    echo "   3. ⚙️  Lambda tiene 5 min para procesarlo"
    echo "   4. Si Lambda falla → mensaje vuelve visible después de 6 min"
    echo "   5. Si Lambda tiene éxito → mensaje eliminado de SQS"
    echo ""
    echo "El visibility timeout DEBE ser > lambda timeout (6min > 5min)"
}

# Test 4: Mensajes Retrasados
test_delayed() {
    echo ""
    echo -e "${BLUE}⏰ Test 4: Mensajes Retrasados${NC}"
    echo "================================"
    echo "⚠️  Nota: SQS no soporta delay por mensaje en este setup"
    echo "El delay se configura a nivel de cola (actualmente 0s)"
    echo ""
    
    echo "Para mensajes retrasados necesitarías:"
    echo "   1. Configurar DelaySeconds en la cola (0-900s)"
    echo "   2. O usar atributo MessageDelaySeconds al enviar"
    echo "   3. O usar SNS con SQS delayed delivery"
    echo ""
    
    echo "Enviando mensaje normal..."
    send_event "DELAYED_TEST" '{"note":"Mensaje sin delay"}' false > /dev/null
    
    echo -e "${GREEN}✅ Mensaje enviado (procesará inmediatamente)${NC}"
}

# Test 5: DLQ Test
test_dlq() {
    echo ""
    echo -e "${BLUE}💥 Test 5: Dead Letter Queue${NC}"
    echo "================================"
    echo "Envía mensajes que fallarán para ir a DLQ"
    echo ""
    
    echo -e "${YELLOW}Configuración actual:${NC}"
    echo "   - maxReceiveCount: 3 intentos"
    echo "   - Mensajes con forceError=true fallarán siempre"
    echo ""
    
    echo "Enviando 3 mensajes que fallarán..."
    for i in {1..3}; do
        result=$(send_event "DLQ_TEST_$i" '{"willFail":true}' true)
        msg_id=$(echo "$result" | jq -r '.messageId')
        echo "   💥 Mensaje $i enviado: $msg_id"
        sleep 1
    done
    
    echo ""
    echo -e "${GREEN}✅ 3 mensajes enviados (configurados para fallar)${NC}"
    echo ""
    echo -e "${YELLOW}🔍 Proceso:${NC}"
    echo "   1. 📬 Mensaje llega a main queue"
    echo "   2. ⚠️  Lambda intenta procesar → falla"
    echo "   3. 🔄 SQS reintenta (ApproximateReceiveCount++)"
    echo "   4. ⚠️  Lambda falla segunda vez"
    echo "   5. 🔄 SQS reintenta tercera vez"
    echo "   6. ⚠️  Lambda falla tercera vez"
    echo "   7. 💀 Mensaje movido a DLQ automáticamente"
    echo ""
    echo "Espera ~2-3 minutos y verifica la DLQ:"
    echo "   aws sqs get-queue-attributes --queue-url <DLQ-URL> --attribute-names ApproximateNumberOfMessages"
}

# Test 6: Carga Alta
test_high_load() {
    echo ""
    echo -e "${BLUE}🚀 Test 6: Carga Alta${NC}"
    echo "================================"
    echo "Envía 50 mensajes para probar throughput"
    echo ""
    
    echo "Enviando 50 mensajes en paralelo..."
    start_time=$(date +%s)
    
    for i in {1..50}; do
        send_event "LOAD_TEST_$i" '{"index":'$i'}' false > /dev/null &
        
        if [ $((i % 10)) -eq 0 ]; then
            echo "   📤 Enviados: $i/50"
        fi
    done
    wait
    
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    echo ""
    echo -e "${GREEN}✅ 50 mensajes enviados en ${duration}s${NC}"
    echo ""
    echo -e "${YELLOW}🔍 Observa:${NC}"
    echo "   - batchSize=5: cada lambda procesa hasta 5 mensajes"
    echo "   - maxConcurrency=5: hasta 5 lambdas simultáneas"
    echo "   - Capacidad teórica: 25 mensajes simultáneos"
    echo "   - Los 50 mensajes se procesarán en ~2-3 waves"
    echo ""
    echo "Verifica el procesamiento:"
    echo "   aws cloudwatch get-metric-statistics \\"
    echo "     --namespace SQS-Consumer-POC \\"
    echo "     --metric-name MessagesProcessedSuccess \\"
    echo "     --dimensions Name=LambdaFunction,Value=poc-api-wa-dev-sqs-consumer \\"
    echo "     --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \\"
    echo "     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \\"
    echo "     --period 60 --statistics Sum"
}

# Test 7: Demostración Completa
test_full_demo() {
    echo ""
    echo -e "${BLUE}📊 Test 7: Demostración Completa${NC}"
    echo "================================"
    echo "Ejecuta una suite completa de pruebas"
    echo ""
    
    echo "🎬 Escenario 1: Mensajes exitosos"
    send_event "DEMO_SUCCESS_1" '{"type":"success"}' false > /dev/null
    send_event "DEMO_SUCCESS_2" '{"type":"success"}' false > /dev/null
    echo "   ✅ 2 mensajes exitosos enviados"
    
    sleep 2
    
    echo ""
    echo "🎬 Escenario 2: Mensajes con error (para DLQ)"
    send_event "DEMO_ERROR_1" '{"type":"error"}' true > /dev/null
    echo "   💥 1 mensaje con error enviado"
    
    sleep 2
    
    echo ""
    echo "🎬 Escenario 3: Batch de mensajes"
    for i in {1..5}; do
        send_event "DEMO_BATCH_$i" '{"batch":true,"index":'$i'}' false > /dev/null &
    done
    wait
    echo "   📦 5 mensajes en batch enviados"
    
    echo ""
    echo -e "${GREEN}✅ Demostración completa ejecutada${NC}"
    echo ""
    echo -e "${YELLOW}🔍 Resumen de lo que verás:${NC}"
    echo "   1. 7 mensajes exitosos procesados normalmente"
    echo "   2. 1 mensaje fallará 3 veces → irá a DLQ"
    echo "   3. El batch se procesará junto (o en 2 invocaciones)"
    echo ""
    echo "Monitorea con:"
    echo "   ./monitor-sqs.sh"
}

# Loop principal
while true; do
    show_test_menu
    read -r option
    
    case $option in
        1) test_simple ;;
        2) test_batching ;;
        3) test_visibility ;;
        4) test_delayed ;;
        5) test_dlq ;;
        6) test_high_load ;;
        7) test_full_demo ;;
        0)
            echo "👋 ¡Hasta luego!"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            ;;
    esac
    
    echo ""
    echo -n "Presiona Enter para continuar..."
    read -r
done
