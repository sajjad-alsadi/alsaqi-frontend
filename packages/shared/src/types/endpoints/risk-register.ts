/**
 * Endpoint contract interfaces for the Risk Register module.
 * Defines the request/response shapes for each route.
 *
 * Response/body shapes reference the relocated `RiskItemSchema` validator
 * (via its inferred `RiskItemValidated` type) so the contract stays in lockstep
 * with the single source of validation truth.
 */
import type { RiskItemValidated } from '../../validators/risk-register';

export interface RiskRegisterEndpoints {
  'GET /risk-register': {
    query: { page?: number; pageSize?: number; status?: string; rating?: string };
    response: RiskItemValidated[];
  };
  'GET /risk-register/:id': {
    params: { id: string };
    response: RiskItemValidated;
  };
  'POST /risk-register': {
    body: Omit<RiskItemValidated, 'id'>;
    response: RiskItemValidated;
  };
  'PUT /risk-register/:id': {
    params: { id: string };
    body: Partial<Omit<RiskItemValidated, 'id'>>;
    response: RiskItemValidated;
  };
  'DELETE /risk-register/:id': {
    params: { id: string };
    response: { deleted: boolean };
  };
}
