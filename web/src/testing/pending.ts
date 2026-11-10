export function pending<T>() {
  let finish: (value: T) => void = () => {
    throw new Error('promise is not ready')
  }
  const promise = new Promise<T>((resolve) => {
    finish = resolve
  })
  return { promise, finish: (value: T) => finish(value) }
}
