// Minimal, typed, SDK v3
import { SNSClient, PublishCommand, MessageAttributeValue } from "@aws-sdk/client-sns";
import { APIGatewayEvent, Context } from "aws-lambda";



export const handler = async (context: Context, event: APIGatewayEvent) => {
  const sns = new SNSClient({}); // region via env or IAM default

   type SnsAttributes = Record<string, MessageAttributeValue>;

   async function publishToTestTopic(params: {
    topicArn: string;            // e.g. from CDK output or env
    message: string;             // JSON string or plain text
    subject?: string;
    attributes?: SnsAttributes;  // optional message attributes
  }) {
    // Keep payload small; SNS limit ~256 KB
    const cmd = new PublishCommand({
      TopicArn: params.topicArn,
      Message: params.message,
      Subject: params.subject,
      MessageAttributes: params.attributes
    });
    const res = await sns.send(cmd);
     console.log("PublishResponse:", res);            // <- Debe mostrar MessageId
  return { ok: true, messageId: res.MessageId ?? null, meta: res.$metadata }
  }

  // Example usage:
  await publishToTestTopic({
    topicArn: process.env.TOPIC_TEST_ARN!,
    message: JSON.stringify({ event: "USER_CREATED", id: "123" }),
    subject: "domain-event",
    attributes: {
      "eventType": { DataType: "String", StringValue: "USER_CREATED" }
    }
  });

 
};


