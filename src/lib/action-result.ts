/** Uniform result shape for every server action mutation, so the UI has one thing to handle. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message: string }
  | { ok: false; error: string };
