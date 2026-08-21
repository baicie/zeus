// using literal strings instead of numbers so that it's easier to inspect
// debugger events

export enum TrackOpTypes {
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate',
}

export enum TriggerOpTypes {
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear',
}

export enum ReactiveFlags {
  SKIP = '__v_skip',
  IS_REACTIVE = '__v_isReactive',
  IS_READONLY = '__v_isReadonly',
  IS_SHALLOW = '__v_isShallow',
  RAW = '__v_raw',
  IS_REF = '__v_isRef',
}

export enum RuntimeDiagnosticsField {
  ACTIVE,
  EFFECTS_CREATED,
  EFFECTS_DISPOSED,
  PROXIES_CREATED,
  SCOPES_CREATED,
  SCOPES_DISPOSED,
  REFS_CREATED,
  MEMOS_CREATED,
  WRAP_EFFECT,
  WRAP_SCOPE,
}
