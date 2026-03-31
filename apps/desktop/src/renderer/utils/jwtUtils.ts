/**
 * JWT Token Utilities
 * Provides encoding and decoding functionality for JWT tokens
 */

import type { JsonObject } from '@openheaders/core';
import { errorMessage } from '@openheaders/core';

/**
 * Decodes a JWT token without verification
 * @param token - JWT token string
 * @returns Decoded token with header and payload
 */
export function decodeJWT(token: string) {
  if (!token) {
    throw new Error('Failed to decode JWT: Invalid token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Failed to decode JWT: Invalid JWT format');
  }

  try {
    // Decode header and payload
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    return {
      header,
      payload,
      signature: parts[2],
    };
  } catch (error) {
    throw new Error(`Failed to decode JWT: ${errorMessage(error)}`);
  }
}

/**
 * Encodes a JWT token from header and payload
 * @param header - JWT header object
 * @param payload - JWT payload object
 * @param signature - Original signature (we can't re-sign without secret)
 * @returns Encoded JWT token
 */
export function encodeJWT(header: JsonObject, payload: JsonObject, signature = '') {
  try {
    // Base64URL encode header and payload
    const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Return JWT with original signature (or empty if not provided)
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  } catch (error) {
    throw new Error(`Failed to encode JWT: ${errorMessage(error)}`);
  }
}

/**
 * Signs a JWT token with a secret key
 * @param header - JWT header object
 * @param payload - JWT payload object
 * @param secret - Secret key for signing (or private key for RSA)
 * @param algorithm - Algorithm to use (default: HS256)
 * @returns Signed JWT token
 */
export async function signJWT(header: JsonObject, payload: JsonObject, secret: string, algorithm = 'HS256') {
  if (algorithm !== 'HS256' && algorithm !== 'RS256') {
    throw new Error(`Failed to sign JWT: Algorithm ${algorithm} not supported. Only HS256 and RS256 are currently supported.`);
  }

  try {
    // Ensure algorithm in header matches
    const finalHeader = { ...header, alg: algorithm, typ: 'JWT' };

    // Base64URL encode header and payload
    const encodedHeader = btoa(JSON.stringify(finalHeader)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    // Create signature based on algorithm
    let signature: string;
    const encoder = new TextEncoder();

    if (algorithm === 'HS256') {
      // Use Web Crypto API for HMAC-SHA256
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );

      const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(dataToSign));

      // Convert to base64url
      signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    } else {
      // RSA signing with SHA-256
      // Parse the PEM private key
      const pemContents = secret
        .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
        .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
        .replace(/\s/g, '');

      // Convert base64 to ArrayBuffer
      const binaryDer = atob(pemContents);
      const binaryDerArray = new Uint8Array(binaryDer.length);
      for (let i = 0; i < binaryDer.length; i++) {
        binaryDerArray[i] = binaryDer.charCodeAt(i);
      }

      // Import the private key
      const key = await crypto.subtle.importKey(
        'pkcs8',
        binaryDerArray.buffer,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
        },
        false,
        ['sign'],
      );

      // Sign the data
      const signatureBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(dataToSign));

      // Convert to base64url
      signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    }

    return `${dataToSign}.${signature}`;
  } catch (error) {
    throw new Error(`Failed to sign JWT: ${errorMessage(error)}`);
  }
}

/**
 * Checks if a string is a valid JWT token
 * @param value - String to check
 * @returns True if valid JWT format
 */
export function isJWT(value: string) {
  // Runtime guard: callers may pass non-string values via untyped boundaries
  // noinspection SuspiciousTypeOfGuard
  if (!value || typeof value !== 'string') {
    return false;
  }

  // Basic JWT format check: three parts separated by dots
  const parts = value.split('.');
  if (parts.length !== 3) {
    return false;
  }

  // Try to decode header and payload
  try {
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    // Validate payload is parseable
    JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    // Check if header has typical JWT fields
    return header && typeof header === 'object' && (header.alg || header.typ === 'JWT');
  } catch {
    return false;
  }
}

/**
 * Formats JSON for display
 * @param obj - Object to format
 * @returns Formatted JSON string
 */
export function formatJSON(obj: JsonObject) {
  return JSON.stringify(obj, null, 2);
}

/**
 * Validates JWT structure after editing
 * @param jsonString - JSON string to validate
 * @returns Parsed JSON or throws error
 */
export function validateJSON(jsonString: string) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON: ${errorMessage(error)}`);
  }
}

/**
 * Gets JWT expiration status
 * @param payload - JWT payload
 * @returns Expiration info
 */
export function getJWTExpiration(payload: JsonObject) {
  if (!payload?.exp) {
    return { hasExpiration: false };
  }

  const exp = (payload.exp as number) * 1000; // Convert to milliseconds
  const now = Date.now();
  const isExpired = exp < now;
  const expiresAt = new Date(exp);

  return {
    hasExpiration: true,
    isExpired,
    expiresAt,
    expiresIn: exp - now,
  };
}

/**
 * Common JWT claims descriptions
 */
export const JWT_CLAIM_DESCRIPTIONS = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expiration Time',
  nbf: 'Not Before',
  iat: 'Issued At',
  jti: 'JWT ID',
  // Common custom claims
  email: 'Email',
  name: 'Name',
  role: 'Role',
  scope: 'Scope',
  permissions: 'Permissions',
};
