export class RequestTimeoutError extends Error {
  constructor(message = 'A consulta demorou demais. Tente atualizar novamente.') {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

// Bound the entire operation, including response-body reading. Abort alone is
// insufficient when a transport never settles or ignores the signal.
export async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
  message?: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const limit = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort(externalSignal?.reason);
      reject(externalSignal?.reason ?? new DOMException('Consulta cancelada.', 'AbortError'));
    };
    if (externalSignal?.aborted) { onAbort(); return; }
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      const error = new RequestTimeoutError(message);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw controller.signal.reason;
        return operation(controller.signal);
      }),
      limit,
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) externalSignal?.removeEventListener('abort', onAbort);
    controller.abort();
  }
}
