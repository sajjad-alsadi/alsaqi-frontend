import cron from 'node-cron';
import { db } from '../db/index';
import logger from '../utils/logger';
import { NotificationService } from '../services/NotificationService';
import { UserRole } from '../../constants';

export const startAutomationJobs = () => {
  logger.info('[CRON] Starting automation jobs...');

  // Run every day at midnight (0 0 * * *)
  // For testing purposes, we could run it more frequently, but daily is standard.
  cron.schedule('0 0 * * *', async () => {
    logger.info('[CRON] Running daily automation tasks...');
    try {
      await runDailyAutomations();
    } catch (error) {
      logger.error('[CRON] Error running daily automations:', error);
    }
  });

  // Run immediately on startup to catch up
  runDailyAutomations().catch(err => {
    logger.error('[CRON] Error running initial automations:', err);
  });
};

const runDailyAutomations = async () => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  logger.info(`[CRON] Executing automations for date: ${todayStr}`);

  // 1. Auto-Status Update for Audit Plans (Planned -> In Progress)
  try {
    const plansToUpdate = await db.prepare(`
      SELECT id, title, lead_auditor 
      FROM audit_plans 
      WHERE status = 'Planned' AND planned_start_date <= ?
    `).all(todayStr);

    if (plansToUpdate && plansToUpdate.length > 0) {
      logger.info(`[CRON] Found ${plansToUpdate.length} audit plans to start.`);
      
      const updateStmt = await db.prepare(`
        UPDATE audit_plans 
        SET status = 'In Progress' 
        WHERE status = 'Planned' AND planned_start_date <= ?
      `);
      await updateStmt.run(todayStr);

      // Notify lead auditors
      for (const plan of plansToUpdate) {
        if (plan.lead_auditor) {
          // Find user ID for lead auditor
          const user = await db.prepare(`SELECT id FROM users WHERE name = ? OR username = ?`).get(plan.lead_auditor, plan.lead_auditor);
          if (user) {
            await NotificationService.create(
              user.id,
              'plan_started',
              `The audit plan "${plan.title}" has automatically started today.`,
              'info',
              `/plan`
            );
          }
        }
      }
    }
  } catch (err) {
    logger.error('[CRON] Error updating audit plans:', err);
  }

  // 2. Auto-Status Update for Recommendations (Open/In Progress -> Overdue)
  try {
    const overdueRecs = await db.prepare(`
      SELECT id, responsible, finding_id 
      FROM recommendations 
      WHERE status IN ('Open', 'In Progress') AND due_date < ?
    `).all(todayStr);

    if (overdueRecs && overdueRecs.length > 0) {
      logger.info(`[CRON] Found ${overdueRecs.length} overdue recommendations.`);
      
      const updateStmt = await db.prepare(`
        UPDATE recommendations 
        SET status = 'Overdue' 
        WHERE status IN ('Open', 'In Progress') AND due_date < ?
      `);
      await updateStmt.run(todayStr);

      // Notify responsible persons
      for (const rec of overdueRecs) {
        if (rec.responsible) {
          const user = await db.prepare(`SELECT id FROM users WHERE name = ? OR username = ?`).get(rec.responsible, rec.responsible);
          if (user) {
            await NotificationService.create(
              user.id,
              'recommendation_overdue',
              `A recommendation assigned to you is now overdue.`,
              'warning',
              `/recommendations`
            );
          }
        }
      }
    }
  } catch (err) {
    logger.error('[CRON] Error updating recommendations:', err);
  }

  // 3. Smart Escalation (Reminders for upcoming recommendations - 7 days before)
  try {
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    const upcomingRecs = await db.prepare(`
      SELECT id, responsible 
      FROM recommendations 
      WHERE status IN ('Open', 'In Progress') AND due_date = ?
    `).all(nextWeekStr);

    if (upcomingRecs && upcomingRecs.length > 0) {
      logger.info(`[CRON] Found ${upcomingRecs.length} recommendations due in 7 days.`);
      
      for (const rec of upcomingRecs) {
        if (rec.responsible) {
          const user = await db.prepare(`SELECT id FROM users WHERE name = ? OR username = ?`).get(rec.responsible, rec.responsible);
          if (user) {
            await NotificationService.create(
              user.id,
              'recommendation_due_soon',
              `A recommendation assigned to you is due in 7 days.`,
              'info',
              `/recommendations`
            );
          }
        }
      }
    }
  } catch (err) {
    logger.error('[CRON] Error sending upcoming recommendation reminders:', err);
  }

  // 4. Compliance Automation: Flag overdue central bank instructions
  try {
    const overdueInstructions = await db.prepare(`
      SELECT id, title, related_department 
      FROM central_bank_instructions 
      WHERE status IN ('Draft', 'Under Review') AND issue_date < ?
    `).all(todayStr);

    if (overdueInstructions && overdueInstructions.length > 0) {
      logger.info(`[CRON] Found ${overdueInstructions.length} overdue central bank instructions.`);
      
      const updateStmt = await db.prepare(`
        UPDATE central_bank_instructions 
        SET status = 'Overdue' 
        WHERE status IN ('Draft', 'Under Review') AND issue_date < ?
      `);
      await updateStmt.run(todayStr);

      // Notify department heads or compliance officers
      // For now, notify all admins
      const admins = await db.prepare(`SELECT id FROM users WHERE role IN ('${UserRole.ADMIN}')`).all();
      for (const admin of admins) {
        await NotificationService.create(
          admin.id,
          'instruction_overdue',
          `Central Bank Instruction(s) have become overdue. Please review.`,
          'warning',
          `/regulatory`
        );
      }
    }
  } catch (err) {
    logger.error('[CRON] Error updating central bank instructions:', err);
  }

  // 5. Policy Automation: Periodic review reminders (e.g., 1 year since upload)
  try {
    const lastYear = new Date(now);
    lastYear.setFullYear(now.getFullYear() - 1);
    const lastYearStr = lastYear.toISOString().split('T')[0];

    const policiesToReview = await db.prepare(`
      SELECT id, title, department 
      FROM internal_policies 
      WHERE status = 'active' AND upload_date <= ?
    `).all(lastYearStr);

    if (policiesToReview && policiesToReview.length > 0) {
      logger.info(`[CRON] Found ${policiesToReview.length} policies requiring annual review.`);
      
      const updateStmt = await db.prepare(`
        UPDATE internal_policies 
        SET status = 'needs_review' 
        WHERE status = 'active' AND upload_date <= ?
      `);
      await updateStmt.run(lastYearStr);

      const admins = await db.prepare(`SELECT id FROM users WHERE role IN ('${UserRole.ADMIN}')`).all();
      for (const admin of admins) {
        await NotificationService.create(
          admin.id,
          'policy_review_required',
          `${policiesToReview.length} internal policies have reached their 1-year review mark.`,
          'info',
          `/legal`
        );
      }
    }
  } catch (err) {
    logger.error('[CRON] Error updating internal policies:', err);
  }

  // 6. Audit Tasks — Deadline approaching (3 days before due_date)
  try {
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(now.getDate() + 3);
    const threeDaysStr = threeDaysLater.toISOString().split('T')[0];

    const upcomingTasks = await db.prepare(`
      SELECT id, title, assigned_to, due_date
      FROM audit_tasks 
      WHERE status NOT IN ('completed', 'cancelled') 
        AND due_date = ? 
        AND deleted_at IS NULL
        AND assigned_to IS NOT NULL
    `).all(threeDaysStr);

    if (upcomingTasks && upcomingTasks.length > 0) {
      logger.info(`[CRON] Found ${upcomingTasks.length} tasks due in 3 days.`);
      
      for (const task of upcomingTasks) {
        await NotificationService.create(
          task.assigned_to,
          'task_status_changed',
          JSON.stringify({ key: 'notifications.taskDeadlineNear', params: { title: task.title, date: task.due_date } }),
          'AuditTasks',
          `/tasks`,
          { entityId: task.id, entityType: 'audit_task', title: JSON.stringify({ key: 'notifications.taskDeadlineNear' }) }
        );
      }
    }
  } catch (err) {
    logger.error('[CRON] Error sending task deadline reminders:', err);
  }

  logger.info('[CRON] Daily automations completed.');
};
