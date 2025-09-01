/**
 * JWT Token Utilities
 * Provides encoding and decoding functionality for JWT tokens
 */

/**
 * Decodes a JWT token without verification
 * @param {string} token - JWT token string
 * @returns {Object} Decoded token with header and payload
 */
export function decodeJWT(token) {
  try {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid token');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Decode header and payload
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    return {
      header,
      payload,
      signature: parts[2]
    };
  } catch (error) {
    throw new Error(`Failed to decode JWT: ${error.message}`);
  }
}

/**
 * Encodes a JWT token from header and payload
 * @param {Object} header - JWT header object
 * @param {Object} payload - JWT payload object
 * @param {string} signature - Original signature (we can't re-sign without secret)
 * @returns {string} Encoded JWT token
 */
export function encodeJWT(header, payload, signature = '') {
  try {
    // Base64URL encode header and payload
    const encodedHeader = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    const encodedPayload = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Return JWT with original signature (or empty if not provided)
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  } catch (error) {
    throw new Error(`Failed to encode JWT: ${error.message}`);
  }
}

/**
 * Signs a JWT token with a secret key
 * @param {Object} header - JWT header object
 * @param {Object} payload - JWT payload object
 * @param {string} secret - Secret key for signing (or private key for RSA)
 * @param {string} algorithm - Algorithm to use (default: HS256)
 * @returns {Promise<string>} Signed JWT token
 */
export async function signJWT(header, payload, secret, algorithm = 'HS256') {
  try {
    // Ensure algorithm in header matches
    const finalHeader = { ...header, alg: algorithm, typ: 'JWT' };
    
    // Base64URL encode header and payload
    const encodedHeader = btoa(JSON.stringify(finalHeader))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    const encodedPayload = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    
    // Create signature based on algorithm
    let signature = '';
    const encoder = new TextEncoder();
    
    if (algorithm === 'HS256') {
      // Use Web Crypto API for HMAC-SHA256
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(dataToSign)
      );
      
      // Convert to base64url
      signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
        
    } else if (algorithm === 'RS256') {
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
          hash: 'SHA-256'
        },
        false,
        ['sign']
      );
      
      // Sign the data
      const signatureBuffer = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        encoder.encode(dataToSign)
      );
      
      // Convert to base64url
      signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
        
    } else {
      throw new Error(`Algorithm ${algorithm} not supported. Only HS256 and RS256 are currently supported.`);
    }

    return `${dataToSign}.${signature}`;
  } catch (error) {
    throw new Error(`Failed to sign JWT: ${error.message}`);
  }
}

/**
 * Checks if a string is a valid JWT token
 * @param {string} value - String to check
 * @returns {boolean} True if valid JWT format
 */
export function isJWT(value) {
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
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    // Check if header has typical JWT fields
    return header && typeof header === 'object' && 
           (header.alg || header.typ === 'JWT');
  } catch {
    return false;
  }
}

/**
 * Formats JSON for display
 * @param {Object} obj - Object to format
 * @returns {string} Formatted JSON string
 */
export function formatJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

/**
 * Validates JWT structure after editing
 * @param {string} jsonString - JSON string to validate
 * @returns {Object} Parsed JSON or throws error
 */
export function validateJSON(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

/**
 * Gets JWT expiration status
 * @param {Object} payload - JWT payload
 * @returns {Object} Expiration info
 */
export function getJWTExpiration(payload) {
  if (!payload || !payload.exp) {
    return { hasExpiration: false };
  }

  const exp = payload.exp * 1000; // Convert to milliseconds
  const now = Date.now();
  const isExpired = exp < now;
  const expiresAt = new Date(exp);
  
  return {
    hasExpiration: true,
    isExpired,
    expiresAt,
    expiresIn: exp - now
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
  permissions: 'Permissions'
};