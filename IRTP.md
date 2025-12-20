El plan para llevar a cabo test en el laboratorio en cuanto a redes, es el siguiente:

1. ¿Se puede tener 2 VPC en la misma cuenta enganchadas al mismo Transit Gateway?

Sí.
Un Transit Gateway es básicamente un router L3 regional que interconecta VPCs y on-prem (VPN / Direct Connect). Puedes adjuntar muchas VPC al mismo TGW siempre que sus CIDR no se solapen. 
AWS Documentation
+2
AWS Documentation
+2

Para tu caso de laboratorio:

Cuenta única

VPC-A y VPC-B (CIDRs distintos, p.ej. 10.0.0.0/16 y 10.1.0.0/16)

Un solo Transit Gateway con dos attachments: uno a cada VPC

Con las rutas y SG bien configurados, las instancias de ambas VPC se hablarán por IP privada a través del TGW sin salir a internet.

2. ¿Cómo encaja el ALB interno en todo esto?

Punto importante de modelo mental:

Un ALB siempre vive en UNA VPC (no puede “spanear” VPCs directamente).

Lo que lo hace “interno” es que solo tenga IPs privadas (scheme = internal).

El tráfico entre VPCs lo resuelve el TGW, no el ALB.

Con eso en mente, tienes dos patrones típicos:

Patrón A: ALB interno en VPC-A, clientes en VPC-B

Creas un ALB interno en la VPC-A.

Sus targets (EC2, ECS, etc.) también están en la VPC-A.

Las apps que viven en VPC-B llaman al DNS privado del ALB.

El tráfico:

VPC-B → (ruta hacia CIDR de VPC-A via TGW) → TGW → VPC-A → ALB → targets

Mientras:

el ALB sea interno,

y uses solo rutas privadas a través del TGW,

no sales a internet en ningún momento. Todo va por la red privada de AWS y el backbone interno. 
AWS Documentation
+1

Opcionalmente puedes poner un Route 53 Private Hosted Zone asociada a las dos VPC para usar un nombre bonito tipo api.interna.local que resuelva al ALB desde ambas VPC.

Patrón B (más avanzado): ALB en VPC-A con targets por IP en VPC-B

ALB permite target groups de tipo IP y registrar IPs privadas de otros entornos siempre que sean alcanzables (por ejemplo VPCs peered; el requisito oficial habla de VPCs emparejadas/peered, pero a nivel de red el punto clave es que haya routing y reachability). 
AWS Documentation

Para un lab sencillo yo no me complicaría con esto aún; es más fácil empezar con el Patrón A:

ALB y backends en la misma VPC

La otra VPC solo actúa como “cliente” a través del TGW

3. Pasos de alto nivel para tu POC (misma cuenta, 2 VPC, 1 TGW, ALB interno)
3.1. Red

Crea VPC-A (ej. 10.0.0.0/16) y VPC-B (ej. 10.1.0.0/16)

Asegúrate de que no se solapan los CIDR.

Crea un Transit Gateway (TGW) en la región.

Crea dos VPC attachments al TGW:

Attachment A ↔ VPC-A (elige un subnet por AZ)

Attachment B ↔ VPC-B 
AWS Documentation
+1

En la tabla de rutas del TGW, añade rutas:

Hacia 10.0.0.0/16 → attachment de VPC-A

Hacia 10.1.0.0/16 → attachment de VPC-B

En las route tables de las subnets donde tengas máquinas:

En VPC-A: ruta hacia 10.1.0.0/16 con destino = TGW

En VPC-B: ruta hacia 10.0.0.0/16 con destino = TGW

Con eso, cualquier IP de A ve a las de B y viceversa, por privado.

3.2. ALB interno + pruebas

En VPC-A:

Crea un par de EC2 (o ECS/Fargate) con un servidor web simple (nginx, httpd o lo que quieras).

Crea un Application Load Balancer interno:

Scheme: internal

Subnets privadas de VPC-A.

Crea un target group y registra las instancias de VPC-A.

Configura un listener HTTP/HTTPS que haga forward al target group.

Security Groups:

SG del ALB: inbound desde:

SG de las instancias client de VPC-A y VPC-B

o desde el rango de VPC-B (10.1.0.0/16) si quieres ir simple al principio.

SG de las instancias backend: inbound desde el SG del ALB.

En VPC-B:

Crea una EC2 “client” en una subnet asociada al TGW.

Desde esa instancia, haz:

curl http://<DNS-privado-del-ALB>
Si las rutas + SG están bien, deberías llegar al backend en VPC-A pasando por el TGW y el ALB, sin salir a internet.

Si quieres rizar el rizo, asocias una Private Hosted Zone de Route 53 a ambas VPCs y haces:

nombre api.interna.local → alias al ALB.

4. ¿Hace falta otra cuenta?

No.