import { db } from '../db/index';
import { NotFoundError } from '../utils/errors';

export class AuditProgramService {
  private static db = db;

  static async duplicate(id: string | number, username: string) {
    return await this.db.transaction(async () => {
      const program = await this.db.prepare("SELECT * FROM audit_programs WHERE id = ?").get(id) as any;
      if (!program) throw new NotFoundError("Program not found");
      
      const { id: oldId, created_at, updated_at, ...programData } = program;
      programData.program_title = `${programData.program_title} (Copy)`;
      programData.program_code = `${programData.program_code}-COPY`;
      programData.status = 'Draft';
      programData.created_by = username;
      programData.version_number = 1;
      
      const keys = Object.keys(programData).map(k => this.db.validateIdentifier(k));
      const values = Object.values(programData);
      const placeholders = keys.map(() => "?").join(",");
      const stmt = this.db.prepare(`INSERT INTO audit_programs (${keys.join(",")}) VALUES (${placeholders}) RETURNING id`);
      const res = await stmt.get(...values);
      const newId = res.id;
      
      // Duplicate procedures using a single efficient INSERT INTO ... SELECT query (Replacing N+1 Query)
      await this.db.prepare(`
        INSERT INTO audit_procedures (
          program_id, procedure_number, audit_step, audit_test_description, 
          risk_addressed, control_test_type, expected_evidence, 
          sampling_method, responsible_auditor, remarks
        )
        SELECT 
          ?, procedure_number, audit_step, audit_test_description, 
          risk_addressed, control_test_type, expected_evidence, 
          sampling_method, responsible_auditor, remarks
        FROM audit_procedures WHERE program_id = ?
      `).run(newId, id);
      
      return newId;
    })();
  }

  static async approve(id: string | number) {
    await this.db.prepare("UPDATE audit_programs SET status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  }
}
