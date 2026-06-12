import { z } from 'zod';

interface RiskItem {
  id?: string;
  risk_id: string;
  score: number;
}

// Variant A: natural optional
const A = z.object({
  id: z.string().optional(),
  risk_id: z.string(),
  score: z.number(),
});
type AInfer = z.infer<typeof A>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _a: RiskItem = {} as AInfer; // expect: FAIL (id?: string | undefined)

// Variant B: derive RiskItem-compatible via mapped removal of undefined on optionals is not trivial.
// Try: schema typed so output matches exactly using a satisfies on the inferred type relation
type Equal<X, Y> = X extends Y ? (Y extends X ? true : false) : false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _eq: Equal<AInfer, RiskItem> = false as Equal<AInfer, RiskItem>;

// Variant C: client.get style generic inference
declare function get<T>(schema: z.ZodType<T>): T;
const cRes: RiskItem = get(A); // expect: FAIL
void cRes;
