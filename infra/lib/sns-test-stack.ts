import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sns from "aws-cdk-lib/aws-sns";

export class SnsTestStack extends Stack {
  public readonly testTopic: sns.Topic;        // New FIFO topic used by new consumers
  public readonly legacyTopic: sns.Topic;      // Existing standard topic kept to preserve export

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 1) Mantener el tópico estándar existente (no FIFO) para no tocar el export actual
    //    Usa el mismo nombre físico previo ("test") para evitar reemplazos.
    this.legacyTopic = new sns.Topic(this, "LegacyTestTopic", {
      topicName: "test",
    });

    // 2) Crear un nuevo tópico FIFO para el nuevo flujo con SQS FIFO
    this.testTopic = new sns.Topic(this, "TestTopicFifo", {
      topicName: "test.fifo",
      fifo: true,
      contentBasedDeduplication: true,
    });

    // Mantener el export existente apuntando al tópico legacy (sin cambios de valor)
    new CfnOutput(this, "TestTopicArn", {
      value: this.legacyTopic.topicArn,
      exportName: "TestTopicArn",
    });
  }
}
