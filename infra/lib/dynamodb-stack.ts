import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentProps } from '../bin/app.js';

export class DynamoDBStack extends Stack {
  /** Exposed so other stacks (e.g. Lambda) can reference the table */
  readonly conversationsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: EnvironmentProps) {
    super(scope, id, props);

    const { projectName, environmentName } = props;
    const tableName = `${projectName}-${environmentName}-conversations`;

    this.conversationsTable = new dynamodb.Table(this, 'ConversationsTable', {
      tableName,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Lab-safe: table is destroyed on stack removal so we never leave orphaned resources.
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // GSI1 — AP1 / AP2: by officeId + curstat + date
    this.conversationsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2 — AP3: by officeId + motive + date
    this.conversationsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3 — AP4 / AP5: by businessLine (+ subBusinessLine) + date
    this.conversationsTable.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: { name: 'GSI3PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI3SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI4 — AP6 / AP7: by officeId + agentId + curstat + date
    this.conversationsTable.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: { name: 'GSI4PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI4SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new CfnOutput(this, 'ConversationsTableName', {
      value: this.conversationsTable.tableName,
      exportName: `${projectName}-${environmentName}-conversations-table-name`,
    });

    new CfnOutput(this, 'ConversationsTableArn', {
      value: this.conversationsTable.tableArn,
      exportName: `${projectName}-${environmentName}-conversations-table-arn`,
    });
  }
}
