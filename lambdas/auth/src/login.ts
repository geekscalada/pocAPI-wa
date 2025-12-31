import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({});

const corsHeaders = {
	'Content-Type': 'application/json',
	'Access-Control-Allow-Origin': '*',
};

export const handler: APIGatewayProxyHandler = async (event) => {
	try {
		const body = JSON.parse(event.body || '{}');
		const { username, password } = body as any;
		if (!username || !password) {
			return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'username and password required' }) };
		}

		if (!process.env.USERS_TABLE) {
			return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'USERS_TABLE not configured' }) };
		}

		const getCmd = new GetItemCommand({ TableName: process.env.USERS_TABLE, Key: { username: { S: String(username) } } });
		const res = await db.send(getCmd);
		if (!res.Item || !res.Item.password || !res.Item.password.S) {
			return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'invalid credentials' }) };
		}

		const stored = res.Item.password.S;
		if (stored !== String(password)) {
			return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'invalid credentials' }) };
		}

		return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, username: String(username) }) };
	} catch (err) {
		console.error('Login error', err);
		return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'internal_error' }) };
	}
};

