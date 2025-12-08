import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ram from 'aws-cdk-lib/aws-ram';

import { InfraProps } from '@infra/bin/app.js';

export class VpcStack extends Stack {
  public readonly vpc1: ec2.Vpc;
  public readonly transitGateway: ec2.CfnTransitGateway;

  constructor(scope: Construct, id: string, props: InfraProps) {
    super(scope, id, props as StackProps);

    const { projectName, environmentName } = props;

    this.vpc1 = new ec2.Vpc(this, 'Vpc1', {
      vpcName: `${projectName}-${environmentName}-vpc1`,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private-app',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    new CfnOutput(this, 'Vpc1Id', {
      value: this.vpc1.vpcId,
      exportName: `${projectName}-${environmentName}-Vpc1Id`,
    });

    // Transit Gateway para interconectar VPCs del laboratorio
    this.transitGateway = new ec2.CfnTransitGateway(this, 'TransitGateway', {
      description: `${projectName}-${environmentName}-tgw`,
      dnsSupport: 'enable',
      vpnEcmpSupport: 'enable',
      defaultRouteTableAssociation: 'enable',
      defaultRouteTablePropagation: 'enable',
      multicastSupport: 'disable',
      autoAcceptSharedAttachments: 'disable',
    });

    const privateSubnets = this.vpc1.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    }).subnets;

    const attachment = new ec2.CfnTransitGatewayVpcAttachment(this, 'TgwVpc1Attachment', {
      transitGatewayId: this.transitGateway.ref,
      vpcId: this.vpc1.vpcId,
      subnetIds: privateSubnets.map((s) => s.subnetId),
    });

    attachment.addDependency(this.transitGateway);

    new CfnOutput(this, 'TransitGatewayId', {
      value: this.transitGateway.ref,
      exportName: `${projectName}-${environmentName}-TransitGatewayId`,
    });
  }
}
