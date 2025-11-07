import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({});

// ⚡ Caché en memoria del secreto JWT (persiste entre invocaciones warm)
let cachedSecret: string | null = null;

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
  if (cachedSecret) {
    console.log('✅ JWT secret retrieved from cache (warm start)');
    return cachedSecret;
  }

  console.log('🔄 Cold start: fetching JWT secret from Secrets Manager');
  const secretArn = process.env.JWT_SECRET_ARN;
  const secretKey = process.env.JWT_SECRET_KEY || 'jwtSecret';

  if (!secretArn) {
    throw new Error('JWT_SECRET_ARN environment variable not configured');
  }

  const response = await sm.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  if (!response.SecretString) {
    throw new Error('Secret value is empty');
  }

  const parsed = JSON.parse(response.SecretString);
  const secret = parsed[secretKey];

  if (!secret) {
    throw new Error(`Key "${secretKey}" not found in secret`);
  }

  cachedSecret = secret;
  console.log('✅ JWT secret cached for future invocations');
  return secret;
}

/**
 * Limpia el caché (útil para testing o forzar recarga)
 */
export function clearSecretCache(): void {
  cachedSecret = null;
  console.log('🔄 Secret cache cleared');
}
