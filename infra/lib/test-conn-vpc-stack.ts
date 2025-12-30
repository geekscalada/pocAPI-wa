// import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import * as ec2 from 'aws-cdk-lib/aws-ec2';
// import * as iam from 'aws-cdk-lib/aws-iam';

// import { InfraProps } from '@infra/bin/app.js';

// export class TestConnVpcStack extends Stack {
//   constructor(scope: Construct, id: string, props: InfraProps) {
//     super(scope, id, props as StackProps);

//     const { projectName, environmentName } = props;

//     // Use VPCs exported in the app through context (expect VpcStack created before)
//     // The app will pass the VPC instances into this stack via context props if necessary.
//     // For flexibility, this stack expects the VPCs to be passed via props under `vpc1` and `vpc2`.
//     const anyProps: any = props as any;
//     const vpc1: ec2.IVpc = anyProps.vpc1;
//     const vpc2: ec2.IVpc = anyProps.vpc2;

//     if (!vpc1 || !vpc2) {
//       throw new Error('vpc1 and vpc2 must be provided in InfraProps when instantiating TestConnVpcStack');
//     }

//     // IAM role for EC2 to use SSM (no SSH required)
//     const instanceRole = new iam.Role(this, 'TestInstanceRole', {
//       assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
//       managedPolicies: [
//         iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
//       ],
//     });

//     // Security Groups: allow ICMP and ephemeral TCP from the 10.0.0.0/8 lab range
//     const labCidr = '10.0.0.0/8';

//     const sgVpc1 = new ec2.SecurityGroup(this, 'TestSgVpc1', {
//       vpc: vpc1,
//       allowAllOutbound: true,
//       securityGroupName: `${projectName}-${environmentName}-test-sg-vpc1`,
//     });

//     sgVpc1.addIngressRule(ec2.Peer.ipv4(labCidr), ec2.Port.icmpPing(), 'Allow ICMP from lab');
//     sgVpc1.addIngressRule(ec2.Peer.ipv4(labCidr), ec2.Port.tcpRange(1, 65535), 'Allow TCP from lab');

//     const sgVpc2 = new ec2.SecurityGroup(this, 'TestSgVpc2', {
//       vpc: vpc2,
//       allowAllOutbound: true,
//       securityGroupName: `${projectName}-${environmentName}-test-sg-vpc2`,
//     });

//     sgVpc2.addIngressRule(ec2.Peer.ipv4(labCidr), ec2.Port.icmpPing(), 'Allow ICMP from lab');
//     sgVpc2.addIngressRule(ec2.Peer.ipv4(labCidr), ec2.Port.tcpRange(1, 65535), 'Allow TCP from lab');

//     const ami = ec2.MachineImage.latestAmazonLinux();

//     // Launch instance in private subnets (PRIVATE_WITH_EGRESS)
//     const instanceVpc1 = new ec2.Instance(this, 'TestInstanceVpc1', {
//       vpc: vpc1,
//       vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
//       instanceType: new ec2.InstanceType('t3.micro'),
//       machineImage: ami,
//       role: instanceRole,
//       securityGroup: sgVpc1,
//       associatePublicIpAddress: false,
//     });

//     const instanceVpc2 = new ec2.Instance(this, 'TestInstanceVpc2', {
//       vpc: vpc2,
//       vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
//       instanceType: new ec2.InstanceType('t3.micro'),
//       machineImage: ami,
//       role: instanceRole,
//       securityGroup: sgVpc2,
//       associatePublicIpAddress: false,
//     });

//     new CfnOutput(this, 'TestInstanceVpc1Id', {
//       value: instanceVpc1.instanceId,
//       exportName: `${projectName}-${environmentName}-TestInstanceVpc1Id`,
//     });

//     new CfnOutput(this, 'TestInstanceVpc1PrivateIp', {
//       value: instanceVpc1.instancePrivateIp,
//       exportName: `${projectName}-${environmentName}-TestInstanceVpc1PrivateIp`,
//     });

//     new CfnOutput(this, 'TestInstanceVpc2Id', {
//       value: instanceVpc2.instanceId,
//       exportName: `${projectName}-${environmentName}-TestInstanceVpc2Id`,
//     });

//     new CfnOutput(this, 'TestInstanceVpc2PrivateIp', {
//       value: instanceVpc2.instancePrivateIp,
//       exportName: `${projectName}-${environmentName}-TestInstanceVpc2PrivateIp`,
//     });

//     new CfnOutput(this, 'TestInstanceSgVpc1', {
//       value: sgVpc1.securityGroupId,
//       exportName: `${projectName}-${environmentName}-TestSgVpc1Id`,
//     });

//     new CfnOutput(this, 'TestInstanceSgVpc2', {
//       value: sgVpc2.securityGroupId,
//       exportName: `${projectName}-${environmentName}-TestSgVpc2Id`,
//     });
//   }
// }
