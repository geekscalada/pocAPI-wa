// import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
// import { Construct } from "constructs";
// import * as sns from "aws-cdk-lib/aws-sns";

// export class SnsTestStack extends Stack {
//   public readonly testTopic: sns.Topic;        // New FIFO topic used by new consumers
  

//   constructor(scope: Construct, id: string, props?: StackProps) {
//     super(scope, id, props);   

    
//     this.testTopic = new sns.Topic(this, "TestTopicFifo", {
//       topicName: "test.fifo",
//       fifo: true,
//       contentBasedDeduplication: false,
//     });    

    
//     const topic = new sns.Topic(this, "TestTopic", {
//       topicName: "test",
//       // fifo: true,             // uncomment if you need FIFO
//       // contentBasedDeduplication: true
//     });

//     new CfnOutput(this, "TestTopicArn", {
//       value: topic.topicArn,
//       exportName: "TestTopicArn",
//     });

//     new CfnOutput(this, "TestTopicFifoArn", {
//       value: this.testTopic.topicArn,
//       exportName: "TestTopicFifoArn",
//     });


//   }
// }
