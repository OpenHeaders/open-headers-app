import mainLogger from '../../utils/mainLogger';

const { createLogger } = mainLogger;

interface ServiceInfo {
  name: string;
  service: any;
  dependencies: string[];
  initMethod: string;
  initialized: boolean;
  initPromise: Promise<void> | null;
  error: Error | null;
}

class ServiceRegistry {
  private services = new Map<string, ServiceInfo>();
  private initializationOrder: string[] = [];
  private initialized = false;
  private log = createLogger('ServiceRegistry');

  register(name: string, service: any, dependencies: string[] = [], initMethod = 'initialize'): void {
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

  get(name: string): any {
    const serviceInfo = this.services.get(name);
    if (!serviceInfo) {
      throw new Error(`Service ${name} not found in registry`);
    }
    return serviceInfo.service;
  }

  async initializeAll(): Promise<void> {
    if (this.initialized) {
      this.log.warn('ServiceRegistry already initialized');
      return;
    }

    this.buildInitializationOrder();

    for (const serviceName of this.initializationOrder) {
      await this.initializeService(serviceName);
    }

    this.initialized = true;
  }

  async initializeService(name: string): Promise<any> {
    const serviceInfo = this.services.get(name);
    if (!serviceInfo) {
      throw new Error(`Service ${name} not found`);
    }

    if (serviceInfo.initialized) {
      return serviceInfo.service;
    }

    if (serviceInfo.initPromise) {
      await serviceInfo.initPromise;
      return serviceInfo.service;
    }

    for (const dep of serviceInfo.dependencies) {
      const depInfo = this.services.get(dep);
      if (!depInfo || !depInfo.initialized) {
        await this.initializeService(dep);
      }
    }

    serviceInfo.initPromise = this.doInitialize(serviceInfo);

    try {
      await serviceInfo.initPromise;
      serviceInfo.initialized = true;
    } catch (error: any) {
      serviceInfo.error = error;
      this.log.error(`Failed to initialize service ${name}:`, error);
      throw error;
    } finally {
      serviceInfo.initPromise = null;
    }

    return serviceInfo.service;
  }

  private async doInitialize(serviceInfo: ServiceInfo): Promise<void> {
    const { service, initMethod } = serviceInfo;

    if (typeof service[initMethod] !== 'function') {
      this.log.warn(`Service ${serviceInfo.name} does not have ${initMethod} method`);
      return;
    }

    await service[initMethod]();
  }

  private buildInitializationOrder(): void {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;

      visited.add(name);
      const serviceInfo = this.services.get(name);

      if (serviceInfo) {
        for (const dep of serviceInfo.dependencies) {
          if (!this.services.has(dep)) {
            throw new Error(`Service ${name} depends on ${dep}, but ${dep} is not registered`);
          }
          visit(dep);
        }
        order.push(name);
      }
    };

    for (const name of this.services.keys()) {
      visit(name);
    }

    this.initializationOrder = order;
  }

  getAllServices(): Record<string, any> {
    const services: Record<string, any> = {};
    for (const [name, serviceInfo] of this.services) {
      services[name] = serviceInfo.service;
    }
    return services;
  }

  async shutdownAll(): Promise<void> {
    const shutdownOrder = [...this.initializationOrder].reverse();

    for (const serviceName of shutdownOrder) {
      const serviceInfo = this.services.get(serviceName);
      if (serviceInfo && serviceInfo.initialized) {
        try {
          const { service } = serviceInfo;
          const shutdownMethods = ['shutdown', 'destroy', 'close', 'stop'];
          const shutdownMethod = shutdownMethods.find(method => typeof service[method] === 'function');

          if (shutdownMethod) {
            await service[shutdownMethod]();
          }

          serviceInfo.initialized = false;
        } catch (error: any) {
          this.log.error(`Error shutting down service ${serviceName}:`, error);
        }
      }
    }

    this.initialized = false;
  }

  getStatus(): Record<string, { initialized: boolean; error: string | null; dependencies: string[] }> {
    const status: Record<string, { initialized: boolean; error: string | null; dependencies: string[] }> = {};

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

const serviceRegistry = new ServiceRegistry();

export { ServiceRegistry, serviceRegistry };
export default serviceRegistry;
