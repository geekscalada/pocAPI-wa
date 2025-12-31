import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import crypto from 'crypto';
import { getAuthKey, getJwtSecret } from './utils/secretCache.js';

const db = new DynamoDBClient({});

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
		const headers = event.headers || {};
		const providedAuthKey = (headers['x-auth-key'] || headers['X-Auth-Key'] || headers['x-authkey'] || headers['X-AuthKey'] || '') as string;

		// Path 1: auth key header => mint JWT (no DynamoDB)
		if (providedAuthKey) {
			const expectedAuthKey = await getAuthKey();
			if (providedAuthKey !== expectedAuthKey) {
				return { statusCode: 401, body: JSON.stringify({ error: 'invalid auth key' }) };
			}

			const secret = await getJwtSecret();
			const now = Math.floor(Date.now() / 1000);
			const payload = { sub: 'auth-key', iat: now, exp: now + 3600, method: 'auth-key' };
			const token = signJwt(payload, secret);
			return { statusCode: 200, body: JSON.stringify({ token }) };
		}

		const body = JSON.parse(event.body || '{}');
		const { username, password } = body as any;
		if (!username || !password) {
			return { statusCode: 400, body: JSON.stringify({ error: 'username/password required OR provide x-auth-key header' }) };
		}

		if (!process.env.USERS_TABLE) {
			return { statusCode: 500, body: JSON.stringify({ error: 'USERS_TABLE not configured' }) };
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

		// Obtener secreto JWT (con caché - solo cold start accede a Secrets Manager)
		const secret = await getJwtSecret();

		const now = Math.floor(Date.now() / 1000);
		const payload = { sub: username, iat: now, exp: now + 3600 };
		const token = signJwt(payload, secret);

		return { statusCode: 200, body: JSON.stringify({ token }) };
	} catch (err) {
		console.error('Login error', err);
		return { statusCode: 500, body: JSON.stringify({ error: 'internal_error' }) };
	}
};

