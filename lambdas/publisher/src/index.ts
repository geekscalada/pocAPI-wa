// Publisher Lambda - Envía eventos a SNS desde API Gateway
import { SNSClient, PublishCommand, MessageAttributeValue } from "@aws-sdk/client-sns";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";

const sns = new SNSClient({});

type SnsAttributes = Record<string, MessageAttributeValue>;

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  console.log('Publisher - Request:', JSON.stringify(event));
  
  try {
    // Parse body
    const body = JSON.parse(event.body || '{}');
    const { 
      eventType = 'TEST_EVENT', 
      id, 
      data, 
      shouldFail = false,
      subject,
      messageGroupId  // 🚨 NUEVO: Para FIFO
    } = body;
    
    // Construir payload
    const payload = {
      event: eventType,
      id: id || `test-${Date.now()}`,
      data: data || { test: true, timestamp: new Date().toISOString() },
      source: 'testing-api',
      shouldFail
    };
    
    // Preparar atributos del mensaje
    const attributes: SnsAttributes = {
      eventType: { DataType: 'String', StringValue: eventType },
      source: { DataType: 'String', StringValue: 'testing-api' },
      testMode: { DataType: 'String', StringValue: 'true' }
    };
    
    if (shouldFail) {
      attributes.forceError = { DataType: 'String', StringValue: 'true' };
    }
    
    // 🚨 FIFO: MessageGroupId es un parámetro directo del PublishCommand, no un MessageAttribute
    const publishParams: any = {
      TopicArn: process.env.TOPIC_TEST_ARN!,
      Message: JSON.stringify(payload),
      Subject: subject || `Event: ${eventType}`,
      MessageAttributes: attributes
    };
    
    // Añadir MessageGroupId si se proporciona (requerido para topics FIFO)
    if (messageGroupId) {
      publishParams.MessageGroupId = messageGroupId;
      console.log(`📦 FIFO - MessageGroupId: ${messageGroupId}`);
    }
    
    // Publicar a SNS
    const command = new PublishCommand(publishParams);
    
    const result = await sns.send(command);
    console.log('Message sent to SNS:', result.MessageId);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        messageId: result.MessageId,
        payload: payload,
        message: `Event "${eventType}" sent successfully to SNS`
      })
    };
    
  } catch (error) {
    console.error('Publisher error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to send event to SNS'
      })
    };
  }
};


