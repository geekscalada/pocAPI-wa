#!/bin/bash

# 🔍 Monitor SQS - Visualiza mensajes en cola en tiempo real
# Uso: ./monitor-sqs.sh [region]

set -e

REGION=${1:-us-east-1}
PROJECT="poc-api-wa"
ENV="dev"

MAIN_QUEUE_NAME="${PROJECT}-${ENV}-main-queue"
DLQ_NAME="${PROJECT}-${ENV}-dlq"

echo "🔍 SQS Monitor - Real Time Queue Viewer"
echo "========================================"
echo "Region: $REGION"
echo "Main Queue: $MAIN_QUEUE_NAME"
echo "DLQ: $DLQ_NAME"
echo ""

# Obtener URLs de las colas
echo "📡 Obteniendo URLs de las colas..."
MAIN_QUEUE_URL=$(aws sqs get-queue-url --queue-name "$MAIN_QUEUE_NAME" --region "$REGION" --query 'QueueUrl' --output text 2>/dev/null || echo "")
DLQ_URL=$(aws sqs get-queue-url --queue-name "$DLQ_NAME" --region "$REGION" --query 'QueueUrl' --output text 2>/dev/null || echo "")

if [ -z "$MAIN_QUEUE_URL" ]; then
    echo "❌ No se encontró la cola principal: $MAIN_QUEUE_NAME"
    exit 1
fi

echo "✅ Main Queue URL: $MAIN_QUEUE_URL"
echo "✅ DLQ URL: $DLQ_URL"
echo ""

# Función para obtener atributos de la cola
get_queue_stats() {
    local queue_url=$1
    local queue_name=$2
    
    attrs=$(aws sqs get-queue-attributes \
        --queue-url "$queue_url" \
        --attribute-names All \
        --region "$REGION" \
        --output json)
    
    visible=$(echo "$attrs" | jq -r '.Attributes.ApproximateNumberOfMessages // "0"')
    not_visible=$(echo "$attrs" | jq -r '.Attributes.ApproximateNumberOfMessagesNotVisible // "0"')
    delayed=$(echo "$attrs" | jq -r '.Attributes.ApproximateNumberOfMessagesDelayed // "0"')
    
    echo "📊 $queue_name:"
    echo "   📬 Mensajes disponibles: $visible"
    echo "   🔒 Mensajes en procesamiento: $not_visible"
    echo "   ⏰ Mensajes retrasados: $delayed"
}

# Función para ver mensajes sin eliminarlos (peek)
peek_messages() {
    local queue_url=$1
    local max_messages=${2:-10}
    
    echo ""
    echo "👀 Peeking mensajes (sin eliminar, max $max_messages)..."
    
    messages=$(aws sqs receive-message \
        --queue-url "$queue_url" \
        --max-number-of-messages "$max_messages" \
        --attribute-names All \
        --message-attribute-names All \
        --region "$REGION" \
        --output json 2>/dev/null || echo '{"Messages":[]}')
    
    count=$(echo "$messages" | jq '.Messages | length')
    
    if [ "$count" -eq 0 ]; then
        echo "   📭 No hay mensajes visibles en la cola"
        return
    fi
    
    echo "   📬 Encontrados $count mensajes:"
    echo ""
    
    echo "$messages" | jq -r '.Messages[] | 
        "   🆔 MessageId: \(.MessageId)\n" +
        "   📝 Body: \(.Body | fromjson | tostring)\n" +
        "   🔢 ReceiveCount: \(.Attributes.ApproximateReceiveCount)\n" +
        "   ⏰ FirstReceived: \(.Attributes.ApproximateFirstReceiveTimestamp | tonumber / 1000 | strftime("%Y-%m-%d %H:%M:%S"))\n" +
        "   ---"'
}

# Menú interactivo
show_menu() {
    echo ""
    echo "================================"
    echo "🎛️  Opciones:"
    echo "================================"
    echo "1) 📊 Ver estadísticas de colas"
    echo "2) 👀 Peek mensajes (Main Queue)"
    echo "3) 👀 Peek mensajes (DLQ)"
    echo "4) 🔄 Monitoreo continuo (cada 3s)"
    echo "5) 🗑️  Purgar Main Queue (eliminar todos)"
    echo "6) 🗑️  Purgar DLQ"
    echo "7) 📤 Enviar mensaje de prueba directo"
    echo "8) 🔍 Ver atributos detallados de la cola"
    echo "9) 📋 Ver configuración completa"
    echo "0) 🚪 Salir"
    echo ""
    echo -n "Selecciona una opción: "
}

# Función de monitoreo continuo
continuous_monitor() {
    echo "🔄 Modo monitoreo continuo (Ctrl+C para salir)"
    echo ""
    
    while true; do
        clear
        echo "🔍 SQS Monitor - $(date '+%Y-%m-%d %H:%M:%S')"
        echo "========================================"
        get_queue_stats "$MAIN_QUEUE_URL" "Main Queue"
        echo ""
        get_queue_stats "$DLQ_URL" "Dead Letter Queue"
        echo ""
        echo "Presiona Ctrl+C para volver al menú"
        sleep 3
    done
}

# Función para ver atributos detallados
show_detailed_attributes() {
    local queue_url=$1
    local queue_name=$2
    
    echo ""
    echo "🔍 Atributos detallados de: $queue_name"
    echo "========================================"
    
    aws sqs get-queue-attributes \
        --queue-url "$queue_url" \
        --attribute-names All \
        --region "$REGION" \
        --output json | jq '.Attributes' | jq -r 'to_entries[] | "   \(.key): \(.value)"'
}

# Función para ver configuración completa
show_full_config() {
    echo ""
    echo "📋 Configuración Completa del Sistema SQS"
    echo "========================================"
    
    echo ""
    echo "🎯 Main Queue Configuration:"
    aws sqs get-queue-attributes \
        --queue-url "$MAIN_QUEUE_URL" \
        --attribute-names All \
        --region "$REGION" \
        --output json | jq '{
            QueueArn: .Attributes.QueueArn,
            VisibilityTimeout: .Attributes.VisibilityTimeout,
            MessageRetentionPeriod: .Attributes.MessageRetentionPeriod,
            ReceiveMessageWaitTimeSeconds: .Attributes.ReceiveMessageWaitTimeSeconds,
            MaximumMessageSize: .Attributes.MaximumMessageSize,
            DelaySeconds: .Attributes.DelaySeconds,
            RedrivePolicy: (.Attributes.RedrivePolicy | fromjson)
        }'
    
    echo ""
    echo "💀 Dead Letter Queue Configuration:"
    aws sqs get-queue-attributes \
        --queue-url "$DLQ_URL" \
        --attribute-names All \
        --region "$REGION" \
        --output json | jq '{
            QueueArn: .Attributes.QueueArn,
            VisibilityTimeout: .Attributes.VisibilityTimeout,
            MessageRetentionPeriod: .Attributes.MessageRetentionPeriod,
            ApproximateNumberOfMessages: .Attributes.ApproximateNumberOfMessages
        }'
}

# Función para enviar mensaje de prueba
send_test_message() {
    echo ""
    echo "📤 Enviar mensaje de prueba directo a SQS"
    echo -n "Ingresa el mensaje (JSON): "
    read -r message
    
    if [ -z "$message" ]; then
        message='{"event":"DIRECT_SQS_TEST","id":"test-'$(date +%s)'","data":{"direct":true}}'
        echo "Usando mensaje por defecto: $message"
    fi
    
    result=$(aws sqs send-message \
        --queue-url "$MAIN_QUEUE_URL" \
        --message-body "$message" \
        --region "$REGION" \
        --output json)
    
    msg_id=$(echo "$result" | jq -r '.MessageId')
    echo "✅ Mensaje enviado! MessageId: $msg_id"
}

# Función para purgar cola
purge_queue() {
    local queue_url=$1
    local queue_name=$2
    
    echo ""
    echo "⚠️  ¿Estás seguro de querer purgar $queue_name? (s/N): "
    read -r confirm
    
    if [ "$confirm" = "s" ] || [ "$confirm" = "S" ]; then
        aws sqs purge-queue \
            --queue-url "$queue_url" \
            --region "$REGION"
        echo "✅ Cola purgada!"
    else
        echo "❌ Operación cancelada"
    fi
}

# Loop principal
while true; do
    show_menu
    read -r option
    
    case $option in
        1)
            clear
            get_queue_stats "$MAIN_QUEUE_URL" "Main Queue"
            echo ""
            get_queue_stats "$DLQ_URL" "Dead Letter Queue"
            ;;
        2)
            peek_messages "$MAIN_QUEUE_URL" 10
            ;;
        3)
            peek_messages "$DLQ_URL" 10
            ;;
        4)
            continuous_monitor
            ;;
        5)
            purge_queue "$MAIN_QUEUE_URL" "Main Queue"
            ;;
        6)
            purge_queue "$DLQ_URL" "DLQ"
            ;;
        7)
            send_test_message
            ;;
        8)
            echo ""
            echo "1) Main Queue"
            echo "2) DLQ"
            echo -n "Selecciona: "
            read -r queue_choice
            if [ "$queue_choice" = "1" ]; then
                show_detailed_attributes "$MAIN_QUEUE_URL" "Main Queue"
            else
                show_detailed_attributes "$DLQ_URL" "DLQ"
            fi
            ;;
        9)
            show_full_config
            ;;
        0)
            echo "👋 ¡Hasta luego!"
            exit 0
            ;;
        *)
            echo "❌ Opción inválida"
            ;;
    esac
    
    echo ""
    echo -n "Presiona Enter para continuar..."
    read -r
done
