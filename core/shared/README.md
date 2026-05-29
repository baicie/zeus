# @zeus-js/shared

Internal utility functions and constants shared across `@zeus-js` packages.

## API Reference

### General Utilities

#### Constants

- `EMPTY_OBJ` - Frozen empty object
- `EMPTY_ARR` - Frozen empty array
- `NOOP` - No-operation function
- `NO` - Function that always returns false

#### Type Guards

- `isArray(val)` - Check if value is an array
- `isMap(val)` - Check if value is a Map
- `isSet(val)` - Check if value is a Set
- `isDate(val)` - Check if value is a Date
- `isRegExp(val)` - Check if value is a RegExp
- `isFunction(val)` - Check if value is a function
- `isString(val)` - Check if value is a string
- `isSymbol(val)` - Check if value is a symbol
- `isObject(val)` - Check if value is an object
- `isPromise(val)` - Check if value is a Promise
- `isPlainObject(val)` - Check if value is a plain object
- `isIntegerKey(key)` - Check if key is an integer string

#### Event Utilities

- `isOn(key)` - Check if key is an event handler (starts with 'on')
- `isModelListener(key)` - Check if key is a v-model listener

#### String Utilities

- `camelize(str)` - Convert kebab-case to camelCase
- `hyphenate(str)` - Convert camelCase to kebab-case
- `capitalize(str)` - Capitalize first letter
- `toHandlerKey(str)` - Convert to event handler key (e.g., 'click' -> 'onClick')

#### Object Utilities

- `extend(...sources)` - Object.assign alias
- `hasOwn(obj, key)` - Check if object has own property
- `hasChanged(value, oldValue)` - Check if value has changed (handles NaN)
- `def(obj, key, value, writable?)` - Define property with defaults
- `remove(arr, item)` - Remove item from array

#### Array Utilities

- `invokeArrayFns(fns, ...args)` - Invoke all functions in array

#### Type Utilities

- `toTypeString(val)` - Get Object.prototype.toString result
- `toRawType(val)` - Get raw type string
- `objectToString` - Object.prototype.toString reference

#### Number Utilities

- `looseToNumber(val)` - Convert to number with loose parsing
- `toNumber(val)` - Convert string to number

#### Global Utilities

- `getGlobalThis()` - Get global this (handles different environments)

#### Props Utilities

- `isReservedProp(key)` - Check if prop is reserved (key, ref, etc.)
- `isBuiltInDirective(key)` - Check if key is a built-in directive

#### Code Generation

- `genPropsAccessExp(name)` - Generate props access expression
- `genCacheKey(source, options)` - Generate cache key for source
