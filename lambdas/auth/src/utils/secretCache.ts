import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({});

// ⚡ Caché en memoria del JSON del secreto (persiste entre invocaciones warm)
let cachedSecretJson: Record<string, any> | null = null;

async function getSecretJson(): Promise<Record<string, any>> {
  if (cachedSecretJson) {
    console.log('✅ Secret JSON retrieved from cache (warm start)');
    return cachedSecretJson;
  }

  console.log('🔄 Cold start: fetching secret JSON from Secrets Manager');
  const secretArn = process.env.JWT_SECRET_ARN;

  if (!secretArn) {
    throw new Error('JWT_SECRET_ARN environment variable not configured');
  }

  const response = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));

  if (!response.SecretString) {
    throw new Error('Secret value is empty');
  }

  cachedSecretJson = JSON.parse(response.SecretString);
  console.log('✅ Secret JSON cached for future invocations');
  return cachedSecretJson;
}

/**
 * Obtiene el secreto JWT desde Secrets Manager con caché en memoria.
 * 
 * Solo accede a Secrets Manager en cold starts (~150ms).
 * Warm starts usan caché en memoria (~0ms).
 * 
 * @returns El secreto JWT
 * @throws Error si el secreto no está configurado o no se encuentra
 */
export async function getJwtSecret(): Promise<string> {
  const secretKey = process.env.JWT_SECRET_KEY || 'jwtSecret';

  const parsed = await getSecretJson();

  // Back-compat: some stacks historically passed a different key name
  const secret = parsed[secretKey] ?? (secretKey !== 'jwtSecret' ? parsed.jwtSecret : undefined);

  if (!secret) {
    throw new Error(`Key "${secretKey}" not found in secret`);
  }

  console.log('✅ JWT secret read from cached secret JSON');
  return secret;
}

export async function getAuthKey(): Promise<string> {
  const authKeyField = process.env.AUTH_KEY_SECRET_KEY || 'authKey';
  const parsed = await getSecretJson();
  const key = parsed[authKeyField] ?? (authKeyField !== 'authKey' ? parsed.authKey : undefined);

  if (!key) {
    throw new Error(`Key "${authKeyField}" not found in secret`);
  }

  console.log('✅ Auth key read from cached secret JSON');
  return key;
}

/**
 * Limpia el caché (útil para testing o forzar recarga)
 */
export function clearSecretCache(): void {
  cachedSecretJson = null;
  console.log('🔄 Secret cache cleared');
}
