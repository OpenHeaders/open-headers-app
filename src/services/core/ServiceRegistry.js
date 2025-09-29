const { createLogger } = require('../../utils/mainLogger');

/**
 * Service Registry for managing service initialization and dependencies
 * Ensures services are initialized in the correct order and prevents race conditions
 */
class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.initializationOrder = [];
    this.initialized = false;
    this.log = createLogger('ServiceRegistry');
  }

  /**
   * Register a service with the registry
   * @param {string} name - Service name
   * @param {Object} service - Service instance
   * @param {Array<string>} dependencies - Array of service names this service depends on
   * @param {Function} initMethod - Initialization method name (default: 'initialize')
   */
  register(name, service, dependencies = [], initMethod = 'initialize') {
    if (this.services.has(name)) {
      throw new Error(`Service ${name} is already registered`);
    }

    this.services.set(name, {
      name,
      service,
      dependencies,
      initMethod,
      initialized: false,
      initPromise: null,
      error: null
    });

  }

  /**
   * Get a service by name
   * @param {string} name - Service name
   * @returns {Object} Service instance
   */
  get(name) {
    const serviceInfo = this.services.get(name);
    if (!serviceInfo) {
      throw new Error(`Service ${name} not found in registry`);
    }
    return serviceInfo.service;
  }

  /**
   * Initialize all registered services in dependency order
   */
  async initializeAll() {
    if (this.initialized) {
      this.log.warn('ServiceRegistry already initialized');
      return;
    }

    // Build initialization order based on dependencies
    this.buildInitializationOrder();
    
    // Initialize services in order
    for (const serviceName of this.initializationOrder) {
      await this.initializeService(serviceName);
    }

    this.initialized = true;
  }

  /**
   * Initialize a specific service
   * @param {string} name - Service name
   */
  async initializeService(name) {
    const serviceInfo = this.services.get(name);
    if (!serviceInfo) {
      throw new Error(`Service ${name} not found`);
    }

    // If already initialized, return
    if (serviceInfo.initialized) {
      return serviceInfo.service;
    }

    // If initialization is in progress, wait for it
    if (serviceInfo.initPromise) {
      await serviceInfo.initPromise;
      return serviceInfo.service;
    }

    // Check if dependencies are initialized
    for (const dep of serviceInfo.dependencies) {
      const depInfo = this.services.get(dep);
      if (!depInfo || !depInfo.initialized) {
        await this.initializeService(dep);
      }
    }

    // Initialize the service
    serviceInfo.initPromise = this.doInitialize(serviceInfo);
    
    try {
      await serviceInfo.initPromise;
      serviceInfo.initialized = true;
    } catch (error) {
      serviceInfo.error = error;
      this.log.error(`Failed to initialize service ${name}:`, error);
      throw error;
    } finally {
      serviceInfo.initPromise = null;
    }

    return serviceInfo.service;
  }

  /**
   * Perform the actual initialization
   * @private
   */
  async doInitialize(serviceInfo) {
    const { service, initMethod } = serviceInfo;
    
    // Check if initialization method exists
    if (typeof service[initMethod] !== 'function') {
      this.log.warn(`Service ${serviceInfo.name} does not have ${initMethod} method`);
      return;
    }

    // Call the initialization method
    await service[initMethod]();
  }

  /**
   * Build initialization order using topological sort
   * @private
   */
  buildInitializationOrder() {
    const visited = new Set();
    const order = [];
    
    const visit = (name) => {
      if (visited.has(name)) return;
      
      visited.add(name);
      const serviceInfo = this.services.get(name);
      
      if (serviceInfo) {
        // Visit dependencies first
        for (const dep of serviceInfo.dependencies) {
          if (!this.services.has(dep)) {
            throw new Error(`Service ${name} depends on ${dep}, but ${dep} is not registered`);
          }
          visit(dep);
        }
        
        order.push(name);
      }
    };

    // Visit all services
    for (const name of this.services.keys()) {
      visit(name);
    }

    this.initializationOrder = order;
  }

  /**
   * Get all registered services
   */
  getAllServices() {
    const services = {};
    for (const [name, serviceInfo] of this.services) {
      services[name] = serviceInfo.service;
    }
    return services;
  }

  /**
   * Shutdown all services in reverse order
   */
  async shutdownAll() {
    // Shutdown in reverse order
    const shutdownOrder = [...this.initializationOrder].reverse();
    
    for (const serviceName of shutdownOrder) {
      const serviceInfo = this.services.get(serviceName);
      if (serviceInfo && serviceInfo.initialized) {
        try {
          const { service } = serviceInfo;
          
          // Common shutdown method names
          const shutdownMethods = ['shutdown', 'destroy', 'close', 'stop'];
          const shutdownMethod = shutdownMethods.find(method => typeof service[method] === 'function');
          
          if (shutdownMethod) {
            await service[shutdownMethod]();
          }
          
          serviceInfo.initialized = false;
        } catch (error) {
          this.log.error(`Error shutting down service ${serviceName}:`, error);
        }
      }
    }
    
    this.initialized = false;
  }

  /**
   * Get initialization status
   */
  getStatus() {
    const status = {};
    
    for (const [name, info] of this.services) {
      status[name] = {
        initialized: info.initialized,
        error: info.error?.message || null,
        dependencies: info.dependencies
      };
    }
    
    return status;
  }
}

// Export singleton instance
module.exports = new ServiceRegistry();