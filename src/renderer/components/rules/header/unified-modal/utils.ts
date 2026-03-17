// Build header value based on mode and type
export const buildHeaderValue = (values, mode, valueType) => {
    if (mode === 'cookie') {
        return buildCookieValue(values, valueType === 'dynamic');
    }
    return values.headerValue || '';
};

// Parse header value based on mode
export const parseHeaderValue = (headerValue, mode) => {
    if (mode === 'cookie') {
        return parseCookieValue(headerValue);
    }
    return { value: headerValue };
};

// Build cookie value string
const buildCookieValue = (values, isDynamic = false) => {
    let cookieString;
    
    // Build name=value part
    if (isDynamic && values.sourceId) {
        // For dynamic values, we'll store a placeholder that gets replaced at runtime
        cookieString = `${values.cookieName}={{DYNAMIC_VALUE}}`;
    } else {
        cookieString = `${values.cookieName}=${values.cookieValue}`;
    }
    
    // Only add attributes for response cookies (Set-Cookie header)
    // Request cookies (Cookie header) only have name=value pairs
    if (values.headerType === 'response') {
        // Add path
        if (values.cookiePath && values.cookiePath !== '/') {
            cookieString += `; Path=${values.cookiePath}`;
        } else {
            cookieString += '; Path=/';
        }
        
        // Add expiration
        if (values.expirationMode === 'maxAge' && values.maxAge) {
            cookieString += `; Max-Age=${values.maxAge}`;
        } else if (values.expirationMode === 'expires' && values.expires) {
            // Convert the date to UTC string
            // Handle both dayjs objects and string/date values
            let expiresDate;
            if (values.expires.toDate) {
                // It's a dayjs object
                expiresDate = values.expires.toDate().toUTCString();
            } else {
                // It's a string or Date object
                expiresDate = new Date(values.expires).toUTCString();
            }
            cookieString += `; Expires=${expiresDate}`;
        }
        // Session cookies don't have Max-Age or Expires
        
        // Add SameSite
        if (values.sameSite) {
            cookieString += `; SameSite=${values.sameSite}`;
        }
        
        // Add Secure flag
        if (values.secure) {
            cookieString += '; Secure';
        }
        
        // Add HttpOnly flag
        if (values.httpOnly) {
            cookieString += '; HttpOnly';
        }
    }
    
    return cookieString;
};

// Parse cookie value from Set-Cookie header
const parseCookieValue = (cookieString) => {
    if (!cookieString) return {};
    
    const parts = cookieString.split(';').map(p => p.trim());
    const [nameValue, ...attributes] = parts;
    const [name, value] = (nameValue || '').split('=');
    
    const result = {
        name: name || '',
        value: value || '',
        path: '/',
        sameSite: 'Lax',
        secure: false,
        httpOnly: false,
        expirationMode: 'session'
    };
    
    attributes.forEach(attr => {
        const [key, val] = attr.split('=');
        const lowerKey = (key || '').toLowerCase();
        
        if (lowerKey === 'path') result.path = val;
        else if (lowerKey === 'samesite') result.sameSite = val;
        else if (lowerKey === 'secure') result.secure = true;
        else if (lowerKey === 'httponly') result.httpOnly = true;
        else if (lowerKey === 'max-age') {
            result.maxAge = parseInt(val);
            result.expirationMode = 'maxAge';
        }
        else if (lowerKey === 'expires') {
            result.expires = val;
            result.expirationMode = 'expires';
        }
    });
    
    return result;
};