import express from 'express';
import { z } from 'zod';
import { CommentService } from '../services/CommentService';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';

const commentSchema = z.object({
  related_type: z.string().min(1),
  related_id: z.string().min(1),
  content: z.string().min(1).max(5000),
});

export const createCommentRoutes = (db: any, authenticate: any, logError: any) => {
  const router = express.Router();

  router.get("/:type/:id", authenticate, asyncHandler(async (req, res) => {
    const comments = await CommentService.getComments(req.params.type as string, req.params.id as string);
    res.json(comments);
  }));

  router.post("/", authenticate, asyncHandler(async (req, res) => {
    const validation = commentSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid comment data", validation.error.format());
    }
    const result = await CommentService.createComment((req as any).user.id, validation.data);
    res.json(result);
  }));

  return router;
};
