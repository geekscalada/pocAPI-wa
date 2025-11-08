import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import crypto from 'crypto';
import { getJwtSecret } from './utils/secretCache.js';

function base64urlDecode(str: string) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

function verifyJwt(token: string, secret: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(headerB64 + '.' + payloadB64).digest('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (expected !== sig) return false;
    const payload = JSON.parse(base64urlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return false;
    return payload;
  } catch (e) {
    return false;
  }
}

function generatePolicy(principalId: string, effect: 'Allow' | 'Deny', resource: string, context?: Record<string, any>): APIGatewayAuthorizerResult {
  const policy: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }]
    }
  };
  if (context) policy.context = context;
  return policy;
}

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  console.log('Authorizer invoked for:', event.methodArn);
  
  try {
    const token = (event.authorizationToken || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      console.log('No token provided');
      return generatePolicy('anonymous', 'Deny', event.methodArn);
    }

    // Obtener secreto JWT (con caché - solo cold start accede a Secrets Manager)
    const secret = await getJwtSecret();

    const payload: any = verifyJwt(token, secret);
    if (!payload) {
      console.log('Invalid token');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    console.log('Token validated for user:', payload.sub);
    
    // 🔧 FIX: Usar wildcard en el resource para permitir todos los métodos del API
    // event.methodArn ejemplo: arn:aws:execute-api:region:account:api-id/stage/METHOD/resource
    // Convertir a: arn:aws:execute-api:region:account:api-id/stage/*/*
    const arnParts = event.methodArn.split('/');
    const apiGatewayArnPrefix = arnParts.slice(0, 2).join('/'); // arn:aws:execute-api:region:account:api-id/stage
    const resourceWildcard = `${apiGatewayArnPrefix}/*/*`;
    
    return generatePolicy(payload.sub || 'user', 'Allow', resourceWildcard, { username: payload.sub });
  } catch (err) {
    console.error('Authorizer error', err);
    return generatePolicy('error', 'Deny', event.methodArn);
  }
};
