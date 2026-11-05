import { createSignal, onCleanup } from '@zeus-js/signal'
import { getCurrentScope } from '@zeus-js/signal/internal'

import type { Accessor } from '@zeus-js/signal'

/** Values accepted by a native form or a form-associated custom element. */
export type FormValue = unknown

export type FormValues = Record<string, FormValue>

export type FormErrors = Readonly<Record<string, string>>

export interface FormSchemaContext {
  readonly form: HTMLFormElement | undefined
  readonly signal: AbortSignal
}

export interface FormSchemaResult<TValues extends FormValues> {
  values?: TValues
  errors?: FormErrors
}

export type FormSchema<TValues extends FormValues> = (
  values: Readonly<TValues>,
  context: FormSchemaContext,
) => FormSchemaResult<TValues> | Promise<FormSchemaResult<TValues>>

export interface SafeParseIssue {
  path?: readonly (string | number)[]
  message: string
}

export interface SafeParseSchema<TValues> {
  safeParse(input: unknown):
    | { success: true; data: TValues }
    | {
        success: false
        error: { issues?: readonly SafeParseIssue[]; message?: string }
      }
}

/** Adapt Zod, Valibot, or another safeParse-compatible schema without a dependency. */
export function fromSafeParse<TValues extends FormValues>(
  schema: SafeParseSchema<TValues>,
): FormSchema<TValues> {
  return values => {
    const result = schema.safeParse(values)
    if (result.success) return { values: result.data }

    const errors: Record<string, string> = {}
    const issues = result.error.issues ?? []
    for (const issue of issues) {
      const key = issue.path?.map(String).join('.') || '_form'
      errors[key] ??= issue.message
    }

    if (Object.keys(errors).length === 0) {
      errors._form = result.error.message ?? 'Form validation failed'
    }

    return { errors }
  }
}

export interface FormSubmitContext {
  readonly form: HTMLFormElement | undefined
  readonly formData: FormData
  readonly signal: AbortSignal
}

export type FormSubmitResult<TValues extends FormValues> =
  | { status: 'success'; values: TValues }
  | { status: 'invalid'; values: TValues; errors: FormErrors }
  | { status: 'error'; values: TValues; error: unknown }
  | { status: 'aborted'; values: TValues }

export interface FormFieldController<TValue = FormValue> {
  readonly name: string
  readonly value: Accessor<TValue | undefined>
  readonly error: Accessor<string | undefined>
  readonly touched: Accessor<boolean>
  readonly dirty: Accessor<boolean>
  readonly invalid: Accessor<boolean>
  set(value: TValue): void
  touch(): void
  input(event: Event): void
  change(event: Event): void
  blur(event?: Event): void
  compositionStart(event?: CompositionEvent): void
  compositionEnd(event?: CompositionEvent): void
  reset(): void
}

export interface CreateFormOptions<TValues extends FormValues> {
  initialValues: TValues
  schema?: FormSchema<TValues>
  onSubmit?: (
    values: TValues,
    context: FormSubmitContext,
  ) => unknown | Promise<unknown>
  onError?: (error: unknown, context: FormSubmitContext) => void
}

export interface FormController<TValues extends FormValues> {
  readonly values: Accessor<TValues>
  readonly errors: Accessor<FormErrors>
  readonly touched: Accessor<Readonly<Record<string, boolean>>>
  readonly submitting: Accessor<boolean>
  readonly submitError: Accessor<unknown>
  readonly submitCount: Accessor<number>
  readonly valid: Accessor<boolean>
  readonly dirty: Accessor<boolean>
  readonly form: Accessor<HTMLFormElement | undefined>
  bind(form: HTMLFormElement): () => void
  field<TName extends keyof TValues & string>(
    name: TName,
  ): FormFieldController<TValues[TName]>
  setValue<TName extends keyof TValues & string>(
    name: TName,
    value: TValues[TName],
  ): void
  setError(name: string, message: string | undefined): void
  submit(event?: SubmitEvent | Event): Promise<FormSubmitResult<TValues>>
  handleSubmit(event: SubmitEvent | Event): void
  reset(): void
  handleReset(event?: Event): void
  formData(): FormData
  dispose(): void
}

/** Convert native FormData entries into a plain object, retaining repeated names. */
export function formDataToValues(formData: FormData): FormValues {
  const values: FormValues = {}
  for (const [name, value] of formData.entries()) {
    const previous = values[name]
    if (previous === undefined) {
      values[name] = value
    } else if (Array.isArray(previous)) {
      values[name] = [...previous, value]
    } else {
      values[name] = [previous, value]
    }
  }
  return values
}

export function createForm<TValues extends FormValues>(
  options: CreateFormOptions<TValues>,
): FormController<TValues> {
  const initialValues = assignValues({}, options.initialValues) as TValues
  const [readValues, setValues] = createSignal<TValues>(
    assignValues({}, initialValues) as TValues,
  )
  const [readErrors, setErrors] = createSignal<Record<string, string>>({})
  const [readTouched, setTouched] = createSignal<Record<string, boolean>>({})
  const [readSubmitting, setSubmitting] = createSignal(false)
  const [readSubmitError, setSubmitError] = createSignal<unknown>(undefined)
  const [readSubmitCount, setSubmitCount] = createSignal(0)
  const [readForm, setForm] = createSignal<HTMLFormElement | undefined>(
    undefined,
  )

  const overrides = new Map<string, FormValue>()
  const composing = new Set<string>()
  const fields = new Map<string, FormFieldController>()
  const disposers: (() => void)[] = []
  let submitAbort: AbortController | undefined
  let disposed = false

  const setValue = (name: string, value: FormValue): void => {
    overrides.set(name, value)
    setValues(current => assignValue(current, name, value) as TValues)
    setErrors(current => withoutError(current, name))
  }

  const setError = (name: string, message: string | undefined): void => {
    setErrors(current => {
      const next = assignValues({}, current)
      if (message) next[name] = message
      else delete next[name]
      return next as Record<string, string>
    })
  }

  const markTouched = (name: string): void => {
    setTouched(
      current => assignValue(current, name, true) as Record<string, boolean>,
    )
  }

  const processControlEvent = (event: Event, name?: string): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const control = target as FormControl
    const fieldName = name ?? control.name
    if (!fieldName || (event.type === 'input' && composing.has(fieldName))) {
      return
    }
    if (event.type === 'input' && (event as InputEvent).isComposing) return
    const value = readControlValue(control)
    if (value !== undefined) setValue(fieldName, value)
    if (event.type === 'blur') markTouched(fieldName)
  }

  const handleCompositionStart = (event: Event): void => {
    const target = event.target as FormControl | null
    if (target?.name) composing.add(target.name)
  }

  const handleCompositionEnd = (event: Event): void => {
    const target = event.target as FormControl | null
    if (target?.name) composing.delete(target.name)
    processControlEvent(event)
  }

  const reset = (): void => {
    submitAbort?.abort()
    submitAbort = undefined
    overrides.clear()
    composing.clear()
    setValues(assignValues({}, initialValues) as TValues)
    setErrors({})
    setTouched({})
    setSubmitError(undefined)
    setSubmitting(false)

    const form = readForm()
    if (form) queueMicrotask(() => syncControls(form, readValues()))
  }

  const handleReset = (_event?: Event): void => {
    reset()
  }

  const bind = (form: HTMLFormElement): (() => void) => {
    if (disposed) return () => {}
    const previous = readForm()
    if (previous) unbindCurrent()
    setForm(form)

    const submitListener = (event: Event): void => {
      void submit(event)
    }
    const resetListener = (event: Event): void => handleReset(event)
    const inputListener = (event: Event): void => processControlEvent(event)
    const changeListener = (event: Event): void => processControlEvent(event)
    const blurListener = (event: Event): void => processControlEvent(event)

    form.addEventListener('submit', submitListener)
    form.addEventListener('reset', resetListener)
    form.addEventListener('input', inputListener)
    form.addEventListener('change', changeListener)
    form.addEventListener('blur', blurListener, true)
    form.addEventListener('compositionstart', handleCompositionStart)
    form.addEventListener('compositionend', handleCompositionEnd)

    const release = (): void => {
      form.removeEventListener('submit', submitListener)
      form.removeEventListener('reset', resetListener)
      form.removeEventListener('input', inputListener)
      form.removeEventListener('change', changeListener)
      form.removeEventListener('blur', blurListener, true)
      form.removeEventListener('compositionstart', handleCompositionStart)
      form.removeEventListener('compositionend', handleCompositionEnd)
      const index = disposers.indexOf(release)
      if (index >= 0) disposers.splice(index, 1)
      if (readForm() === form) setForm(undefined)
    }
    disposers.push(release)
    return release
  }

  const unbindCurrent = (): void => {
    const release = disposers.pop()
    release?.()
    setForm(undefined)
  }

  const formData = (): FormData => {
    const form = readForm()
    const data = form ? new FormData(form) : new FormData()
    if (!form) appendValues(data, readValues())
    for (const [name, value] of overrides) {
      data.delete(name)
      appendValue(data, name, value)
    }
    return data
  }

  const collectValues = (): TValues => {
    const native = formDataToValues(formData())
    const merged = assignValues({}, readValues(), native, mapOf(overrides))
    return merged as TValues
  }

  const validate = async (
    values: TValues,
    signal: AbortSignal,
  ): Promise<FormSchemaResult<TValues>> => {
    const form = readForm()
    if (form && !form.checkValidity()) {
      return { errors: collectNativeErrors(form) }
    }
    if (!options.schema) return {}
    return options.schema(values, { form, signal })
  }

  const submit = async (
    event?: SubmitEvent | Event,
  ): Promise<FormSubmitResult<TValues>> => {
    if (disposed) return { status: 'aborted', values: readValues() }
    event?.preventDefault()
    if (readSubmitting()) return { status: 'aborted', values: readValues() }

    setSubmitCount(count => count + 1)
    setSubmitError(undefined)
    submitAbort?.abort()
    const controller = new AbortController()
    submitAbort = controller
    const values = collectValues()
    let validation: FormSchemaResult<TValues>

    try {
      validation = await validate(values, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) {
        return { status: 'aborted', values }
      }
      setSubmitError(error)
      options.onError?.(error, {
        form: readForm(),
        formData: formData(),
        signal: controller.signal,
      })
      return { status: 'error', values, error }
    }

    if (controller.signal.aborted) return { status: 'aborted', values }
    if (validation.values) setValues(validation.values)
    const validatedValues = validation.values ?? values
    const errors = validation.errors ?? {}
    setErrors(assignValues({}, errors) as Record<string, string>)
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid(readForm(), errors)
      return { status: 'invalid', values: validatedValues, errors }
    }

    if (!options.onSubmit) return { status: 'success', values: validatedValues }

    setSubmitting(true)
    const context: FormSubmitContext = {
      form: readForm(),
      formData: formData(),
      signal: controller.signal,
    }
    try {
      await options.onSubmit(validatedValues, context)
      if (controller.signal.aborted) {
        return { status: 'aborted', values: validatedValues }
      }
      return { status: 'success', values: validatedValues }
    } catch (error) {
      if (controller.signal.aborted) {
        return { status: 'aborted', values: validatedValues }
      }
      setSubmitError(error)
      options.onError?.(error, context)
      return { status: 'error', values: validatedValues, error }
    } finally {
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  const handleSubmit = (event: SubmitEvent | Event): void => {
    void submit(event)
  }

  const field = <TName extends keyof TValues & string>(
    name: TName,
  ): FormFieldController<TValues[TName]> => {
    const existing = fields.get(name)
    if (existing) return existing as FormFieldController<TValues[TName]>

    const controller: FormFieldController<TValues[TName]> = {
      name,
      value: () => readValues()[name] as TValues[TName] | undefined,
      error: () => readErrors()[name],
      touched: () => Boolean(readTouched()[name]),
      dirty: () => !Object.is(readValues()[name], initialValues[name]),
      invalid: () => readErrors()[name] !== undefined,
      set(value) {
        setValue(name, value)
      },
      touch() {
        markTouched(name)
      },
      input(event) {
        processControlEvent(event, name)
      },
      change(event) {
        processControlEvent(event, name)
      },
      blur(event) {
        if (event) processControlEvent(event, name)
        else markTouched(name)
      },
      compositionStart() {
        composing.add(name)
      },
      compositionEnd(event) {
        composing.delete(name)
        if (event) processControlEvent(event, name)
      },
      reset() {
        setValue(name, initialValues[name])
        setTouched(current => {
          const next = assignValues({}, current)
          delete next[name]
          return next as Record<string, boolean>
        })
      },
    }
    fields.set(name, controller)
    return controller
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    submitAbort?.abort()
    while (disposers.length > 0) disposers.pop()?.()
    setForm(undefined)
    fields.clear()
  }

  if (getCurrentScope()) onCleanup(dispose)

  return {
    values: readValues,
    errors: readErrors,
    touched: readTouched,
    submitting: readSubmitting,
    submitError: readSubmitError,
    submitCount: readSubmitCount,
    valid: () => Object.keys(readErrors()).length === 0,
    dirty: () => !sameValues(readValues(), initialValues),
    form: readForm,
    bind,
    field,
    setValue(name, value) {
      setValue(name, value)
    },
    setError,
    submit,
    handleSubmit,
    reset,
    handleReset,
    formData,
    dispose,
  }
}

type FormControl =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement
  | (Element & { name?: string; value?: unknown })

function readControlValue(control: FormControl): FormValue | undefined {
  if (control instanceof HTMLInputElement) {
    if (control.type === 'checkbox') return control.checked
    if (control.type === 'radio')
      return control.checked ? control.value : undefined
    return control.value
  }
  if (control instanceof HTMLSelectElement && control.multiple) {
    return Array.from(control.selectedOptions).map(option => option.value)
  }
  if ('value' in control) return control.value
  return undefined
}

function collectNativeErrors(form: HTMLFormElement): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLElement)) continue
    const control = element as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
    if (!control.name || !('validity' in control) || control.validity.valid)
      continue
    errors[control.name] = control.validationMessage || 'Invalid value'
  }
  return errors
}

function focusFirstInvalid(
  form: HTMLFormElement | undefined,
  errors: FormErrors,
): void {
  if (!form) return
  for (const name of Object.keys(errors)) {
    const control = form.elements.namedItem(name)
    if (control instanceof HTMLElement) {
      control.focus()
      return
    }
  }
}

function syncControls(form: HTMLFormElement, values: FormValues): void {
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof Element)) continue
    const control = element as FormControl
    const name = control.name
    if (!name || !(name in values)) continue
    const value = values[name]
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      control.checked = Boolean(value)
    } else if (control instanceof HTMLSelectElement && control.multiple) {
      const selected = new Set(
        Array.isArray(value) ? value.map(String) : [String(value)],
      )
      for (const option of Array.from(control.options)) {
        option.selected = selected.has(option.value)
      }
    } else if ('value' in control && typeof value === 'string') {
      control.value = value
    }
  }
}

function appendValues(data: FormData, values: FormValues): void {
  for (const [name, value] of Object.entries(values))
    appendValue(data, name, value)
}

function appendValue(data: FormData, name: string, value: FormValue): void {
  if (value === undefined || value === null || value === false) return
  if (Array.isArray(value)) {
    for (const item of value) appendValue(data, name, item)
    return
  }
  if (typeof File !== 'undefined' && value instanceof File) {
    data.append(name, value)
  } else data.append(name, String(value === true ? 'on' : value))
}

function assignValues(
  target: FormValues,
  ...sources: readonly FormValues[]
): FormValues {
  for (const source of sources) Object.assign(target, source)
  return target
}

function assignValue(
  current: FormValues,
  name: string,
  value: FormValue,
): FormValues {
  const next = assignValues({}, current)
  next[name] = value
  return next
}

function mapOf(values: Map<string, FormValue>): FormValues {
  const result: FormValues = {}
  for (const [name, value] of values) result[name] = value
  return result
}

function withoutError(
  errors: Readonly<Record<string, string>>,
  name: string,
): Record<string, string> {
  const next = assignValues({}, errors) as Record<string, string>
  delete next[name]
  return next
}

function sameValues(left: FormValues, right: FormValues): boolean {
  const names = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const name of names) {
    if (!Object.is(left[name], right[name])) return false
  }
  return true
}
