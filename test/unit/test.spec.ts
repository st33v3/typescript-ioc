/* tslint:disable */
'use strict';
import 'mocha';
import * as chai from 'chai';
import "reflect-metadata";
import * as IoC from "../../src/typescript-ioc";
import { ContainerConfig } from "../../src/container-config";

const expect = chai.expect;

IoC.Container.bind(Date).providerFun(() => new Date());
IoC.Container.bind(Date, {name: "x"}).providerFun(() => new Date(0));

describe("@Inject annotation on a property", () => {

	@IoC.AutoWired
	class SimppleInject {
		@IoC.Inject
		dateProperty: Date;
	}

    @IoC.AutoWired
    class SimppleInjectQualifier {
        @IoC.Inject({name: "x"})
        dateProperty: Date;
    }

    @IoC.AutoWired
	class ConstructorSimpleInject {
		@IoC.Inject
		aDateProperty: Date;

		testOK: boolean;

		constructor() {
			if (this.aDateProperty)
				this.testOK = true; 
		}
	}

	abstract class AbsClass {
		constructor (public date: Date) {}
	}

	@IoC.AutoWired
	class ConstructorInjected extends AbsClass {
		constructor(@IoC.Inject public anotherDate: Date) {
			super(anotherDate);
		}
	}

    @IoC.AutoWired
    class ConstructorInjectedQulifier extends AbsClass {
        constructor(@IoC.Inject({name: "x"}) public anotherDate: Date) {
            super(anotherDate);
        }
    }

    it("should inject a new value on the property field", () => {
        const instance = new SimppleInject();
        expect(instance.dateProperty).to.exist;
    });

    it("should inject a new value with respect to qualifier on the property field", () => {
        const instance = new SimppleInjectQualifier();
        expect(instance.dateProperty).to.exist;
    });


    it("should inject a new value on the property field that is accessible inside class constructor", () => {
        const instance = new ConstructorSimpleInject();
        expect(instance.testOK).to.equal(true);
    });	

    it("should inject a new value on the property field that is injected into constructor", () => {
		expect(IoC.Container.get(Date, {})).to.exist;
		const instance = IoC.Container.get(ConstructorInjected);
        expect(instance.anotherDate).to.exist;
        expect(instance.date).to.exist;
        expect(instance.date).to.equal(instance.anotherDate);
        expect(instance.date.getTime()).to.not.equal(0);
    });

    it("should inject a new value with respect to qualifier on the property field that is injected into constructor", () => {
        IoC.Container.bind(Date, {name: "x"}).toInstance(new Date(0));
        expect(IoC.Container.get(Date, {name: "x"})).to.exist;
        const instance = IoC.Container.get(ConstructorInjectedQulifier);
        expect(instance.anotherDate).to.exist;
        expect(instance.date).to.exist;
        expect(instance.date).to.equal(instance.anotherDate);
        expect(instance.date.getTime()).to.equal(0);
    });
});

describe("@Inject annotation on Constructor parameter", () => {

	const constructorsArgs: Array<any> = new Array<any>();
	const constructorsMultipleArgs: Array<any> = new Array<any>();

	@IoC.AutoWired
	class TesteConstructor {
		constructor( @IoC.Inject date: Date) {
			constructorsArgs.push(date);
			this.injectedDate = date;
		}
		injectedDate: Date;
	}

	@IoC.AutoWired
	class TesteConstructor2 {
		@IoC.Inject
		teste1: TesteConstructor;
	}

    it("should inject a new value as argument on constructor call, when parameter is not provided", () => {
        const instance = new TesteConstructor2();
        expect(instance.teste1.injectedDate).to.exist
        expect(constructorsArgs.length).to.equal(1);
    });

    it("should not inject a new value as argument on constructor call, when parameter is provided", () => {
        const myDate = new Date(1);
        const instance = new TesteConstructor(myDate);
        expect(instance.injectedDate).to.equals(myDate);
    });

	class aaaa { }
	class bbbb { }
	class cccc { }

	IoC.Container.bind(aaaa).to(aaaa);
	IoC.Container.bind(bbbb).to(bbbb);
	IoC.Container.bind(cccc).to(cccc);
	@IoC.AutoWired
	class dddd {
		constructor( @IoC.Inject a: aaaa, @IoC.Inject b: bbbb, @IoC.Inject c: cccc) {
			constructorsMultipleArgs.push(a);
			constructorsMultipleArgs.push(b);
			constructorsMultipleArgs.push(c);
		}
	}
	
    it("should inject multiple arguments on construtor call in correct order", () => {
        const instance: dddd = IoC.Container.get(dddd);
        expect(instance).to.exist
        expect(constructorsMultipleArgs[0]).to.exist
        expect(constructorsMultipleArgs[1]).to.exist
        expect(constructorsMultipleArgs[2]).to.exist
        expect(constructorsMultipleArgs[0]).to.instanceOf(aaaa);
        expect(constructorsMultipleArgs[1]).to.instanceOf(bbbb);
        expect(constructorsMultipleArgs[2]).to.instanceOf(cccc);
	});	
});

describe("Inheritance on autowired types", () => {
	const constructorsCalled: Array<string> = new Array<string>();

	interface TesteInterface {
		property1: Date;
	}

	@IoC.AutoWired
	class TesteAbstract implements TesteInterface {
		constructor() {
			constructorsCalled.push('TesteAbstract');
		}
		bbb: Date;

		@IoC.Inject
		property1: Date;
	}

	@IoC.AutoWired
	class Teste1 extends TesteAbstract {
		constructor() {
			super();
			constructorsCalled.push('Teste1');
		}
		proper1: string = "Property";

		@IoC.Inject
		property2: Date;
	}

	@IoC.AutoWired
	class Teste2 extends Teste1 {
		constructor() {
			super();
			constructorsCalled.push('Teste2');
		}
		@IoC.Inject abc: number = 123;
		@IoC.Inject property3: Date;
	}

	@IoC.AutoWired
	class ConstructorMethodInject extends Teste2{
		testOK: boolean;

		constructor() {
			super();
			if (this.myMethod())
				this.testOK = true; 
		}

		myMethod() {
			return true;
		} 
	}


    it("should inject all fields from all types and call all constructors", () => {
        const instance: Teste2 = new Teste2();
		const instance2: Teste2 = new Teste2();
		instance2.abc = 234;
		expect(instance.property1).to.exist;
        expect(instance.property2).to.exist;
        expect(instance.abc).to.eq(123);
        expect(instance2.abc).to.eq(234);
        expect(constructorsCalled).to.include.members(['TesteAbstract', 'Teste1', 'Teste2']);
    });

    it("should keep the object prototype chain even before the constructor run", () => {
        const instance: ConstructorMethodInject = new ConstructorMethodInject();
        expect(instance.testOK).to.equal(true);
    });	
});

describe("Custom scopes for autowired types", () => {
	const scopeCreations: Array<any> = new Array<any>();

	class MyScope extends (IoC.Scope) {
		resolve(provider:any, source: Function) {
			let result = provider.get();
			scopeCreations.push(result);
			return result;
		}
	}
	
	@IoC.Scoped(new MyScope())
	@IoC.AutoWired
	class ScopedTeste {
		constructor() {
		}
	}

	@IoC.AutoWired
	class ScopedTeste2 {
		constructor() {
		}
		@IoC.Inject
		teste1: ScopedTeste;
	}
 
    it("should inject all fields from all types and call all constructors", () => {
        let instance: ScopedTeste2 = new ScopedTeste2();
        expect(instance).to.exist;
        expect(instance.teste1).to.exist;
        expect(scopeCreations.length).to.equal(1);
        expect(scopeCreations[0]).to.equal(instance.teste1);
    });
});

describe("Provider for autowired types", () => {
	const providerCreations: Array<any> = new Array<any>();

	const provider = {
		get: () => {
			const result = new ProvidedTeste(); 
			providerCreations.push(result);
			return result; 
		}
	}

	@IoC.Singleton
	@IoC.Provided(provider)
	@IoC.AutoWired
	class ProvidedTeste {
		constructor() {
		}
	}

	@IoC.AutoWired
	class ProvidedTeste2 {
		constructor() {
		}
		@IoC.Inject
		teste1: ProvidedTeste;
	}

    it("should inject all fields from all types using a provider to instantiate", () => {
        let instance: ProvidedTeste2 = new ProvidedTeste2();
        expect(instance).to.exist;
        expect(instance.teste1).to.exist;
        expect(providerCreations.length).to.equal(1);
        expect(providerCreations[0]).to.equal(instance.teste1);
    });
});

describe("Default Implementation class", () => {
	class BaseClass {
	}

	@IoC.AutoWired
	@IoC.Provides(BaseClass)
	class ImplementationClass implements BaseClass{
		@IoC.Inject
		testProp: Date;
	}

    it("should inform Container that it is the implementation for its base type", () => {
        let instance: any = IoC.Container.get(BaseClass);
		const test = instance['testProp']
		expect(test).to.exist;
		new ImplementationClass(); //Linter
    });
});

describe("The IoC Container.bind(source)", () => {

	class ContainerInjectTest {
		@IoC.Inject
		dateProperty: Date;
	}

	IoC.Container.bind(ContainerInjectTest);

    it("should inject internal fields of non AutoWired classes, if it is requested to the Container", () => {
        const instance: ContainerInjectTest = IoC.Container.get(ContainerInjectTest);
        expect(instance.dateProperty).to.exist;
    });

    it("should inject internal fields of non AutoWired classes, if it is created by its constructor", () => {
        const instance: ContainerInjectTest = new ContainerInjectTest();
        expect(instance.dateProperty).to.exist;
    });
});

describe("The IoC Container.get(source)", () => {

	class ContainerInjectConstructorTest {
		constructor( @IoC.Inject date: Date) {
			this.injectedDate = date;
		}
		injectedDate: Date;
	}

	IoC.Container.bind(ContainerInjectConstructorTest);

    it("should inject internal fields of non AutoWired classes, if it is requested to the Container", () => {
        const instance: ContainerInjectConstructorTest = IoC.Container.get(ContainerInjectConstructorTest);
        expect(instance.injectedDate).to.exist;
    });
});

describe("The IoC Container.getType(source)", () => {

	abstract class ITest {
		public abstract testValue: string;
	}

    class Test implements ITest {
        public testValue: string = "success";
    }


    class TestNoProvider {
        public testValue: string = "success";
    }

    class TypeNotRegistered {
        public testValue: string = "success";
    }

	IoC.Container.bind(ITest).to(Test);
	IoC.Container.bind(TestNoProvider);
	new TypeNotRegistered();  //Linter

});

describe("The IoC Container.snapshot(source) and Container.restore(source)", ()=>{

	@IoC.AutoWired
	abstract class IService {
	}

	@IoC.AutoWired
	@IoC.Provides(IService)
	class Service implements IService{
	}

	class MockService implements IService{
	}

	IoC.Container.bind(IService)
        .to(Service);

	it("should throw TypeError if you try to restore a type which has not been snapshotted", ()=>{
		expect(function() { IoC.Container.restore(IService, {}); })
            .to.throw(TypeError, "Config for source was never snapshoted.");
	});

	it("should store the existing service and overwrite with new service without scope", ()=>{

		expect(IoC.Container.get(IService)).to.instanceof(Service);

		IoC.Container.snapshot(IService, {});
		IoC.Container.bind(IService, {}).to(MockService);

		expect(IoC.Container.get(IService)).to.instanceof(MockService);
	});

	it("should revert the service to the saved config without scope", ()=>{

		IoC.Container.restore(IService, {});

		expect(IoC.Container.get(IService)).instanceof(Service);
	});

	it("should store the existing service and overwrite with new service with scope", ()=>{

		IoC.Container.bind(IService).to(Service).scope(IoC.Scope.Local);

		expect(IoC.Container.get(IService)).to.instanceof(Service);

		IoC.Container.snapshot(IService, {});
		IoC.Container.bind(IService).to(MockService).scope(IoC.Scope.Local);

		expect(IoC.Container.get(IService)).to.instanceof(MockService);
	});

	it("should revert the service to the saved config with scope", ()=>{

		IoC.Container.restore(IService, {});

		expect(IoC.Container.get(IService)).instanceof(Service);
	});
});

describe("The IoC Container", () => {

	@IoC.Singleton
	@IoC.AutoWired
	class SingletonInstantiation {
	}

	@IoC.AutoWired
	class ContainerSingletonInstantiation {
	}
	IoC.Container.bind(ContainerSingletonInstantiation)
				 .to(ContainerSingletonInstantiation)
				 .scope(IoC.Scope.Singleton);

    it("should not allow instantiations of Singleton classes.", () => {
		expect(function() { new SingletonInstantiation(); })
			.to.throw(TypeError, "Can not instantiate Singleton class. Ask Container for it, using Container.get");
    });

    it("should be able to work with Config.scope() changes.", () => {
		expect(function() { new ContainerSingletonInstantiation(); })
			.to.throw(TypeError, "Can not instantiate Singleton class. Ask Container for it, using Container.get");
    });

    it("should allow Container instantiation of Singleton classes.", () => {
		const instance: SingletonInstantiation = IoC.Container.get(SingletonInstantiation);
		expect(instance).to.exist;
    });

    it("should allow scope change to Local from Singleton.", () => {
		const instance: SingletonInstantiation = IoC.Container.get(SingletonInstantiation);
		expect(instance).to.exist;
		IoC.Container.bind(SingletonInstantiation).scope(IoC.Scope.Local);
		const instance2: SingletonInstantiation = new SingletonInstantiation();
		expect(instance2).to.exist;
    });
});

describe("The IoC Container Config.to()", () => {

	abstract class FirstClass {
		abstract getValue(): string;
	}

	class SecondClass extends FirstClass {
		getValue(): string {
			return 'second';
		}
	}
	
	class ThirdClass extends FirstClass {
		getValue(): string {
			return 'third';
		}
	}

	IoC.Container.bind(FirstClass).to(SecondClass);

    it("should allow target overriding", () => {
        let instance: FirstClass = IoC.Container.get(FirstClass);
        expect(instance.getValue()).to.equal('second');
		
		IoC.Container.bind(FirstClass).to(ThirdClass);
        instance = IoC.Container.get(FirstClass);
        expect(instance.getValue()).to.equal('third');
    });
});

describe("The IoC Container", () => {

	it("should find classes in different files", () => {
		ContainerConfig.addSource('data/*', 'test');
		
		const Worker = require('../data/classes').Worker;
		const instance = new Worker();
        expect(instance).to.exist;
        expect(instance.foo).to.exist;
		instance.work();
    });

});
