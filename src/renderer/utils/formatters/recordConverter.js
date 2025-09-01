/**
 * Extract domain from URL
 */
function extractDomain(url) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Parse cookie string into individual cookies with their attributes
 * Handles both single cookie (with attributes) and multiple cookies
 */
function parseCookieString(cookieStr) {
  if (!cookieStr) return [];
  
  // Check if this looks like multiple cookies (no path/domain/etc attributes)
  if (!cookieStr.includes('path=') && !cookieStr.includes('max-age=') && 
      !cookieStr.includes('expires=') && cookieStr.includes('; ')) {
    // Multiple cookies format: "name1=value1; name2=value2"
    const cookies = [];
    const pairs = cookieStr.split('; ');
    pairs.forEach(pair => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex > 0) {
        cookies.push({
          name: pair.substring(0, eqIndex).trim(),
          value: pair.substring(eqIndex + 1),
          isDeleted: false,
          attributes: {}
        });
      }
    });
    return cookies;
  }
  
  // Single cookie with attributes
  const parts = cookieStr.split(';').map(s => s.trim());
  if (parts.length === 0) return [];
  
  // First part is the cookie name=value
  const firstPart = parts[0];
  const eqIndex = firstPart.indexOf('=');
  
  // Edge case: cookie without value (just name) or empty string
  if (eqIndex < 0) {
    // Cookie without value - treat as deletion
    return [{
      name: firstPart.trim(),
      value: '',
      isDeleted: true,
      attributes: {}
    }];
  }
  
  if (eqIndex === 0) {
    // Cookie starting with = is invalid
    return [];
  }
  
  const cookieName = firstPart.substring(0, eqIndex).trim();
  const cookieValue = firstPart.substring(eqIndex + 1); // Don't trim cookie values, they might have intentional spaces
  
  // Parse attributes
  const attributes = {};
  let cookieDomain = null;
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const attrEqIndex = part.indexOf('=');
    if (attrEqIndex > 0) {
      const attrName = part.substring(0, attrEqIndex).trim().toLowerCase();
      const attrValue = part.substring(attrEqIndex + 1).trim();
      attributes[attrName] = attrValue;
      
      if (attrName === 'domain') {
        cookieDomain = attrValue;
      }
    } else {
      // Boolean attributes like 'secure', 'httponly'
      const attrName = part.trim().toLowerCase();
      if (attrName) {
        attributes[attrName] = true;
      }
    }
  }
  
  // Check if this is a deletion (max-age=0, expires in the past, or empty value with max-age)
  const isDeleted = attributes['max-age'] === '0' || 
                    (cookieValue === '' && attributes.hasOwnProperty('max-age'));
  
  return [{
    name: cookieName,
    value: cookieValue,
    isDeleted: isDeleted,
    attributes: attributes,
    domain: cookieDomain
  }];
}

/**
 * Converts new recording format (single events array) to old format (separate arrays)
 * for backward compatibility with existing components
 */
export function convertNewRecordingFormat(record) {
  if (!record || !record.events) {
    return record;
  }

  // Check if already in old format
  if (record.console || record.network || record.storage) {
    return record;
  }

  // Initialize arrays for different event types
  const console = [];
  const network = [];
  const storage = [];
  const rrwebEvents = [];
  const navigationHistory = [];
  
  // Get the actual start time (considering pre-navigation adjustment)
  // If preNavTimeAdjustment exists, events are already adjusted, so we use the raw startTime
  const startTime = record.startTime;

  // Process each event based on its type
  record.events.forEach(event => {
    // Calculate relative timestamp
    const relativeTimestamp = event.timestamp - startTime;
    
    switch (event.type) {
      case 'console':
        console.push({
          timestamp: relativeTimestamp,
          level: event.data.level,
          args: event.data.args,
          stack: event.data.stack
        });
        break;

      case 'network':
        // Handle both request and response events
        if (event.data.type === 'request') {
          // Construct full URL if data.url is relative
          let fullUrl = event.data.url;
          
          // If URL is relative (starts with /), try to construct full URL
          if (fullUrl && fullUrl.startsWith('/') && event.url) {
            try {
              const baseUrl = new URL(event.url);
              fullUrl = baseUrl.origin + event.data.url;
            } catch (e) {
              // If that fails, try to use the URL from metadata or navigation history
              const recordUrl = record.url || record.metadata?.url || navigationHistory[0]?.url;
              if (recordUrl) {
                try {
                  const baseUrl = new URL(recordUrl);
                  fullUrl = baseUrl.origin + event.data.url;
                } catch (e2) {
                  // Keep relative URL if can't parse base
                  fullUrl = event.data.url;
                }
              }
            }
          }
          
          network.push({
            id: event.data.requestId,
            timestamp: relativeTimestamp,
            method: event.data.method,
            url: fullUrl,
            requestHeaders: event.data.headers || {},
            requestBody: event.data.body || null,
            headers: event.data.headers || {}, // Keep for backward compatibility
            body: event.data.body || null, // Keep for backward compatibility
            timing: event.data.timing,
            // Response will be added later when we find the matching response event
          });
        } else if (event.data.type === 'response') {
          // Find the matching request and update it
          const request = network.find(req => req.id === event.data.requestId);
          if (request) {
            request.status = event.data.status;
            request.statusText = event.data.statusText;
            request.responseHeaders = event.data.responseHeaders || {};
            request.responseBody = event.data.responseBody || null;
            request.responseSize = event.data.responseBody ? event.data.responseBody.length : 0;
            
            // Set timing information
            if (event.data.timing && event.data.timing.endTime) {
              const responseTimestamp = event.timestamp - startTime;
              request.endTime = responseTimestamp;
              request.duration = event.data.timing.endTime - (request.timing?.startTime || 0);
            }
            
            // For size, use response body length or responseSize from event
            if (event.data.responseSize) {
              request.size = event.data.responseSize;
            } else if (request.responseBody) {
              request.size = request.responseBody.length;
            }
          }
        }
        break;

      case 'storage':
      case 'storage-initial':
        if (event.type === 'storage-initial') {
          // Handle initial storage state
          storage.push({
            timestamp: relativeTimestamp,
            type: 'initial',
            action: 'snapshot',
            data: event.data,
            url: event.url
          });
        } else {
          // Handle storage changes
          // Map type from 'local'/'session' to 'localStorage'/'sessionStorage'
          const storageType = event.data.type === 'local' ? 'localStorage' :
                            event.data.type === 'session' ? 'sessionStorage' :
                            event.data.type;
                            
          storage.push({
            timestamp: relativeTimestamp,
            type: storageType,
            action: event.data.action, // set, remove, clear
            key: event.data.key,
            name: event.data.key || (event.data.action === 'clear' ? '*' : ''),
            oldValue: event.data.oldValue,
            value: event.data.newValue !== null ? event.data.newValue : undefined,
            newValue: event.data.newValue, // Keep for compatibility
            domain: event.data.domain || extractDomain(event.url) || 'unknown',
            path: event.data.path || '/',
            url: event.url
          });
        }
        break;

      case 'navigation':
        navigationHistory.push({
          timestamp: relativeTimestamp,
          url: event.url,
          title: event.data?.title,
          transitionType: event.data?.transitionType
        });
        break;

      case 'rrweb':
        // Pass through rrweb events as-is
        rrwebEvents.push(event.data);
        break;

      case 'recording-start':
      case 'recording-stop':
        // These are metadata events, not data events
        // They can be ignored or processed separately if needed
        break;

      default:
        // Unknown event type - silently ignore
    }
  });

  // Extract metadata from the record if not present
  const metadata = record.metadata || {
    recordId: record.id,
    startTime: record.startTime,
    endTime: record.endTime,
    duration: record.endTime ? record.endTime - record.startTime : 0,
    url: record.url || navigationHistory[0]?.url || '',
    viewport: record.viewport || { width: 1920, height: 1080 },
    userAgent: record.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown')
  };

  // Store original events for reference
  const recordWithOriginalEvents = {
    ...record,
    _originalEvents: record.events
  };


  // Return the converted record
  return {
    ...recordWithOriginalEvents,
    metadata,
    events: rrwebEvents, // rrweb events for the player
    console,
    network,
    storage: processStorageEvents(storage, recordWithOriginalEvents),
    navigationHistory
  };
}

/**
 * Process storage events to match the old format expected by RecordStorageTab
 */
export function processStorageEvents(storage, record) {
  const processedStorage = [];
  
  storage.forEach(item => {
    // URL should already be present from the converter, but fallback to record URL
    const itemUrl = item.url || record.url || null;
    
    if (item.type === 'initial' && item.data) {
      // Process initial storage snapshot
      const { localStorage, sessionStorage, cookies } = item.data;
      
      // Add localStorage entries
      Object.entries(localStorage || {}).forEach(([key, value]) => {
        processedStorage.push({
          timestamp: item.timestamp,
          type: 'localStorage',
          action: 'set',  // Use 'set' for initial values
          key,
          name: key,
          value,
          oldValue: undefined,  // No old value for initial state
          domain: extractDomain(itemUrl) || 'unknown',
          url: itemUrl,
          metadata: { initial: true }
        });
      });
      
      // Add sessionStorage entries
      Object.entries(sessionStorage || {}).forEach(([key, value]) => {
        processedStorage.push({
          timestamp: item.timestamp,
          type: 'sessionStorage',
          action: 'set',  // Use 'set' for initial values
          key,
          name: key,
          value,
          oldValue: undefined,  // No old value for initial state
          domain: extractDomain(itemUrl) || 'unknown',
          url: itemUrl,
          metadata: { initial: true }
        });
      });
      
      // Add cookies - parse individual cookies
      if (cookies) {
        // Initial cookies are the full cookie string with multiple cookies
        const cookiePairs = cookies.split('; ');
        cookiePairs.forEach(pair => {
          const eqIndex = pair.indexOf('=');
          if (eqIndex > 0) {
            const name = pair.substring(0, eqIndex).trim();
            // Handle cookies with = in the value
            const value = pair.substring(eqIndex + 1);
            processedStorage.push({
              timestamp: item.timestamp,
              type: 'cookie',
              action: 'set',  // Use 'set' for initial values
              key: name,
              name: name,
              value: value,
              oldValue: undefined,  // No old value for initial state
              domain: extractDomain(itemUrl) || 'unknown',
              url: itemUrl,
              metadata: { initial: true }
            });
          }
        });
      }
    } else {
      // Regular storage change event - ensure it has domain and name
      // Map type from 'local'/'session' to 'localStorage'/'sessionStorage'
      const mappedType = item.type === 'local' ? 'localStorage' : 
                        item.type === 'session' ? 'sessionStorage' : 
                        item.type;
      
      // Handle cookie SET events specially - parse individual cookies
      if (mappedType === 'cookie' && item.newValue !== undefined && item.newValue !== null) {
        const parsedCookies = parseCookieString(item.newValue);
        parsedCookies.forEach(({ name, value, isDeleted, domain: cookieDomain, attributes }) => {
          // Use cookie's domain attribute if available, otherwise fall back to URL domain
          const effectiveDomain = cookieDomain || item.domain || extractDomain(itemUrl) || 'unknown';
          
          processedStorage.push({
            ...item,
            type: 'cookie',
            action: isDeleted ? 'remove' : 'set',
            key: name,
            name: name,
            value: isDeleted ? undefined : value,
            oldValue: undefined, // Will be filled by deduplication function based on tracking
            url: itemUrl,
            domain: effectiveDomain,
            path: attributes?.path || item.path || '/',
            metadata: {
              ...item.metadata,
              // Add all cookie attributes to metadata
              httpOnly: attributes?.httponly === true,
              secure: attributes?.secure === true,
              sameSite: attributes?.samesite || undefined,
              maxAge: attributes?.['max-age'] || undefined,
              expires: attributes?.expires || undefined,
              // Store raw attributes for debugging
              rawAttributes: attributes
            }
          });
        });
      } else {
        // Regular storage events
        processedStorage.push({
          ...item,
          type: mappedType,
          name: item.key || item.name || '*',
          value: item.value !== undefined ? item.value : item.newValue, // Ensure value field exists
          url: itemUrl,
          domain: item.domain || extractDomain(itemUrl) || 'unknown'
        });
      }
    }
  });
  
  // Deduplicate INITIAL storage states
  return deduplicateInitialStorage(processedStorage);
}

/**
 * Process storage events and only mark as "Initial" those that existed when recording started
 * Also track previous values for proper old/new value display
 */
function deduplicateInitialStorage(storageEvents) {
  const seenKeys = new Map(); // Map of type:key -> last known value
  const processedEvents = [];
  
  // Find the timestamp of the first storage-initial event (recording start)
  let recordingStartTime = null;
  for (const event of storageEvents) {
    if (event.metadata && event.metadata.initial === true) {
      recordingStartTime = event.timestamp;
      break;
    }
  }
  
  storageEvents.forEach(event => {
    const key = `${event.type}:${event.name}`;
    
    // Check if this is an initial storage state by looking at metadata
    if (event.metadata && event.metadata.initial === true) {
      // Only keep the "Initial" attribute for storage that existed at recording start
      const isAtRecordingStart = event.timestamp === recordingStartTime;
      
      // For initial events, check if we've seen this key before
      if (!seenKeys.has(key)) {
        seenKeys.set(key, event.value);
        processedEvents.push({
          ...event,
          metadata: isAtRecordingStart ? event.metadata : undefined
        });
      }
    } else {
      // Non-initial events - update old value based on what we've seen
      const previousValue = seenKeys.get(key);
      
      if (event.action === 'set') {
        processedEvents.push({
          ...event,
          oldValue: previousValue,
          value: event.value
        });
        seenKeys.set(key, event.value);
      } else if (event.action === 'remove') {
        processedEvents.push({
          ...event,
          oldValue: previousValue !== undefined ? previousValue : event.oldValue,
          value: undefined
        });
        seenKeys.delete(key);
      } else if (event.action === 'clear') {
        // Clear action - remove all keys of this type
        const clearedKeys = [];
        for (const [k, v] of seenKeys.entries()) {
          if (k.startsWith(`${event.type}:`)) {
            clearedKeys.push({ key: k, value: v });
          }
        }
        
        // Remove cleared keys from tracking
        clearedKeys.forEach(({ key }) => seenKeys.delete(key));
        
        processedEvents.push({
          ...event,
          metadata: {
            ...event.metadata,
            clearedCount: clearedKeys.length,
            clearedKeys: clearedKeys.map(({ key, value }) => ({
              name: key.split(':')[1],
              value
            }))
          }
        });
      } else {
        // Other actions
        processedEvents.push(event);
      }
    }
  });
  
  return processedEvents;
}

/**
 * Convert flat storage array for RecordStorageTab component
 */
export function convertStorageForTable(storage) {
  const tableData = [];
  
  storage.forEach(item => {
    // Handle both the converted format and direct storage events
    if (item.action === 'initial') {
      // Initial state entries
      tableData.push({
        ...item,
        domain: item.domain || 'unknown'
      });
    } else {
      // Regular storage change events
      tableData.push({
        ...item,
        domain: item.domain || 'unknown'
      });
    }
  });
  
  return tableData;
}