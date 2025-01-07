import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { BUCKET_CONFIGS } from '../const/buckets';

export class InternalBucketsStack extends cdk.Stack {
  public readonly internalBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucketName = BUCKET_CONFIGS.internalPrivate.name;

    this.internalBucket = new s3.Bucket(this, 'InternalPrivateBucket', {
      bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Output
    new cdk.CfnOutput(this, 'BucketName', {
      value: bucketName,
      description: 'Nombre del bucket interno privado',
    });
  }
}
