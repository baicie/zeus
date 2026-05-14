# Zeus Compiler Error & Logger System

## 目标

- 编译错误统一使用 `CompilerError`。
- 每个错误都有稳定的 `CompilerErrorCode`。
- 错误尽量携带 Babel `path`，便于定位源码位置。
- 日志统一走 `@baicie/logger` 创建的 `logger`。

## 目录

```txt
src/errors/
  CompilerError.ts
  codes.ts
  index.ts

src/utils/logger.ts
```

## 使用规范

不要直接写：

```ts
throw new Error('xxx')
```

推荐：

```ts
throw new CompilerError({
  code: CompilerErrorCode.EMPTY_EXPRESSION,
  message: 'JSX expression cannot be empty.',
  path,
})
```

## Logger

```ts
import { logger } from '../utils'

logger.info(result)
logger.warn('message')
logger.error(error)
```

当前 logger 基于项目已有的 `@baicie/logger`：

```ts
createLoggerInstance({
  prefix: 'zeus-compiler',
})
```
