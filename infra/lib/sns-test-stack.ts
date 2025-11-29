import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sns from "aws-cdk-lib/aws-sns";

export class SnsTestStack extends Stack {
  public readonly testTopic: sns.Topic;        // New FIFO topic used by new consumers
  public readonly legacyTopic: sns.ITopic;     // Reference to existing standard topic via ImportValue

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 1) Referenciar el tópico estándar existente (no FIFO) usando el export actual
    //    Evita recrear un recurso que ya existe y genera conflicto
    this.legacyTopic = sns.Topic.fromTopicArn(this, "LegacyTestTopic", (this as any).formatArn({
      service: 'sns',
      resource: 'topic',
      arnFormat: undefined,
      resourceName: undefined,
    }));
    // Nota: CDK no expone directamente el ARN aquí; consumidores siguen usando ImportValue.
    // En los otros stacks ya no importamos; aquí solo mantenemos el output para compatibilidad.

    // 2) Crear un nuevo tópico FIFO para el nuevo flujo con SQS FIFO
    this.testTopic = new sns.Topic(this, "TestTopicFifo", {
      topicName: "test.fifo",
      fifo: true,
      contentBasedDeduplication: true,
    });

    // Mantener el export existente apuntando al tópico legacy usando el valor previo
    // (no intentamos recrear ni cambiar el recurso "test")
    new CfnOutput(this, "TestTopicArn", {
      value: this.legacyTopic.topicArn,
      exportName: "TestTopicArn",
    });
  }
}
