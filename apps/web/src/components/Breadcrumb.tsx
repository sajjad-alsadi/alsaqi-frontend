import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * Breadcrumb navigation for deep pages.
 * Shows the path hierarchy and allows quick navigation back.
 * 
 * @example
 * <Breadcrumb items={[
 *   { label: t('common.cms'), path: '/cms' },
 *   { label: t('correspondence.incoming'), path: '/cms' },
 *   { label: `#${id}` }
 * ]} />
 */
const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (items.length <= 1) return null;

  return (
    <nav aria-label={t('accessibility.breadcrumb')} className="flex items-center gap-1.5 text-xs mb-4">
      <ol className="flex items-center gap-1.5 list-none p-0 m-0">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={idx} className="flex items-center gap-1.5">
              {idx > 0 && (
                <ChevronRight size={12} className="text-[var(--color-border-strong)] rtl:rotate-180" />
              )}
              {isLast ? (
                <span className="font-semibold text-[var(--color-text-main)]" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <button
                  onClick={() => item.path && navigate(item.path)}
                  className="font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
