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
export interface Qualifier {
  /**/
}

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
export function Provided<T>(provider: Provider<T>, qualifier?: Qualifier) {
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
export function Provides<T>(target: Constructor<T>, qualifier?: Qualifier) {
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
  // TODO autowired classes should only modify constructor (and instantiate proper Factory), they should not bind themselves at all.
  IoCContainer.bind(target, {}).to(target); // TODO backward compatibility
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

function handleInject(qualifier: Qualifier, args: any[]) {
  if (args.length < 3 || typeof args[2] === "undefined") {
    return InjectPropertyDecorator(args[0], args[1], qualifier);
  } else if (args.length === 3 && typeof args[2] === "number") {
    return InjectParamDecorator(args[0], qualifier, args[1], args[2]);
  }

  throw new Error("Invalid @Inject Decorator declaration.");
}

/**
 * Decorator processor for [[Inject]] decorator on properties
 */
function InjectPropertyDecorator<T>(target: Constructor<T>, key: string, qualifier: Qualifier) {
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
  qualifier: Qualifier,
  propertyKey: string | symbol,
  parameterIndex: number
) {
  if (!propertyKey) {
    // only intercept constructor parameters
    const factory = <Factory<T>>IoCContainer.getFactory(target);
    const paramTypes: Array<any> = Reflect.getMetadata(
      "design:paramtypes",
      target
    );
    factory.prependParam(paramTypes[parameterIndex], qualifier);
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
  static bind<T>(source: Constructor<T>, qualifier?: Qualifier): Config<T> {
    qualifier = qualifier || {};
    if (!IoCContainer.isBound(source, qualifier)) {
      AutoWired(source);
      return IoCContainer.bind(source, qualifier).to(source);
    }

    return IoCContainer.bind(source, qualifier);
  }

  /**
   * Determines if given type is bound to the container.
   * @param source The dependency type to resolve
   * @param qualifier qualifier of instance to be retrieved from the container
   * @return true if given type is bound under given qualifier, false otherwise
   */
  static isBound<T>(source: Constructor<T>, qualifier?: {}): boolean {
    return IoCContainer.isBound(source, qualifier);
  }

  /**
   * Retrieve an object from the container. It will resolve all dependencies and apply any type replacement
   * before return the object.
   * If there is no declared dependency to the given source type, exception is thrown.
   * @param source The dependency type to resolve
   * @param qualifier qualifier of instance to be retrieved from the container
   * @return an object resolved for the given source type;
   * @throws Error when given type is not bound the the container
   */
  static get<T>(source: Constructor<T>, qualifier?: Qualifier): T {
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
  static getAll<T>(source: Constructor<T>): [Qualifier, T][] {
    return IoCContainer.getAll(source);
  }

    /**
   * Retrieve an object from the container. It will resolve all dependencies and apply any type replacement
   * before return the object.
   * If there is no declared dependency to the given source type, an implicity bind is performed to this type.
   * @param source The dependency type to resolve
   * @return an object resolved for the given source type;
   */
  static getAllFactories<T>(source: Constructor<T>): Array<QualifiedInstanceFactory<T>> {
    return IoCContainer.getAllConfigs(source);
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
  static snapshot<T>(source: Constructor<T>, qualifier: Qualifier): void {
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
  static restore<T>(source: Constructor<T>, qualifier: Qualifier): void {
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
  private static factories: Map<Constructor<any>, Factory<any>> = new Map();

  private static getBinding<T>(source: Constructor<T>, qualifier: Qualifier): [Constructor<T>, string, ConfigImpl<T> | undefined] {
    checkType(source);
    const baseSource = InjectorHandler.getConstructorFromType(source);
    const nq = IoCContainer.normalizeQualifier(qualifier);
    const map = IoCContainer.bindings.get(baseSource);
    if (!map) {
      return [baseSource, nq, undefined];
    }
    const config = map.get(nq);
    return [baseSource, nq, config];
  }

  static isBound<T>(source: Constructor<T>, qualifier: Qualifier): boolean {
    return !!IoCContainer.getBinding(source, qualifier)[2];
  }

  private static getMap<T>(baseSource: Constructor<T>, create: boolean): Map<string, ConfigImpl<T>> {
    let map = IoCContainer.bindings.get(baseSource);
    if (!map && create) {
      map = new Map();
      IoCContainer.bindings.set(baseSource, map);
    }
    return map;
  }

  static getFactory<T>(target: Constructor<T>): InstanceFactory<T> {
    checkType(target);
    const baseTarget = InjectorHandler.getConstructorFromType(target);
    let ret = IoCContainer.factories.get(baseTarget);
    if (!ret) {
      ret = new Factory(baseTarget);
      IoCContainer.factories.set(baseTarget, ret);
    }
    return <InstanceFactory<T>>ret;
  }

  static bind<T>(source: Constructor<T>, qualifier: Qualifier): ConfigImpl<T> {
    const binding = IoCContainer.getBinding(source, qualifier);
    const map = IoCContainer.getMap(binding[0], true);
    let config = map.get(binding[1]);
    if (!config) {
      config = new ConfigImpl(binding[0], qualifier);
      map.set(binding[1], config);
    }
    return config;
  }

  static getAllConfigs<T>(source: Constructor<T>): Array<ConfigImpl<T>> {
    checkType(source);
    const baseSource = InjectorHandler.getConstructorFromType(source);
    const map = IoCContainer.getMap(baseSource, false);
    if (!map) {
      return [];
    }
    return Array.from(map.values());
  }

  static getAll<T>(source: Constructor<T>): [Qualifier, T][] {
    const ret = Array.of<[{}, T]>();
    for (const x of IoCContainer.getAllConfigs(source)) {
      ret.push([x.qualifier, x.getInstance()]);
    }
    return ret;
  }

  static get<T>(source: Constructor<T>, qualifier: Qualifier): T {
    const binding = IoCContainer.getBinding(source, qualifier);
    if (!binding[2] || !binding[2].iocprovider) {
      throw new TypeError(`The type ${source.name} hasn't been registered with the IOC Container`);
    }
    return binding[2].getInstance();
  }

  static getType<T>(source: Constructor<T>, qualifier: Qualifier): Function {
    const binding = IoCContainer.getBinding(source, qualifier);
    if (!binding[2] || !binding[2].iocprovider) {
      throw new TypeError(`The type ${source.name} hasn't been registered with the IOC Container`);
    }
    return binding[2].targetSource || binding[2].source;
  }

  static injectProperty(
    target: Function,
    key: string,
    propertyType: Constructor<any>,
    propertyQualifier: Qualifier
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

  static objectHash(o: object): string {
    if (!o) {
      return "0";
    }
    let h = IoCContainer.functionHashes.get(o);
    if (h) {
      return h;
    }
    const n = o.toString().split("").reduce(function(a, b) {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      h = "00000000" + n.toString(16).substring(-8);
      IoCContainer.functionHashes.set(o, h);
      return h;
  }

  private static functionHashes = new WeakMap<object, string>();

  static normalizeQualifier(qualifier: Qualifier): string {
    const acc = [];
    // console.log("Qualifier: " + qualifier);
    for (const key of Object.keys(qualifier).sort()) {
      const v = (<any>qualifier)[key];
      switch (typeof v) {
        case 'number': acc.push(key + ":" + v); break;
        case 'boolean': acc.push(key + ":" + v); break;
        case 'string': acc.push(key + ":" + v); break;
        case 'function': acc.push(key + ":" + v.name + "#" + IoCContainer.objectHash(v)); break;
        default:
          throw new TypeError("Qualifier properties can be only primitive types or constructor functions");
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
   * Set given instance to be used when a dependency for the source type is requested.
   * @param instance resulting instance
   */
  toInstance(instance: T): Config<T>;
  /**
   * Inform a provider to be used to create instances when a dependency for the source type is requested.
   * @param provider The provider to create instances
   */
  provider(provider: Provider<T>): Config<T>;
  /**
   * Inform a provider to be used to create instances when a dependency for the source type is requested.
   * @param provider The provider to create instances
   */
  providerFun(fun: () => T): Config<T>;
  /**
   * Inform a scope to handle the instances for objects created by the Container for this binding.
   * @param scope Scope to handle instances
   */
  scope(scope: Scope): Config<T>;

}

/**
 * Instance factory is responsible for creating fresh instance of a particular type.
 */
export interface InstanceFactory<T> {
    /**
     * Creates new instance of T.
     */
    getInstance(): T;
}
export interface QualifiedInstanceFactory<T> extends InstanceFactory<T> {
  /**
   * the qualifier
   */
  qualifier: Qualifier;
}

class Factory<T> implements InstanceFactory<T> {
    private paramTypes: Array<any> = [];
    private paramQualifiers: Array<{}> = [];
    constructor(private target: Constructor<T>) {
      /**/
    }
    private getParameters(): any[] {
        const ret = [];
        for(let i = 0; i < this.paramTypes.length; i++) {
            ret.push(IoCContainer.get(this.paramTypes[i], this.paramQualifiers[i]));
        }
        return ret;
    }

    getInstance(): T {
        const constr = <FunctionConstructor>(<any>this.target);
        const params = this.getParameters();
        return <T>(<any>(new constr(...params)));
    }

    prependParam(paramType: Constructor<any>, qualifier: {}) {
        this.paramTypes.unshift(paramType);
        this.paramQualifiers.unshift(qualifier);
    }
}

class ConfigImpl<T> implements Config<T>, QualifiedInstanceFactory<T> {
  source: Constructor<T>;
  targetSource: Function;
  iocprovider: Provider<T>;
  iocscope: Scope;
  qualifier: Qualifier;

  constructor(source: Constructor<T>, qualifier: Qualifier) {
    this.source = source;
    this.qualifier = qualifier;
  }

  to(target: Constructor<T>) {
    checkType(target);
    const targetSource = InjectorHandler.getConstructorFromType(target);
    this.targetSource = targetSource;
    if (this.source === targetSource) {
      const factory = IoCContainer.getFactory(target);
      this.iocprovider = {
        get: () => factory.getInstance()
      };
    } else {
      this.iocprovider = {
        get: () => {
          const factory = IoCContainer.getFactory(target);
          return factory.getInstance();
        }
      };
    }
    if (this.iocscope) {
      this.iocscope.reset(this.source, this.qualifier);
    }
    return this;
  }

  toInstance(instance: T) {
    return this.provider({ get: () => instance });
  }

  provider(provider: Provider<T>) {
    this.iocprovider = provider;
    if (this.iocscope) {
      this.iocscope.reset(this.source, this.qualifier);
    }
    return this;
  }

  providerFun(fun: () => T) {
    return this.provider({ get: fun });
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

  getInstance() {
    if (!this.iocscope) {
      this.scope(Scope.Local);
    }
    return this.iocscope.resolve(this.iocprovider, this.source, this.qualifier);
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
    qualifier: Qualifier
  ): T;

  /**
   * Called by the IoC Container when some configuration is changed on the Container binding.
   * @param source The source type that has its configuration changed.
   */
  reset(source: Constructor<any>, qualifier: Qualifier) {
    // Do nothing
  }
}

/**
 * Default [[Scope]] that always create a new instace for any dependency resolution request
 */
class LocalScope extends Scope {
  resolve<T>(provider: Provider<T>, source: Constructor<T>, qualifier: Qualifier): T {
    return provider.get();
  }
}

Scope.Local = new LocalScope();

/**
 * Scope that create only a single instace to handle all dependency resolution requests.
 */
class SingletonScope extends Scope {
  private static instances: Map<[Constructor<any>, Qualifier], any> = new Map();

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

  reset(source: Constructor<any>, qualifier: Qualifier) {
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

  static decorateConstructor(target: Constructor<any>, qualifier: Qualifier) {
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
    throw TypeError("Can not identify the base Type for requested target " + target.toString());
  }

  static getQualifierFromType(target: Constructor<any>): Qualifier {
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
