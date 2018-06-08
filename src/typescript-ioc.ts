"use strict";
/**
 * This is a lightweight annotation-based dependency injection container for typescript.
 *
 * Visit the project page on [GitHub] (https://github.com/thiagobustamante/typescript-ioc).
 */

import "reflect-metadata";

/**
 * A decorator to tell the container that this class should be handled by the Singleton [[Scope]].
 *
 * ```
 * @ Singleton
 * class PersonDAO {
 *
 * }
 * ```
 *
 * Is the same that use:
 *
 * ```
 * Container.bind(PersonDAO).scope(Scope.Singleton)
 * ```
 */

export type Constructor<T> = Function & { prototype: T };

export function Singleton<T>(target: Constructor<T>) {
  const qualifier = InjectorHandler.getQualifierFromType(target);
  if (qualifier === null) {
    throw new Error("Missing qualifier.");
  }
  IoCContainer.bind(target, qualifier).scope(Scope.Singleton);
}

/**
 * A decorator to tell the container that this class should be handled by the provided [[Scope]].
 * For example:
 *
 * ```
 * class MyScope extends Scope {
 *   resolve(iocProvider:Provider, source:Function) {
 *     console.log('created by my custom scope.')
 *     return iocProvider.get();
 *   }
 * }
 * @ Scoped(new MyScope())
 * class PersonDAO {
 * }
 * ```
 *
 * Is the same that use:
 *
 * ```
 * Container.bind(PersonDAO).scope(new MyScope());
 * ```
 * @param scope The scope that will handle instantiations for this class.
 */
export function Scoped(scope: Scope) {
  return function<T>(target: Constructor<T>) {
    const qualifier = InjectorHandler.getQualifierFromType(target);
    if (qualifier === null) {
      throw new Error("Missing qualifier.");
    }
    IoCContainer.bind(target, qualifier).scope(scope);
  };
}

/**
 * A decorator to tell the container that this class should instantiated by the given [[Provider]].
 * For example:
 *
 * ```
 * @ Provided({get: () => { return new PersonDAO(); }})
 * class PersonDAO {
 * }
 * ```
 *
 * Is the same that use:
 *
 * ```
 * Container.bind(PersonDAO).provider({get: () => { return new PersonDAO(); }});
 * ```
 * @param provider The provider that will handle instantiations for this class.
 */
export function Provided<T>(provider: Provider<T>, qualifier?: {}) {
  qualifier = qualifier || {};
  return function(target: Constructor<T>) {
    IoCContainer.bind(target, qualifier).provider(provider);
  };
}

/**
 * A decorator to tell the container that this class should be used as the implementation for a given base class.
 * For example:
 *
 * ```
 * class PersonDAO {
 * }
 *
 * @ Provides(PersonDAO)
 * class ProgrammerDAO extends PersonDAO{
 * }
 * ```
 *
 * Is the same that use:
 *
 * ```
 * Container.bind(PersonDAO).to(ProgrammerDAO);
 * ```
 * @param target The base class that will be replaced by this class.
 */
export function Provides<T>(target: Constructor<T>, qualifier?: {}) {
  return function(to: Constructor<T>) {
    qualifier = qualifier || {};
    IoCContainer.bind(target, qualifier).to(to);
  };
}

/**
 * A decorator to tell the container that this class should its instantiation always handled by the Container.
 *
 * An AutoWired class will have its constructor overriden to always delegate its instantiation to the IoC Container.
 * So, if you write:
 *
 * ```
 * @ AutoWired
 * class PersonService {
 *   @ Inject
 *   personDAO: PersonDAO;
 * }
 * ```
 *
 * Any PersonService instance will be created by the IoC Container, even when a direct call to its constructor is called:
 *
 * ```
 * let PersonService = new PersonService(); // will be returned by Container, and all internal dependencies resolved.
 * ```
 *
 * It is the same that use:
 *
 * ```
 * Container.bind(PersonService);
 * let personService: PersonService = Container.get(PersonService);
 * ```
 */
export function AutoWired<T>(target: Constructor<T>) {
  // <T extends {new(...args:any[]):{}}>(target:T) {
  IoCContainer.bind(target, {}); // TODO backward compatibility
  const newConstructor = InjectorHandler.decorateConstructor(target, {});
  return newConstructor;
}

/**
 * A decorator to request from Container that it resolve the annotated property dependency.
 * For example:
 *
 * ```
 * @ AutoWired
 * class PersonService {
 *    constructor (@ Inject creationTime: Date) {
 *       this.creationTime = creationTime;
 *    }
 *    @ Inject
 *    personDAO: PersonDAO;
 *
 *    creationTime: Date;
 * }
 *
 * ```
 *
 * When you call:
 *
 * ```
 * let personService: PersonService = Container.get(PersonService);
 * // The properties are all defined, retrieved from the IoC Container
 * console.log('PersonService.creationTime: ' + personService.creationTime);
 * console.log('PersonService.personDAO: ' + personService.personDAO);
 * ```
 */
export function Inject(...args: any[]): any {
  if (args.length === 1) {
    let qualifier = args[0];
    qualifier = qualifier || {};
    return function(...args2: any[]) {
      handleInject(qualifier, args2);
    };
  } else {
    return handleInject({}, args);
  }
}

function handleInject(qualifier: {}, args: any[]) {
  if (args.length < 3 || typeof args[2] === "undefined") {
    return InjectPropertyDecorator(args[0], args[1], qualifier);
  } else if (args.length === 3 && typeof args[2] === "number") {
    console.log("Params of " + args[0] + " at pos " + args[2]);
    return InjectParamDecorator(args[0], qualifier, args[1], args[2]);
  }

  throw new Error("Invalid @Inject Decorator declaration.");
}

/**
 * Decorator processor for [[Inject]] decorator on properties
 */
function InjectPropertyDecorator(target: Function, key: string, qualifier: {}) {
  let t = Reflect.getMetadata("design:type", target, key);
  if (!t) {
    // Needed to support react native inheritance
    t = Reflect.getMetadata("design:type", target.constructor, key);
  }
  IoCContainer.injectProperty(target.constructor, key, t, qualifier);
}

/**
 * Decorator processor for [[Inject]] decorator on constructor parameters
 */
function InjectParamDecorator<T>(
  target: Constructor<T>,
  qualifier: {},
  propertyKey: string | symbol,
  parameterIndex: number
) {
  if (!propertyKey) {
    // only intercept constructor parameters
    const config = <ConfigImpl<T>>IoCContainer.bind(target, qualifier);
    config.paramTypes = config.paramTypes || [];
    config.paramQualifiers = config.paramQualifiers || [];
    const paramTypes: Array<any> = Reflect.getMetadata(
      "design:paramtypes",
      target
    );
    config.paramTypes.unshift(paramTypes[parameterIndex]);
    config.paramQualifiers.unshift(qualifier);
  }
}

/**
 * The IoC Container class. Can be used to register and to retrieve your dependencies.
 * You can also use de decorators [[AutoWired]], [[Scoped]], [[Singleton]], [[Provided]] and [[Provides]]
 * to configure the dependency directly on the class.
 */
export class Container {
  /**
   * Internal storage for snapshots
   * @type {providers: Map<Function, Provider>; scopes: Map<Function, Scope>}
   */
  private static snapshots: {
    providers: Map<Function, Provider<any>>;
    scopes: Map<Function, Scope>;
  } = {
    providers: new Map(),
    scopes: new Map()
  };

  /**
   * Add a dependency to the Container. If this type is already present, just return its associated
   * configuration object.
   * Example of usage:
   *
   * ```
   * Container.bind(PersonDAO).to(ProgrammerDAO).scope(Scope.Singleton);
   * ```
   * @param source The type that will be bound to the Container
   * @return a container configuration
   */
  static bind<T>(source: Constructor<T>, qualifier?: {}): Config<T> {
    qualifier = qualifier || {};
    if (!IoCContainer.isBound(source, qualifier)) {
      AutoWired(source);
      return IoCContainer.bind(source, qualifier).to(source);
    }

    return IoCContainer.bind(source, qualifier);
  }

  /**
   * Retrieve an object from the container. It will resolve all dependencies and apply any type replacement
   * before return the object.
   * If there is no declared dependency to the given source type, an implicity bind is performed to this type.
   * @param source The dependency type to resolve
   * @return an object resolved for the given source type;
   */
  static get<T>(source: Constructor<T>, qualifier?: {}): T {
    qualifier = qualifier || {};
    return IoCContainer.get(source, qualifier);
  }

  /**
   * Retrieve an object from the container. It will resolve all dependencies and apply any type replacement
   * before return the object.
   * If there is no declared dependency to the given source type, an implicity bind is performed to this type.
   * @param source The dependency type to resolve
   * @return an object resolved for the given source type;
   */
  static getAll<T>(source: Constructor<T>): [any, T][] {
    return IoCContainer.getAll(source);
  }

  // /**
  //  * Retrieve a type associated with the type provided from the container
  //  * @param source The dependency type to resolve
  //  * @return an object resolved for the given source type;
  //  */
  // static getType(source: Function) {
  //     return IoCContainer.getType(source);
  // }

  /**
   * Store the state for a specified binding.  Can then be restored later.   Useful for testing.
   * @param source The dependency type
   */
  static snapshot<T>(source: Constructor<T>, qualifier: {}): void {
    const config = <ConfigImpl<T>>Container.bind(source, qualifier);
    Container.snapshots.providers.set(source, config.iocprovider);
    if (config.iocscope) {
      Container.snapshots.scopes.set(source, config.iocscope);
    }
    return;
  }

  /**
   * Restores the state for a specified binding that was previously captured by snapshot.
   * @param source The dependency type
   */
  static restore<T>(source: Constructor<T>, qualifier: {}): void {
    if (!Container.snapshots.providers.has(source)) {
      throw new TypeError("Config for source was never snapshoted.");
    }
    const config = Container.bind(source, qualifier);
    config.provider(Container.snapshots.providers.get(source));
    if (Container.snapshots.scopes.has(source)) {
      config.scope(Container.snapshots.scopes.get(source));
    }
  }
}

/**
 * Internal implementation of IoC Container.
 */
class IoCContainer {
  private static bindings: Map<Constructor<any>, Map<string, ConfigImpl<any>>> = new Map();

  static isBound<T>(source: Constructor<T>, qualifier: {}): boolean {
    checkType(source);
    const baseSource = InjectorHandler.getConstructorFromType(source);
    const map = IoCContainer.bindings.get(baseSource);
    if (!map) {
      return false;
    }
    const config = map.get(IoCContainer.normalizeQualifier(qualifier));
    return !!config;
  }

  private static getMap<T>(source: Constructor<T>, create: boolean): Map<string, ConfigImpl<T>> {
    checkType(source);
    const baseSource = InjectorHandler.getConstructorFromType(source);
    let map = IoCContainer.bindings.get(baseSource);
    if (!map && create) {
      map = new Map();
      IoCContainer.bindings.set(baseSource, map);
    }
    return map;
  }

  static bind<T>(source: Constructor<T>, qualifier: {}): ConfigImpl<T> {
    const baseSource = InjectorHandler.getConstructorFromType(source);
    const map = IoCContainer.getMap(source, true);
    const nq = IoCContainer.normalizeQualifier(qualifier);
    let config = map.get(nq);
    if (!config) {
      config = new ConfigImpl(baseSource, qualifier);
      map.set(nq, config);
    }
    return config;
  }

  static getAll<T>(source: Constructor<T>): [{}, T][] {
    const map = IoCContainer.getMap(source, false);
    if (!map) {
      return [];
    }
    const ret = Array.of<[{}, T]>();
    const it = map.values();
    let x = it.next();
    while (!x.done) {
      ret.push([x.value.qualifier, x.value.getInstance()]);
      x = it.next();
    }
    return ret;
  }

  static get<T>(source: Constructor<T>, qualifier: {}): T {
    // const map = IoCContainer.getMap(source, false);
    // if (!map) {
    //   return null;
    // }
    // const nq = IoCContainer.normalizeQualifier(qualifier);
    // const config = map.get(nq);
    // if (!config) {
    //   return null;
    // }
    const config = IoCContainer.bind(source, qualifier);
    if (!config.iocprovider) {
      config.to(config.source);
    }
    return config.getInstance();
  }

  // static getType(source: Function): Function {
  //     checkType(source);
  //     const baseSource = InjectorHandler.getConstructorFromType(source);
  //     const map = IoCContainer.bindings.get(baseSource);
  //     if (!map) {
  //         throw new TypeError(`The type ${source.name} hasn't been registered with the IOC Container`);
  //     }
  //     return config.targetSource || config.source;
  // }

  static injectProperty(
    target: Function,
    key: string,
    propertyType: Constructor<any>,
    propertyQualifier: {}
  ) {
    const propKey = `__${key}`;
    Object.defineProperty(target.prototype, key, {
      enumerable: true,
      get: function() {
        return this[propKey]
          ? this[propKey]
          : (this[propKey] = IoCContainer.get(propertyType, propertyQualifier));
      },
      set: function(newValue) {
        this[propKey] = newValue;
      }
    });
  }

  static assertInstantiable(target: any) {
    if (target["__block_Instantiation"]) {
      throw new TypeError(
        "Can not instantiate Singleton class. " +
          "Ask Container for it, using Container.get"
      );
    }
  }

  static normalizeQualifier(qualifier: {}): string {
    const acc = [];
    // console.log("Qualifier: " + qualifier);
    for (const key of Object.keys(qualifier).sort()) {
      const v = (<any>qualifier)[key];
      switch (typeof v) {
        case 'number': acc.push(key + ":" + v); break;
        case 'boolean': acc.push(key + ":" + v); break;
        case 'string': acc.push(key + ":" + v); break;
        default:
          throw new TypeError("Qualifier properties can be only primitive types");
      }
    }
    return "{" + acc.join(",") + "}";
  }
}

/**
 * Utility function to validate type
 */
function checkType(source: Object) {
  if (!source) {
    throw new TypeError(
      "Invalid type requested to IoC " + "container. Type is not defined."
    );
  }
}

/**
 * A bind configuration for a given type in the IoC Container.
 */
export interface Config<T> {
  /**
   * Inform a given implementation type to be used when a dependency for the source type is requested.
   * @param target The implementation type
   */
  to(target: Constructor<T>): Config<T>;
  /**
   * Inform a provider to be used to create instances when a dependency for the source type is requested.
   * @param provider The provider to create instances
   */
  provider(provider: Provider<T>): Config<T>;
  /**
   * Inform a scope to handle the instances for objects created by the Container for this binding.
   * @param scope Scope to handle instances
   */
  scope(scope: Scope): Config<T>;

  /**
   * Inform the types to be retrieved from IoC Container and passed to the type constructor.
   * @param paramTypes A list with parameter types.
   */
  withParams(...paramTypes: any[]): Config<T>;
}

class ConfigImpl<T> implements Config<T> {
  source: Constructor<T>;
  targetSource: Function;
  iocprovider: Provider<T>;
  iocscope: Scope;
  paramTypes: Array<any>;
  paramQualifiers: Array<{}>;
  qualifier: {};

  constructor(source: Constructor<T>, qualifier: {}) {
    this.source = source;
    this.qualifier = qualifier;
  }

  to(target: Constructor<T>) {
    checkType(target);
    const targetSource = InjectorHandler.getConstructorFromType(target);
    this.targetSource = targetSource;
    if (this.source === targetSource) {
      this.iocprovider = {
        get: () => {
          const constr = <FunctionConstructor>(<any>target);
          const params = this.getParameters();
          return <T>(<any>(params ? new constr(...params) : new constr()));
        }
      };
    } else {
      this.iocprovider = {
        get: () => {
          return IoCContainer.get(target, this.qualifier);
        }
      };
    }
    if (this.iocscope) {
      this.iocscope.reset(this.source, this.qualifier);
    }
    return this;
  }

  provider(provider: Provider<T>) {
    this.iocprovider = provider;
    if (this.iocscope) {
      this.iocscope.reset(this.source, this.qualifier);
    }
    return this;
  }

  scope(scope: Scope) {
    this.iocscope = scope;
    if (scope === Scope.Singleton) {
      (<any>this).source["__block_Instantiation"] = true;
      scope.reset(this.source, this.qualifier);
    } else if ((<any>this).source["__block_Instantiation"]) {
      delete (<any>this).source["__block_Instantiation"];
    }
    return this;
  }

  withParams(...paramTypes: any[]) {
    this.paramTypes = paramTypes;
    return this;
  }

  getInstance() {
    if (!this.iocscope) {
      this.scope(Scope.Local);
    }
    return this.iocscope.resolve(this.iocprovider, this.source, this.qualifier);
  }

  private getParameters(): any[] {
    if (this.paramTypes) {
      const ret = [];
      for(let i = 0; i < this.paramTypes.length; i++) {
        ret.push(IoCContainer.get(this.paramTypes[i], this.paramQualifiers[i]));
      }
      return ret;
    }
    return null;
  }
}

/**
 * A factory for instances created by the Container. Called every time an instance is needed.
 */
export interface Provider<T> {
  /**
   * Factory method, that should create the bind instance.
   * @return the instance to be used by the Container
   */
  get(): T;
}

/**
 * Class responsible to handle the scope of the instances created by the Container
 */
export abstract class Scope {
  /**
   * A reference to the LocalScope. Local Scope return a new instance for each dependency resolution requested.
   * This is the default scope.
   */
  // tslint:disable-next-line:variable-name
  static Local: Scope;
  /**
   * A reference to the SingletonScope. Singleton Scope return the same instance for any
   * dependency resolution requested.
   */
  // tslint:disable-next-line:variable-name
  static Singleton: Scope;

  /**
   * Method called when the Container needs to resolve a dependency. It should return the instance that will
   * be returned by the Container.
   * @param provider The provider associated with the current bind. Used to create new instances when necessary.
   * @param source The source type of this bind.
   * @return the resolved instance.
   */
  abstract resolve<T>(
    provider: Provider<T>,
    source: Constructor<T>,
    qualifier: {}
  ): T;

  /**
   * Called by the IoC Container when some configuration is changed on the Container binding.
   * @param source The source type that has its configuration changed.
   */
  reset(source: Constructor<any>, qualifier: {}) {
    // Do nothing
  }
}

/**
 * Default [[Scope]] that always create a new instace for any dependency resolution request
 */
class LocalScope extends Scope {
  resolve<T>(provider: Provider<T>, source: Constructor<T>, qualifier: {}): T {
    return provider.get();
  }
}

Scope.Local = new LocalScope();

/**
 * Scope that create only a single instace to handle all dependency resolution requests.
 */
class SingletonScope extends Scope {
  private static instances: Map<[Constructor<any>, {}], any> = new Map();

  resolve<T>(provider: Provider<T>, source: Constructor<T>, qualifier: {}): T {
    let instance = SingletonScope.instances.get([source, qualifier]);
    if (!instance) {
      (<any>source)["__block_Instantiation"] = false;
      instance = provider.get();
      (<any>source)["__block_Instantiation"] = true;
      SingletonScope.instances.set([source, qualifier], instance);
    }
    return instance;
  }

  reset(source: Constructor<any>, qualifier: {}) {
    SingletonScope.instances.delete([
      InjectorHandler.getConstructorFromType(source),
      qualifier
    ]);
  }
}

Scope.Singleton = new SingletonScope();

/**
 * Utility class to handle injection behavior on class decorations.
 */
class InjectorHandler {
  static constructorNameRegEx = /function (\w*)/;

  static decorateConstructor(target: Constructor<any>, qualifier: {}) {
    let newConstructor: any;
    // tslint:disable-next-line:class-name
    newConstructor = class ioc_wrapper extends (<FunctionConstructor>target) {
      constructor(...args: any[]) {
        super(...args);
        IoCContainer.assertInstantiable(target);
      }
    };
    newConstructor["__parent"] = target;
    newConstructor["__qualifier"] = qualifier;
    return newConstructor;
  }

  static hasNamedConstructor(source: Constructor<any>): boolean {
    if (source["name"]) {
      return source["name"] !== "ioc_wrapper";
    } else {
      try {
        const constructorName = source.prototype.constructor
          .toString()
          .match(this.constructorNameRegEx)[1];
        return constructorName && constructorName !== "ioc_wrapper";
      } catch {
        // make linter happy
      }

      return false;
    }
  }

  static getConstructorFromType<T>(target: Constructor<T>): Constructor<T> {
    let typeConstructor: any = target;
    if (this.hasNamedConstructor(typeConstructor)) {
      return typeConstructor;
    }
    while ((typeConstructor = typeConstructor["__parent"])) {
      if (this.hasNamedConstructor(typeConstructor)) {
        return typeConstructor;
      }
    }
    throw TypeError("Can not identify the base Type for requested target");
  }

  static getQualifierFromType(target: Constructor<any>): {} {
    let typeConstructor: any = target;
    do {
      if (typeConstructor["__qualifier"]) {
        return typeConstructor["__qualifier"];
      }
      typeConstructor = typeConstructor["__parent"];
    } while (typeConstructor);
    return null;
  }
}
