/**
 * Endpoint contract interfaces for the Regulatory (central bank instructions) module.
 * Defines the request/response shapes for each route.
 *
 * Response/body shapes reference the relocated `InstructionSchema` validator
 * (via its inferred `InstructionValidated` type) so the contract stays in
 * lockstep with the single source of validation truth.
 */
import type { InstructionValidated } from '../../validators/regulatory';

export interface RegulatoryEndpoints {
  'GET /central-bank-instructions': {
    response: InstructionValidated[];
  };
  'POST /central-bank-instructions': {
    body: Omit<InstructionValidated, 'id'>;
    response: InstructionValidated;
  };
  'PUT /central-bank-instructions/:id': {
    params: { id: string };
    body: Partial<Omit<InstructionValidated, 'id'>>;
    response: InstructionValidated;
  };
  'DELETE /central-bank-instructions/:id': {
    params: { id: string };
    response: { deleted: boolean };
  };
}
