// import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import * as ec2 from 'aws-cdk-lib/aws-ec2';

// import { InfraProps } from '@infra/bin/app.js';

// export class VpcStack extends Stack {
//   public readonly vpc1: ec2.Vpc;
//   public readonly vpc2: ec2.Vpc;
//   public readonly transitGateway: ec2.CfnTransitGateway;

//   constructor(scope: Construct, id: string, props: InfraProps) {
//     super(scope, id, props as StackProps);

//     const { projectName, environmentName } = props;

//     // VPC-A: donde viven lambdas, colas, ALB, etc.
//     this.vpc1 = new ec2.Vpc(this, 'Vpc1', {
//       vpcName: `${projectName}-${environmentName}-vpc1`,
//       ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
//       maxAzs: 2,
//       natGateways: 1,
//       subnetConfiguration: [
//         {
//           name: 'public',
//           subnetType: ec2.SubnetType.PUBLIC,
//           cidrMask: 24,
//         },
//         {
//           name: 'private-app',
//           subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
//           cidrMask: 24,
//         },
//       ],
//     });

//     new CfnOutput(this, 'Vpc1Id', {
//       value: this.vpc1.vpcId,
//       exportName: `${projectName}-${environmentName}-Vpc1Id`,
//     });

//     // VPC-B: VPC "cliente" para pruebas de conectividad
//     this.vpc2 = new ec2.Vpc(this, 'Vpc2', {
//       vpcName: `${projectName}-${environmentName}-vpc2`,
//       ipAddresses: ec2.IpAddresses.cidr('10.1.0.0/16'),
//       maxAzs: 2,
//       natGateways: 1,
//       subnetConfiguration: [
//         {
//           name: 'public',
//           subnetType: ec2.SubnetType.PUBLIC,
//           cidrMask: 24,
//         },
//         {
//           name: 'private-app',
//           subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
//           cidrMask: 24,
//         },
//       ],
//     });

//     new CfnOutput(this, 'Vpc2Id', {
//       value: this.vpc2.vpcId,
//       exportName: `${projectName}-${environmentName}-Vpc2Id`,
//     });

//     // Transit Gateway para interconectar VPCs del laboratorio
//     this.transitGateway = new ec2.CfnTransitGateway(this, 'TransitGateway', {
//       description: `${projectName}-${environmentName}-tgw`,
//       dnsSupport: 'enable',
//       vpnEcmpSupport: 'enable',
//       defaultRouteTableAssociation: 'enable',
//       defaultRouteTablePropagation: 'enable',
//       multicastSupport: 'disable',
//       autoAcceptSharedAttachments: 'disable',
//     });

//     const privateSubnetsVpc1 = this.vpc1.selectSubnets({
//       subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
//     }).subnets;

//     const attachmentVpc1 = new ec2.CfnTransitGatewayVpcAttachment(this, 'TgwVpc1Attachment', {
//       transitGatewayId: this.transitGateway.ref,
//       vpcId: this.vpc1.vpcId,
//       subnetIds: privateSubnetsVpc1.map((s) => s.subnetId),
//     });

//     attachmentVpc1.addDependency(this.transitGateway);

//     // Attachment de la VPC-B al mismo TGW
//     const privateSubnetsVpc2 = this.vpc2.selectSubnets({
//       subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
//     }).subnets;

//     const attachmentVpc2 = new ec2.CfnTransitGatewayVpcAttachment(this, 'TgwVpc2Attachment', {
//       transitGatewayId: this.transitGateway.ref,
//       vpcId: this.vpc2.vpcId,
//       subnetIds: privateSubnetsVpc2.map((s) => s.subnetId),
//     });

//     attachmentVpc2.addDependency(this.transitGateway);

//     // Routing entre VPC1 (10.0.0.0/16) y VPC2 (10.1.0.0/16) vía TGW
//     // NOTA: El siguiente bloque se ha dejado comentado porque al tener
//     // defaultRouteTableAssociation/defaultRouteTablePropagation habilitados
//     // el TGW ya asocia los attachments a su tabla de rutas por defecto.
//     // Intentar asociarlos de nuevo provoca errores "AlreadyExists".
//     //
//     // Si en el futuro quieres usar una route table dedicada del TGW,
//     // puedes reactivar este bloque, pero recuerda desactivar la asociación
//     // por defecto o mover los attachments explícitamente.
//     //
//     // const tgwRouteTable = new ec2.CfnTransitGatewayRouteTable(this, 'TransitGatewayRouteTable', {
//     //   transitGatewayId: this.transitGateway.ref,
//     // });
//     //
//     // const associationVpc1 = new ec2.CfnTransitGatewayRouteTableAssociation(this, 'TgwRtAssocVpc1', {
//     //   transitGatewayAttachmentId: attachmentVpc1.ref,
//     //   transitGatewayRouteTableId: tgwRouteTable.ref,
//     // });
//     //
//     // const associationVpc2 = new ec2.CfnTransitGatewayRouteTableAssociation(this, 'TgwRtAssocVpc2', {
//     //   transitGatewayAttachmentId: attachmentVpc2.ref,
//     //   transitGatewayRouteTableId: tgwRouteTable.ref,
//     // });
//     //
//     // new ec2.CfnTransitGatewayRoute(this, 'RouteToVpc1', {
//     //   transitGatewayRouteTableId: tgwRouteTable.ref,
//     //   destinationCidrBlock: '10.0.0.0/16',
//     //   transitGatewayAttachmentId: attachmentVpc1.ref,
//     // }).addDependency(associationVpc1);
//     //
//     // new ec2.CfnTransitGatewayRoute(this, 'RouteToVpc2', {
//     //   transitGatewayRouteTableId: tgwRouteTable.ref,
//     //   destinationCidrBlock: '10.1.0.0/16',
//     //   transitGatewayAttachmentId: attachmentVpc2.ref,
//     // }).addDependency(associationVpc2);

//     // Rutas en las tablas de ruta de las subnets privadas de ambas VPC
//     privateSubnetsVpc1.forEach((subnet, index) => {
//       new ec2.CfnRoute(this, `Vpc1ToVpc2Route${index}`, {
//         routeTableId: subnet.routeTable.routeTableId,
//         destinationCidrBlock: '10.1.0.0/16',
//         transitGatewayId: this.transitGateway.ref,
//       }).addDependency(attachmentVpc2);
//     });

//     privateSubnetsVpc2.forEach((subnet, index) => {
//       new ec2.CfnRoute(this, `Vpc2ToVpc1Route${index}`, {
//         routeTableId: subnet.routeTable.routeTableId,
//         destinationCidrBlock: '10.0.0.0/16',
//         transitGatewayId: this.transitGateway.ref,
//       }).addDependency(attachmentVpc1);
//     });

//     new CfnOutput(this, 'TransitGatewayId', {
//       value: this.transitGateway.ref,
//       exportName: `${projectName}-${environmentName}-TransitGatewayId`,
//     });
//   }
// }
