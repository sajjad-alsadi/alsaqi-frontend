// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Integration Tests - Recommendations Routes
 *
 * Tests the recommendations routes using supertest against a minimal Express app.
 * Includes the PATCH /:id/resolve endpoint and CRUD operations.
 */

interface MockRecommendation {
  id: string;
  finding_id: string;
  description: string;
  responsible: string;
  due_date: string;
  status: string;
  closure_evidence_path?: string;
  closed_by?: string;
  closed_at?: string;
}

function createRecommendationsTestApp() {
  const app = express();
  app.use(express.json());

  const recommendations: MockRecommendation[] = [
    {
      id: 'rec-1',
      finding_id: 'finding-1',
      description: 'Implement quarterly access reviews',
      responsible: 'IT Security Team',
      due_date: '2025-06-30',
      status: 'open',
    },
    {
      id: 'rec-2',
      finding_id: 'finding-1',
      description: 'Deploy MFA for all admin accounts',
      responsible: 'IT Operations',
      due_date: '2025-04-15',
      status: 'in_progress',
    },
    {
      id: 'rec-3',
      finding_id: 'finding-2',
      description: 'Automate backup verification',
      responsible: 'Infrastructure Team',
      due_date: '2025-05-01',
      status: 'closed',
      closure_evidence_path: '/evidence/backup-test-report.pdf',
      closed_by: 'user-1',
      closed_at: '2025-03-15T10:00:00Z',
    },
  ];

  // Simulate authenticate middleware
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: 'user-1', role: 'Admin', username: 'admin', name: 'Admin User' };
    next();
  };

  const logError = vi.fn();

  const router = express.Router();

  // GET all recommendations
  router.get('/', authenticate, (req, res) => {
    const { finding_id, status } = req.query;
    let filtered = [...recommendations];
    if (finding_id) filtered = filtered.filter(r => r.finding_id === finding_id);
    if (status) filtered = filtered.filter(r => r.status === status);
    res.json({ data: filtered, total: filtered.length });
  });

  // GET single recommendation
  router.get('/:id', authenticate, (req, res) => {
    const rec = recommendations.find(r => r.id === req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recommendation not found' });
    res.json(rec);
  });

  // POST create recommendation
  router.post('/', authenticate, (req, res) => {
    const { finding_id, description, responsible, due_date } = req.body;
    if (!finding_id || !description) {
      return res.status(400).json({ error: 'finding_id and description are required' });
    }
    const newRec: MockRecommendation = {
      id: `rec-${Date.now()}`,
      finding_id,
      description,
      responsible: responsible || '',
      due_date: due_date || '',
      status: 'open',
    };
    recommendations.push(newRec);
    res.status(201).json(newRec);
  });

  // PATCH resolve recommendation
  router.patch('/:id/resolve', authenticate, (req, res) => {
    const { id } = req.params;
    const { closure_evidence_path } = req.body;

    if (!closure_evidence_path) {
      return res.status(400).json({ error: 'Evidence path is mandatory to close a recommendation' });
    }

    const idx = recommendations.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Recommendation not found' });

    recommendations[idx] = {
      ...recommendations[idx],
      status: 'closed',
      closure_evidence_path,
      closed_by: (req as any).user.id,
      closed_at: new Date().toISOString(),
    };

    res.json({ success: true });
  });

  // DELETE recommendation
  router.delete('/:id', authenticate, (req, res) => {
    const idx = recommendations.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Recommendation not found' });
    recommendations.splice(idx, 1);
    res.json({ success: true });
  });

  app.use('/api/recommendations', router);

  return { app };
}

describe('Recommendations Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    const testApp = createRecommendationsTestApp();
    app = testApp.app;
  });

  describe('GET /api/recommendations', () => {
    it('should return 200 with list of recommendations when authenticated', async () => {
      const res = await request(app)
        .get('/api/recommendations')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(3);
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/recommendations');

      expect(res.status).toBe(401);
    });

    it('should filter by finding_id', async () => {
      const res = await request(app)
        .get('/api/recommendations?finding_id=finding-1')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data.every((r: any) => r.finding_id === 'finding-1')).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/recommendations?status=open')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('open');
    });
  });

  describe('GET /api/recommendations/:id', () => {
    it('should return 200 with recommendation details', async () => {
      const res = await request(app)
        .get('/api/recommendations/rec-1')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('rec-1');
      expect(res.body.description).toBe('Implement quarterly access reviews');
    });

    it('should return 404 for non-existent recommendation', async () => {
      const res = await request(app)
        .get('/api/recommendations/non-existent')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/recommendations', () => {
    it('should return 201 with created recommendation', async () => {
      const res = await request(app)
        .post('/api/recommendations')
        .set('Authorization', 'Bearer valid-token')
        .send({
          finding_id: 'finding-2',
          description: 'New recommendation',
          responsible: 'Security Team',
          due_date: '2025-07-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.description).toBe('New recommendation');
      expect(res.body.status).toBe('open');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/recommendations')
        .set('Authorization', 'Bearer valid-token')
        .send({ responsible: 'Someone' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });
  });

  describe('PATCH /api/recommendations/:id/resolve', () => {
    it('should return 200 when resolving with evidence path', async () => {
      const res = await request(app)
        .patch('/api/recommendations/rec-1/resolve')
        .set('Authorization', 'Bearer valid-token')
        .send({ closure_evidence_path: '/evidence/access-review-report.pdf' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when closure_evidence_path is missing', async () => {
      const res = await request(app)
        .patch('/api/recommendations/rec-1/resolve')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Evidence path is mandatory');
    });

    it('should return 404 for non-existent recommendation', async () => {
      const res = await request(app)
        .patch('/api/recommendations/non-existent/resolve')
        .set('Authorization', 'Bearer valid-token')
        .send({ closure_evidence_path: '/evidence/report.pdf' });

      expect(res.status).toBe(404);
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .patch('/api/recommendations/rec-1/resolve')
        .send({ closure_evidence_path: '/evidence/report.pdf' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/recommendations/:id', () => {
    it('should return 200 on successful deletion', async () => {
      const res = await request(app)
        .delete('/api/recommendations/rec-1')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent recommendation', async () => {
      const res = await request(app)
        .delete('/api/recommendations/non-existent')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
    });
  });
});
