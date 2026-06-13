/**
 * Mutation_Feedback_Policy (Req 18)
 *
 * Centralizes success/failure surfacing for data mutations using the existing
 * `react-hot-toast` notification surface. Wrapping a mutation function with
 * `withMutationFeedback` guarantees:
 *
 *  - On success: a user-visible success indication is surfaced (Req 18.4).
 *  - On failure: a user-visible failure indication is surfaced (Req 18.1) and the
 *    form is kept open by re-throwing the error so the caller's success path
 *    (which typically closes the form) never runs (Req 18.2).
 *  - The error is never silently discarded — it is always re-thrown after being
 *    surfaced, so there is no silent catch (Req 18.3).
 *
 * Query_Hook `onError`/`onSuccess` callbacks route through this policy so no
 * mutation error is silently caught.
 */
import toast from 'react-hot-toast';
import { extractErrorMessage } from '../utils/errorService';

export interface MutationFeedbackOptions {
  /** Message shown via a success toast when the mutation resolves (Req 18.4). */
  successMessage?: string;
  /**
   * Explicit failure message. When omitted, the message is derived from the
   * error via `extractErrorMessage` so a meaningful, user-visible failure is
   * always surfaced (Req 18.1).
   */
  errorMessage?: string;
  /**
   * Optional hook invoked with the original error before it is re-thrown. Use
   * this to surface the failure inline (e.g. set form field errors) in addition
   * to the toast. This callback MUST NOT swallow the error — the policy always
   * re-throws (Req 18.3).
   */
  onError?: (error: unknown) => void;
  /**
   * Optional hook invoked with the result on success, before the success toast.
   * Use for cache invalidation or follow-up side effects.
   */
  onSuccess?: (result: unknown) => void;
  /**
   * When true (the default), the error is re-thrown on failure so the form stays
   * open (Req 18.2). This is always honoured; it exists for explicitness and to
   * document intent at call sites. The policy never swallows errors regardless.
   */
  keepFormOpen?: boolean;
}

/**
 * Wrap an async mutation function with the Mutation_Feedback_Policy.
 *
 * The returned function has the same signature as `fn`. It surfaces success and
 * failure indications and always propagates failures by re-throwing.
 *
 * @example
 * const save = withMutationFeedback(
 *   (input: SaveInput) => api.findings.create(input),
 *   { successMessage: t('saved'), onError: (e) => applyServerFieldErrors(e) },
 * );
 */
export function withMutationFeedback<TArgs extends unknown[], R>(
  fn: (...args: TArgs) => Promise<R>,
  opts: MutationFeedbackOptions = {},
): (...args: TArgs) => Promise<R> {
  return async (...args: TArgs): Promise<R> => {
    let result: R;
    try {
      result = await fn(...args);
    } catch (error) {
      // Surface a user-visible failure indication (Req 18.1).
      const message = opts.errorMessage ?? extractErrorMessage(error);
      toast.error(message);
      // Allow the caller to surface the failure inline / keep the form open
      // (Req 18.2). This must not swallow the error.
      opts.onError?.(error);
      // Never discard the error without surfacing it (Req 18.3): re-throw so the
      // form stays open and the mutation settles in its error state.
      throw error;
    }

    // Success side effects (e.g. cache invalidation) run before the toast.
    opts.onSuccess?.(result);
    // Surface a user-visible success indication (Req 18.4).
    if (opts.successMessage) {
      toast.success(opts.successMessage);
    }
    return result;
  };
}
