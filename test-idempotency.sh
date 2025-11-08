#!/bin/bash

# 🔁 Script para probar IDEMPOTENCIA en el Consumer Lambda
# Envía mensajes duplicados y verifica el comportamiento

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

REGION=${3:-us-east-1}
API_URL=${1:-""}
JWT_TOKEN=${2:-""}

if [ -z "$API_URL" ] || [ -z "$JWT_TOKEN" ]; then
    echo -e "${RED}❌ Faltan parámetros${NC}"
    echo "Uso: ./test-idempotency.sh <API_URL> <JWT_TOKEN> [REGION]"
    echo ""
    echo "Ejemplo:"
    echo "  ./test-idempotency.sh https://abc123.execute-api.us-east-1.amazonaws.com/prod/ 'eyJhbGc...' us-east-1"
    exit 1
fi

# Limpiar URL
API_URL=${API_URL%/}

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       🔁 PRUEBA DE IDEMPOTENCIA - SQS Consumer Lambda        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Función para obtener el estado de idempotencia
get_idempotency_status() {
    local lambda_name="poc-api-wa-dev-sqs-consumer"
    
    local config=$(aws lambda get-function-configuration \
        --function-name "$lambda_name" \
        --region "$REGION" \
        --output json 2>/dev/null)
    
    local enabled=$(echo "$config" | jq -r '.Environment.Variables.ENABLE_IDEMPOTENCY // "false"')
    
    echo "$enabled"
}

# Función para cambiar el estado de idempotencia
toggle_idempotency() {
    local enable=$1
    local lambda_name="poc-api-wa-dev-sqs-consumer"
    
    echo -e "${YELLOW}⚙️  Configurando idempotencia: $enable${NC}"
    
    aws lambda update-function-configuration \
        --function-name "$lambda_name" \
        --environment "Variables={
            ENVIRONMENT=dev,
            PROJECT_NAME=poc-api-wa,
            FORCE_ERROR=false,
            ERROR_RATE=0,
            PROCESSING_DELAY=1000,
            IDEMPOTENCY_TABLE=poc-api-wa-dev-idempotency,
            ENABLE_IDEMPOTENCY=$enable,
            LOG_LEVEL=INFO
        }" \
        --region "$REGION" \
        --output json > /dev/null
    
    echo -e "${GREEN}✅ Idempotencia configurada a: $enable${NC}"
    echo -e "${YELLOW}⏳ Esperando 5s para que se aplique la configuración...${NC}"
    sleep 5
}

# Función para enviar mensaje a través del API
send_event() {
    local event_type=$1
    local event_id=$2
    local data=$3
    
    response=$(curl -s -X POST "${API_URL}/send" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${JWT_TOKEN}" \
        -d "{
            \"eventType\": \"${event_type}\",
            \"id\": \"${event_id}\",
            \"data\": ${data}
        }")
    
    msg_id=$(echo "$response" | jq -r '.messageId // "unknown"')
    success=$(echo "$response" | jq -r '.success // false')
    
    if [ "$success" = "true" ]; then
        echo -e "   ${GREEN}✅ MessageId: $msg_id${NC}"
    else
        echo -e "   ${RED}❌ Error: $(echo "$response" | jq -r '.error // "unknown"')${NC}"
    fi
    
    echo "$msg_id"
}

# Función para enviar mensaje directo a SQS (duplicado exacto)
send_to_sqs_direct() {
    local message=$1
    local queue_name="poc-api-wa-dev-main-queue"
    
    queue_url=$(aws sqs get-queue-url --queue-name "$queue_name" --region "$REGION" --query 'QueueUrl' --output text 2>/dev/null)
    
    result=$(aws sqs send-message \
        --queue-url "$queue_url" \
        --message-body "$message" \
        --region "$REGION" \
        --output json)
    
    msg_id=$(echo "$result" | jq -r '.MessageId')
    echo -e "   ${GREEN}✅ Direct SQS MessageId: $msg_id${NC}"
}

# Función para ver logs recientes del consumer
show_recent_logs() {
    local since=$1
    local lambda_name="poc-api-wa-dev-sqs-consumer"
    
    echo -e "${CYAN}📋 Logs recientes (últimos ${since}):${NC}"
    aws logs tail "/aws/lambda/$lambda_name" \
        --region "$REGION" \
        --since "$since" \
        --format short 2>/dev/null | grep -E "✅|🔁|duplicate|processed|SUCCESS" | tail -n 20
}

# Función para ver métricas de duplicados
show_duplicate_metrics() {
    local minutes=$1
    local lambda_name="poc-api-wa-dev-sqs-consumer"
    
    echo -e "${CYAN}📊 Métricas de duplicados (últimos ${minutes} minutos):${NC}"
    
    # Duplicados detectados
    duplicates=$(aws cloudwatch get-metric-statistics \
        --namespace "SQS-Consumer-POC" \
        --metric-name "DuplicatesDetected" \
        --dimensions Name=LambdaFunction,Value="$lambda_name" \
        --start-time "$(date -u -d "${minutes} minutes ago" +%Y-%m-%dT%H:%M:%S)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
        --period 60 \
        --statistics Sum \
        --region "$REGION" \
        --output json 2>/dev/null | jq '[.Datapoints[].Sum] | add // 0')
    
    # Mensajes exitosos
    success=$(aws cloudwatch get-metric-statistics \
        --namespace "SQS-Consumer-POC" \
        --metric-name "MessagesProcessedSuccess" \
        --dimensions Name=LambdaFunction,Value="$lambda_name" \
        --start-time "$(date -u -d "${minutes} minutes ago" +%Y-%m-%dT%H:%M:%S)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
        --period 60 \
        --statistics Sum \
        --region "$REGION" \
        --output json 2>/dev/null | jq '[.Datapoints[].Sum] | add // 0')
    
    echo -e "   🔁 Duplicados detectados: ${YELLOW}$duplicates${NC}"
    echo -e "   ✅ Mensajes procesados: ${GREEN}$success${NC}"
    echo -e "   📊 Total mensajes recibidos: $(echo "$duplicates + $success" | bc)"
}

# Función para verificar tabla de idempotencia
check_idempotency_table() {
    local message_id=$1
    local table_name="poc-api-wa-dev-idempotency"
    
    echo -e "${CYAN}🔍 Verificando en tabla de idempotencia...${NC}"
    
    result=$(aws dynamodb get-item \
        --table-name "$table_name" \
        --key "{\"messageId\":{\"S\":\"$message_id\"}}" \
        --region "$REGION" \
        --output json 2>/dev/null)
    
    if [ "$(echo "$result" | jq -r '.Item // null')" != "null" ]; then
        processed_at=$(echo "$result" | jq -r '.Item.processedAt.N')
        ttl=$(echo "$result" | jq -r '.Item.ttl.N')
        payload=$(echo "$result" | jq -r '.Item.payload.S')
        
        echo -e "   ${GREEN}✅ Mensaje encontrado en tabla${NC}"
        echo -e "   ⏰ Procesado en: $(date -d @$((processed_at / 1000)) '+%Y-%m-%d %H:%M:%S')"
        echo -e "   🗑️  TTL expira: $(date -d @$ttl '+%Y-%m-%d %H:%M:%S')"
        echo -e "   📦 Payload: $(echo "$payload" | jq -c '.')"
    else
        echo -e "   ${RED}❌ Mensaje NO encontrado en tabla${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
# MENÚ PRINCIPAL
# ═══════════════════════════════════════════════════════════════

show_menu() {
    echo ""
    echo -e "${MAGENTA}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║                🎯 OPCIONES DE PRUEBA                  ║${NC}"
    echo -e "${MAGENTA}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}📊 Estado actual:${NC}"
    local status=$(get_idempotency_status)
    if [ "$status" = "true" ]; then
        echo -e "   Idempotencia: ${GREEN}✅ ACTIVADA${NC}"
    else
        echo -e "   Idempotencia: ${RED}⚠️  DESACTIVADA${NC}"
    fi
    echo ""
    echo -e "${YELLOW}1)${NC} 🧪 Test A: Sin idempotencia (enviar duplicados)"
    echo -e "${YELLOW}2)${NC} 🔒 Test B: Con idempotencia (enviar duplicados)"
    echo -e "${YELLOW}3)${NC} 📊 Test Comparativo (A vs B automático)"
    echo -e "${YELLOW}4)${NC} ⚙️  Activar/Desactivar idempotencia"
    echo -e "${YELLOW}5)${NC} 📋 Ver logs recientes del consumer"
    echo -e "${YELLOW}6)${NC} 📊 Ver métricas de duplicados"
    echo -e "${YELLOW}7)${NC} 🔍 Verificar mensaje en tabla de idempotencia"
    echo -e "${YELLOW}8)${NC} 🗑️  Limpiar tabla de idempotencia"
    echo -e "${YELLOW}0)${NC} 🚪 Salir"
    echo ""
    echo -n "Selecciona una opción: "
}

# Test A: Sin idempotencia
test_without_idempotency() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   🧪 TEST A: Sin Idempotencia - Enviando Duplicados          ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Desactivar idempotencia
    toggle_idempotency "false"
    
    # Generar ID único para esta prueba
    TEST_ID="test-a-$(date +%s)"
    
    echo -e "${YELLOW}📤 Enviando mensaje original...${NC}"
    send_event "IDEMPOTENCY_TEST_A" "$TEST_ID" '{"test":"without_idempotency","attempt":1}'
    
    echo ""
    echo -e "${YELLOW}⏳ Esperando 3s...${NC}"
    sleep 3
    
    echo -e "${YELLOW}📤 Enviando DUPLICADO 1 (mismo evento)...${NC}"
    send_event "IDEMPOTENCY_TEST_A" "$TEST_ID" '{"test":"without_idempotency","attempt":2}'
    
    echo ""
    echo -e "${YELLOW}⏳ Esperando 3s...${NC}"
    sleep 3
    
    echo -e "${YELLOW}📤 Enviando DUPLICADO 2 (mismo evento)...${NC}"
    send_event "IDEMPOTENCY_TEST_A" "$TEST_ID" '{"test":"without_idempotency","attempt":3}'
    
    echo ""
    echo -e "${GREEN}✅ 3 mensajes enviados (1 original + 2 duplicados)${NC}"
    echo ""
    echo -e "${YELLOW}⏳ Esperando 10s para que se procesen...${NC}"
    sleep 10
    
    echo ""
    show_recent_logs "2m"
    
    echo ""
    echo -e "${RED}⚠️  RESULTADO ESPERADO:${NC}"
    echo -e "   ${RED}❌ Los 3 mensajes deberían ser procesados${NC}"
    echo -e "   ${RED}❌ NO se detectan duplicados${NC}"
    echo -e "   ${RED}❌ Lógica de negocio se ejecuta 3 veces${NC}"
}

# Test B: Con idempotencia
test_with_idempotency() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   🔒 TEST B: Con Idempotencia - Enviando Duplicados          ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Activar idempotencia
    toggle_idempotency "true"
    
    # Generar ID único para esta prueba
    TEST_ID="test-b-$(date +%s)"
    
    echo -e "${YELLOW}📤 Enviando mensaje original...${NC}"
    MSG_ID=$(send_event "IDEMPOTENCY_TEST_B" "$TEST_ID" '{"test":"with_idempotency","attempt":1}')
    
    echo ""
    echo -e "${YELLOW}⏳ Esperando 5s...${NC}"
    sleep 5
    
    echo -e "${YELLOW}📤 Enviando DUPLICADO 1 (mismo evento)...${NC}"
    send_event "IDEMPOTENCY_TEST_B" "$TEST_ID" '{"test":"with_idempotency","attempt":2}'
    
    echo ""
    echo -e "${YELLOW}⏳ Esperando 5s...${NC}"
    sleep 5
    
    echo -e "${YELLOW}📤 Enviando DUPLICADO 2 (mismo evento)...${NC}"
    send_event "IDEMPOTENCY_TEST_B" "$TEST_ID" '{"test":"with_idempotency","attempt":3}'
    
    echo ""
    echo -e "${GREEN}✅ 3 mensajes enviados (1 original + 2 duplicados)${NC}"
    echo ""
    echo -e "${YELLOW}⏳ Esperando 15s para que se procesen...${NC}"
    sleep 15
    
    echo ""
    show_recent_logs "3m"
    
    echo ""
    show_duplicate_metrics "5"
    
    echo ""
    echo -e "${GREEN}✅ RESULTADO ESPERADO:${NC}"
    echo -e "   ${GREEN}✅ Solo el primer mensaje se procesa completamente${NC}"
    echo -e "   ${GREEN}✅ Los duplicados se detectan y se saltan${NC}"
    echo -e "   ${GREEN}✅ Lógica de negocio se ejecuta solo 1 vez${NC}"
    echo -e "   ${GREEN}✅ Métricas muestran 2 duplicados detectados${NC}"
}

# Test comparativo
test_comparative() {
    echo ""
    echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║          📊 TEST COMPARATIVO: A vs B (Automático)            ║${NC}"
    echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${CYAN}Este test ejecutará ambas pruebas consecutivamente${NC}"
    echo -e "${CYAN}para que puedas comparar los resultados.${NC}"
    echo ""
    echo -n "¿Continuar? (s/N): "
    read -r confirm
    
    if [ "$confirm" != "s" ] && [ "$confirm" != "S" ]; then
        return
    fi
    
    # Ejecutar Test A
    test_without_idempotency
    
    echo ""
    echo -e "${YELLOW}⏳ Esperando 5s antes del Test B...${NC}"
    sleep 5
    
    # Ejecutar Test B
    test_with_idempotency
    
    echo ""
    echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║                   📊 RESUMEN COMPARATIVO                     ║${NC}"
    echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    show_duplicate_metrics "10"
}

# Toggle idempotency
toggle_idempotency_menu() {
    local current=$(get_idempotency_status)
    
    echo ""
    echo -e "${CYAN}Estado actual: $current${NC}"
    echo ""
    echo "1) Activar idempotencia (true)"
    echo "2) Desactivar idempotencia (false)"
    echo -n "Selecciona: "
    read -r choice
    
    case $choice in
        1) toggle_idempotency "true" ;;
        2) toggle_idempotency "false" ;;
        *) echo -e "${RED}Opción inválida${NC}" ;;
    esac
}

# Ver logs
show_logs_menu() {
    echo ""
    echo "Logs desde hace:"
    echo "1) 1 minuto"
    echo "2) 5 minutos"
    echo "3) 15 minutos"
    echo "4) 30 minutos"
    echo -n "Selecciona: "
    read -r choice
    
    case $choice in
        1) show_recent_logs "1m" ;;
        2) show_recent_logs "5m" ;;
        3) show_recent_logs "15m" ;;
        4) show_recent_logs "30m" ;;
        *) echo -e "${RED}Opción inválida${NC}" ;;
    esac
}

# Ver métricas
show_metrics_menu() {
    echo ""
    echo "Métricas de los últimos:"
    echo "1) 5 minutos"
    echo "2) 15 minutos"
    echo "3) 30 minutos"
    echo "4) 60 minutos"
    echo -n "Selecciona: "
    read -r choice
    
    case $choice in
        1) show_duplicate_metrics "5" ;;
        2) show_duplicate_metrics "15" ;;
        3) show_duplicate_metrics "30" ;;
        4) show_duplicate_metrics "60" ;;
        *) echo -e "${RED}Opción inválida${NC}" ;;
    esac
}

# Verificar mensaje en tabla
verify_message_menu() {
    echo ""
    echo -n "Ingresa el MessageId SQS: "
    read -r msg_id
    
    check_idempotency_table "$msg_id"
}

# Limpiar tabla
clear_idempotency_table() {
    echo ""
    echo -e "${RED}⚠️  ¿Estás seguro de querer limpiar TODA la tabla de idempotencia?${NC}"
    echo -n "(s/N): "
    read -r confirm
    
    if [ "$confirm" = "s" ] || [ "$confirm" = "S" ]; then
        echo -e "${YELLOW}🗑️  Limpiando tabla...${NC}"
        
        # Scan y delete todos los items
        aws dynamodb scan \
            --table-name "poc-api-wa-dev-idempotency" \
            --region "$REGION" \
            --output json | \
        jq -r '.Items[] | .messageId.S' | \
        while read -r msg_id; do
            aws dynamodb delete-item \
                --table-name "poc-api-wa-dev-idempotency" \
                --key "{\"messageId\":{\"S\":\"$msg_id\"}}" \
                --region "$REGION" > /dev/null
            echo "   Eliminado: $msg_id"
        done
        
        echo -e "${GREEN}✅ Tabla limpiada${NC}"
    else
        echo -e "${YELLOW}❌ Operación cancelada${NC}"
    fi
}

# Loop principal
while true; do
    show_menu
    read -r option
    
    case $option in
        1) test_without_idempotency ;;
        2) test_with_idempotency ;;
        3) test_comparative ;;
        4) toggle_idempotency_menu ;;
        5) show_logs_menu ;;
        6) show_metrics_menu ;;
        7) verify_message_menu ;;
        8) clear_idempotency_table ;;
        0)
            echo -e "${GREEN}👋 ¡Hasta luego!${NC}"
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
