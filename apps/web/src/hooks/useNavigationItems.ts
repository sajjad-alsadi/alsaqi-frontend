/**
 * Hook that derives navigation items from the ModuleRegistry.
 *
 * Instead of hardcoding menu items in the Layout, this hook:
 * - Reads navigation config from the ModuleRegistry (single source of truth)
 * - Maps icon string identifiers to Lucide React components
 * - Filters items based on user's effective permissions (canView)
 * - Provides bilingual labels based on the current i18n language
 * - Sorts items by their configured order
 *
 * Requirements: 1.1, 11.3, 11.4
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from './usePermissions';
import { useNotificationContext } from '../context/NotificationContext';
import { useFormat } from '../utils/formatService';
import { ModuleRegistry, NavigationItem } from '../permissions/registry';
import {
  LayoutDashboard,
  CalendarRange,
  ClipboardCheck,
  Library,
  FileSearch,
  TrendingUp,
  ShieldAlert,
  Building2,
  Building,
  Scale,
  Settings,
  Users,
  Bell,
  Network,
  FileText,
  BookOpen,
  BarChart3,
  Terminal,
  ShieldCheck,
  LucideIcon,
} from 'lucide-react';

// Ensure all modules are registered before we read from the registry
import '../permissions/modules';

/** Map of icon string identifiers to Lucide React components */
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  CalendarRange,
  ClipboardCheck,
  Library,
  FileSearch,
  TrendingUp,
  ShieldAlert,
  Building2,
  Building,
  Scale,
  Settings,
  Users,
  Bell,
  Network,
  FileText,
  BookOpen,
  BarChart3,
  Terminal,
  ShieldCheck,
};

/** A resolved navigation menu item ready for rendering */
export interface MenuItemResolved {
  /** Unique identifier derived from the route path */
  id: string;
  /** Display label in the current language */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Route path */
  path: string;
  /** Module name (used for permission checks) */
  module: string;
  /** Optional badge text (e.g., notification count) */
  badge?: string;
  /** Parent module name for nested items */
  parent?: string;
  /** Sort order */
  order: number;
  /** Navigation section for grouped display */
  section: NavigationSection;
}

/** Navigation sections for sidebar grouping */
export type NavigationSection = 'audit' | 'governance' | 'organization' | 'system';

/** Section metadata for rendering */
export interface NavigationSectionMeta {
  id: NavigationSection;
  label: { en: string; ar: string };
}

/** Section definitions with bilingual labels */
export const NAVIGATION_SECTIONS: NavigationSectionMeta[] = [
  { id: 'audit', label: { en: 'Audit Lifecycle', ar: 'دورة التدقيق' } },
  { id: 'governance', label: { en: 'Risk & Compliance', ar: 'المخاطر والامتثال' } },
  { id: 'organization', label: { en: 'Organization', ar: 'المؤسسة' } },
  { id: 'system', label: { en: 'System', ar: 'النظام' } },
];

/** Map module names to their navigation section */
const MODULE_SECTION_MAP: Record<string, NavigationSection> = {
  Dashboard: 'audit',
  AuditCharter: 'audit',
  AuditPlans: 'audit',
  AuditTasks: 'audit',
  AuditProgramLibrary: 'audit',
  AuditFindings: 'audit',
  AuditEvidence: 'audit',
  Recommendations: 'audit',
  RiskRegister: 'governance',
  ComplianceMatrix: 'governance',
  IntegrityManagement: 'governance',
  Departments: 'organization',
  Reports: 'organization',
  Correspondence: 'organization',
  Notifications: 'system',
  UserManagement: 'system',
  SystemLogs: 'system',
  Settings: 'system',
};

/**
 * Derives the menu item ID from the route path.
 * e.g., '/dashboard' → 'dashboard', '/compliance-matrix' → 'compliance-matrix'
 */
function pathToId(path: string): string {
  return path.startsWith('/') ? path.substring(1) : path;
}

/**
 * Hook that provides navigation items derived from the ModuleRegistry.
 *
 * Returns only top-level items (items without a parent) that the user
 * has permission to view. Items are sorted by their configured order.
 */
export function useNavigationItems(): MenuItemResolved[] {
  const { i18n } = useTranslation();
  const { canView } = usePermissions();
  const { unreadCount } = useNotificationContext();
  const { formatNumber } = useFormat();

  const currentLang = i18n.language === 'ar' ? 'ar' : 'en';

  const menuItems = useMemo(() => {
    const navConfig: NavigationItem[] = ModuleRegistry.getNavigationConfig();

    const items: MenuItemResolved[] = [];

    for (const nav of navConfig) {
      // Skip items with a parent (nested items handled separately if needed)
      if (nav.parent) continue;

      const iconComponent = ICON_MAP[nav.icon];
      if (!iconComponent) continue; // Skip if icon not mapped

      const item: MenuItemResolved = {
        id: pathToId(nav.path),
        label: nav.label[currentLang] || nav.label.en,
        icon: iconComponent,
        path: nav.path,
        module: nav.module,
        order: nav.order,
        section: MODULE_SECTION_MAP[nav.module] || 'system',
      };

      // Add notification badge for the Notifications module
      if (nav.module === 'Notifications' && unreadCount > 0) {
        item.badge = formatNumber(unreadCount);
      }

      items.push(item);
    }

    // Items are already sorted by order from getNavigationConfig()
    return items;
  }, [currentLang, unreadCount, formatNumber]);

  // Filter by permissions - done outside useMemo since canView may change
  // when permissions are loaded asynchronously
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => canView(item.module));
  }, [menuItems, canView]);

  return filteredItems;
}
