// Environment variables and mode handling

export interface EnvVariables {
  NODE_ENV: string
  MODE: string
  DEV: boolean
  PROD: boolean
  SSR: boolean
}

export function getEnv(): EnvVariables {
  const NODE_ENV = process.env.NODE_ENV || 'development'
  const MODE = process.env.MODE || NODE_ENV

  return {
    NODE_ENV,
    MODE,
    DEV: NODE_ENV === 'development',
    PROD: NODE_ENV === 'production',
    SSR: !!process.env.SSR,
  }
}

export function defineConfig(config: Record<string, any>): Record<string, any> {
  return config
}

export function resolveEnvAlias(alias: string): string | undefined {
  const envMap: Record<string, string> = {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.DEV': JSON.stringify(process.env.NODE_ENV !== 'production'),
    'process.env.PROD': JSON.stringify(process.env.NODE_ENV === 'production'),
  }

  return envMap[alias]
}
