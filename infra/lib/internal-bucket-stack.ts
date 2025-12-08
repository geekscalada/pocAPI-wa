import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';
import { BUCKET_CONFIGS } from '../const/buckets.js';
import { InfraProps } from '@infra/bin/app.js';

export class InternalBucketStack extends cdk.Stack {
  public readonly internalPrivateBucket: s3.Bucket;
  public readonly redisSubnetGroup: elasticache.CfnSubnetGroup | undefined;
  public readonly redisCluster: elasticache.CfnCacheCluster | undefined;

  constructor(scope: Construct, id: string, props: InfraProps & { vpc?: ec2.IVpc }) {
    super(scope, id, props);

    const { projectName, environmentName, vpc } = props;
    const bucketName = `${projectName}-${environmentName}-${BUCKET_CONFIGS.internalPrivate.name}`;

    this.internalPrivateBucket = new s3.Bucket(this, 'InternalPrivateBucket', {
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

    // Redis ElastiCache en la VPC1 (si se proporciona una VPC)
    if (vpc) {
      const privateSubnets = vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }).subnets;

      this.redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
        description: `${projectName}-${environmentName}-redis-subnet-group`,
        subnetIds: privateSubnets.map((subnet) => subnet.subnetId),
        cacheSubnetGroupName: `${projectName}-${environmentName}-redis-subnet-group`,
      });

      this.redisCluster = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
        cacheNodeType: 'cache.t3.micro',
        engine: 'redis',
        numCacheNodes: 1,
        cacheSubnetGroupName: this.redisSubnetGroup.cacheSubnetGroupName!,
      });

      this.redisCluster.addDependency(this.redisSubnetGroup);

      new cdk.CfnOutput(this, 'RedisEndpoint', {
        value: this.redisCluster.attrRedisEndpointAddress,
        description: 'Endpoint del cluster Redis en VPC1',
      });
    }
  }
}
