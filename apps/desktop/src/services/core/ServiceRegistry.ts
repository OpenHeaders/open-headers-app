import mainLogger from '@/utils/mainLogger';

const { createLogger } = mainLogger;

/** Opaque service instance — the registry stores heterogeneous service objects. */
type ServiceInstance = object;
type Callable = (...args: never[]) => unknown;
type ServiceWithMethod = Record<string, Callable>;

/** Checks whether an object has a method with the given name */
function hasMethod(obj: unknown, name: string): obj is ServiceWithMethod {
  if (typeof obj !== 'object' || obj === null) return false;
  return typeof (obj as ServiceWithMethod)[name] === 'function';
}

interface ServiceInfo {
  name: string;
  service: ServiceInstance;
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

  register(name: string, service: ServiceInstance, dependencies: string[] = [], initMethod = 'initialize'): void {
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
      error: null,
    });
  }

  /**
   * Register a service that was already initialized externally (e.g., lazily created).
   * The registry will still call its shutdown method during shutdownAll().
   */
  registerInitialized(name: string, service: ServiceInstance): void {
    if (this.services.has(name)) {
      throw new Error(`Service ${name} is already registered`);
    }

    this.services.set(name, {
      name,
      service,
      dependencies: [],
      initMethod: 'initialize',
      initialized: true,
      initPromise: null,
      error: null,
    });
  }

  get(name: string): ServiceInstance {
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

    // Group services by dependency depth for parallel initialization.
    // Services at the same depth have no mutual dependencies and can run concurrently.
    const depths = this.getInitializationDepths();

    for (const group of depths) {
      await Promise.all(group.map((name) => this.initializeService(name)));
    }

    this.initialized = true;
  }

  /**
   * Group services by dependency depth. Depth 0 = no dependencies,
   * depth 1 = depends only on depth-0 services, etc.
   */
  private getInitializationDepths(): string[][] {
    this.buildInitializationOrder();

    const depthMap = new Map<string, number>();

    const getDepth = (name: string): number => {
      if (depthMap.has(name)) return depthMap.get(name)!;

      const serviceInfo = this.services.get(name);
      if (!serviceInfo || serviceInfo.dependencies.length === 0) {
        depthMap.set(name, 0);
        return 0;
      }

      const maxDepDep = Math.max(...serviceInfo.dependencies.map((dep) => getDepth(dep)));
      const depth = maxDepDep + 1;
      depthMap.set(name, depth);
      return depth;
    };

    for (const name of this.initializationOrder) {
      getDepth(name);
    }

    // Group by depth
    const maxDepth = Math.max(...depthMap.values(), 0);
    const groups: string[][] = [];
    for (let d = 0; d <= maxDepth; d++) {
      const group = this.initializationOrder.filter((name) => depthMap.get(name) === d);
      if (group.length > 0) groups.push(group);
    }

    return groups;
  }

  async initializeService(name: string): Promise<ServiceInstance> {
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
      if (!depInfo?.initialized) {
        await this.initializeService(dep);
      }
    }

    serviceInfo.initPromise = this.doInitialize(serviceInfo);

    try {
      await serviceInfo.initPromise;
      serviceInfo.initialized = true;
    } catch (error: unknown) {
      serviceInfo.error = error instanceof Error ? error : new Error(String(error));
      this.log.error(`Failed to initialize service ${name}:`, error);
      throw error;
    } finally {
      serviceInfo.initPromise = null;
    }

    return serviceInfo.service;
  }

  private async doInitialize(serviceInfo: ServiceInfo): Promise<void> {
    const { service, initMethod } = serviceInfo;

    if (!hasMethod(service, initMethod)) {
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

  getAllServices(): Record<string, ServiceInstance> {
    const services: Record<string, ServiceInstance> = {};
    for (const [name, serviceInfo] of this.services) {
      services[name] = serviceInfo.service;
    }
    return services;
  }

  async shutdownAll(): Promise<void> {
    // Shut down in reverse initialization order first, then any late-registered services
    const orderedNames = new Set([...this.initializationOrder].reverse());
    const allNames = [...orderedNames];

    // Append services registered after initializeAll (e.g., lazily-created services)
    for (const name of this.services.keys()) {
      if (!orderedNames.has(name)) {
        allNames.push(name);
      }
    }

    for (const serviceName of allNames) {
      const serviceInfo = this.services.get(serviceName);
      if (serviceInfo?.initialized) {
        try {
          const shutdownMethods = ['shutdown', 'destroy', 'close', 'stop'];
          const shutdownMethod = shutdownMethods.find((method) => hasMethod(serviceInfo.service, method));

          if (shutdownMethod && hasMethod(serviceInfo.service, shutdownMethod)) {
            await serviceInfo.service[shutdownMethod]();
          }

          serviceInfo.initialized = false;
        } catch (error: unknown) {
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
        dependencies: info.dependencies,
      };
    }

    return status;
  }
}

const serviceRegistry = new ServiceRegistry();

export { ServiceRegistry, serviceRegistry };
export default serviceRegistry;
