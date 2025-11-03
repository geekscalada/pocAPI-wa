import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import crypto from 'crypto';

const db = new DynamoDBClient({});
const sm = new SecretsManagerClient({});

function base64url(input: string) {
	return Buffer.from(input).toString('base64')
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
}

function signJwt(payload: any, secret: string) {
	const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const body = base64url(JSON.stringify(payload));
	const signature = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64')
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
	return `${header}.${body}.${signature}`;
}

export const handler: APIGatewayProxyHandler = async (event) => {
	try {
		const body = JSON.parse(event.body || '{}');
		const { username, password } = body as any;
		if (!username || !password) {
			return { statusCode: 400, body: JSON.stringify({ error: 'username and password required' }) };
		}

		const getCmd = new GetItemCommand({ TableName: process.env.USERS_TABLE, Key: { username: { S: username } } });
		const res = await db.send(getCmd);
		if (!res.Item || !res.Item.password || !res.Item.password.S) {
			return { statusCode: 401, body: JSON.stringify({ error: 'invalid credentials' }) };
		}

		const stored = res.Item.password.S;
		if (stored !== password) {
			return { statusCode: 401, body: JSON.stringify({ error: 'invalid credentials' }) };
		}

    // Obtener secreto JWT desde Secrets Manager
    const secretRes = await sm.send(
      new GetSecretValueCommand({ SecretId: process.env.JWT_SECRET_ARN! })
    );
    
    const secretString = secretRes.SecretString || '{}';
    let parsed: any = {};
    
    try {
      parsed = JSON.parse(secretString);
    } catch (e) {
      parsed = {};
    }
    
    // Leer la key específica del secreto (jwtSecret)
    const secretKey = process.env.JWT_SECRET_KEY || 'jwtSecret';
    const secret = parsed[secretKey];
    
    if (!secret) {
      throw new Error('JWT secret not found in Secret-pipeline');
    }		const now = Math.floor(Date.now() / 1000);
		const payload = { sub: username, iat: now, exp: now + 3600 };
		const token = signJwt(payload, secret);

		return { statusCode: 200, body: JSON.stringify({ token }) };
	} catch (err) {
		console.error('Login error', err);
		return { statusCode: 500, body: JSON.stringify({ error: 'internal_error' }) };
	}
};

