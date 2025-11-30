#!/bin/bash

echo "🔍 Diagnóstico de integración API Gateway -> SQS"
echo "================================================"
echo ""

# Obtener el nombre de la cola
QUEUE_NAME="pocAPI-wa-dev-api-direct-queue"
echo "📋 Cola objetivo: $QUEUE_NAME"

# Obtener la URL de la cola
QUEUE_URL=$(aws sqs list-queues --region eu-west-1 --queue-name-prefix "$QUEUE_NAME" --query 'QueueUrls[0]' --output text 2>/dev/null)

if [ -z "$QUEUE_URL" ] || [ "$QUEUE_URL" == "None" ]; then
    echo "❌ No se encontró la cola $QUEUE_NAME"
    exit 1
fi

echo "✅ URL de la cola: $QUEUE_URL"
echo ""

# Ver atributos de la cola
echo "📊 Atributos de la cola:"
aws sqs get-queue-attributes \
    --region eu-west-1 \
    --queue-url "$QUEUE_URL" \
    --attribute-names All \
    --query 'Attributes.{
        ApproximateNumberOfMessages: ApproximateNumberOfMessages,
        ApproximateNumberOfMessagesNotVisible: ApproximateNumberOfMessagesNotVisible,
        ApproximateNumberOfMessagesDelayed: ApproximateNumberOfMessagesDelayed
    }' \
    --output table

echo ""

# Intentar leer un mensaje sin eliminarlo (peek)
echo "👀 Intentando leer mensajes (peek):"
MESSAGE=$(aws sqs receive-message \
    --region eu-west-1 \
    --queue-url "$QUEUE_URL" \
    --max-number-of-messages 1 \
    --visibility-timeout 0 \
    2>/dev/null)

if [ -z "$MESSAGE" ] || [ "$MESSAGE" == "{}" ]; then
    echo "❌ No hay mensajes en la cola"
else
    echo "✅ Mensaje encontrado:"
    echo "$MESSAGE" | jq -r '.Messages[0].Body'
fi

echo ""
echo "🔍 Verificando logs del consumer Lambda:"
LOG_GROUP="/aws/lambda/pocAPI-wa-dev-api-direct-consumer"

LATEST_STREAM=$(aws logs describe-log-streams \
    --region eu-west-1 \
    --log-group-name "$LOG_GROUP" \
    --order-by LastEventTime \
    --descending \
    --max-items 1 \
    --query 'logStreams[0].logStreamName' \
    --output text 2>/dev/null)

if [ -n "$LATEST_STREAM" ] && [ "$LATEST_STREAM" != "None" ]; then
    echo "📋 Últimas 10 líneas del log:"
    aws logs get-log-events \
        --region eu-west-1 \
        --log-group-name "$LOG_GROUP" \
        --log-stream-name "$LATEST_STREAM" \
        --limit 10 \
        --query 'events[*].message' \
        --output text
else
    echo "❌ No hay logs recientes en el consumer"
fi

echo ""
echo "✅ Diagnóstico completado"
