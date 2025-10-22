import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sns from "aws-cdk-lib/aws-sns";

export class SnsTestStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Topic name without slashes
    const topic = new sns.Topic(this, "TestTopic", {
      topicName: "test",
      // fifo: true,             // uncomment if you need FIFO
      // contentBasedDeduplication: true
    });

    new CfnOutput(this, "TestTopicArn", {
      value: topic.topicArn,
      exportName: "TestTopicArn",
    });
  }
}
