import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sns from "aws-cdk-lib/aws-sns";

export class SnsTestStack extends Stack {
  public readonly testTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Topic name without slashes - 🚨 FIFO habilitado para suscripción con SQS FIFO
    this.testTopic = new sns.Topic(this, "TestTopic", {
      topicName: "test.fifo",             // 🚨 FIFO requiere sufijo .fifo
      fifo: true,                         // ✅ Habilitado para compatibilidad con SQS FIFO
      contentBasedDeduplication: true     // ✅ Deduplicación automática
    });

    new CfnOutput(this, "TestTopicArn", {
      value: this.testTopic.topicArn,
      exportName: "TestTopicArn",
    });
  }
}
