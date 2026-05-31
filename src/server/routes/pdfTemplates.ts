import express from 'express';
import { z } from 'zod';
import { PdfTemplateService } from '../services/PdfTemplateService';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';

const templateSchema = z.object({
  template_name: z.string(),
  template_type: z.string(),
  content: z.string(),
  status: z.enum(['Draft', 'Approved', 'Archived']).optional(),
  is_default: z.union([z.boolean(), z.number()]).optional()
});

export const createPdfTemplatesRoutes = (
  db: any,
  authenticate: any,
  checkPermission: any,
  logError: any
) => {
  const router = express.Router();

  router.get(`/pdf-templates`, authenticate, checkPermission('Settings', 'View'), asyncHandler(async (req, res) => {
    const templates = await PdfTemplateService.getAll();
    res.json(templates);
  }));

  router.get(`/pdf-templates/active`, authenticate, asyncHandler(async (req, res) => {
    const { type } = req.query;
    if (!type) {
      return res.status(400).json({ error: "Type is required" });
    }
    const template = await PdfTemplateService.getActiveByType(type as string);
    if (!template) {
      return res.status(404).json({ error: "No active template found" });
    }
    res.json(template);
  }));

  router.get(`/pdf-templates/:id`, authenticate, checkPermission('Settings', 'View'), asyncHandler(async (req, res) => {
    const template = await PdfTemplateService.getById(req.params.id as string);
    res.json(template);
  }));

  router.post(`/pdf-templates`, authenticate, checkPermission('Settings', 'Edit'), asyncHandler(async (req, res) => {
    const validation = templateSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid template data", validation.error.format());
    }
    const username = (req as any).user.username;
    const template = await PdfTemplateService.create(validation.data, username);
    res.json(template);
  }));

  router.put(`/pdf-templates/:id`, authenticate, checkPermission('Settings', 'Edit'), asyncHandler(async (req, res) => {
    const validation = templateSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid template data", validation.error.format());
    }
    const username = (req as any).user.username;
    const template = await PdfTemplateService.update(req.params.id as string, validation.data, username);
    res.json(template);
  }));

  router.delete(`/pdf-templates/:id`, authenticate, checkPermission('Settings', 'Edit'), asyncHandler(async (req, res) => {
    const username = (req as any).user.username;
    await PdfTemplateService.delete(req.params.id as string, username);
    res.json({ success: true });
  }));

  return router;
};
