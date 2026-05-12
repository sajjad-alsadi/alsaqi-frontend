import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { BookOpen, Shield, Users, Target, FileText, CheckCircle, Scale, AlertTriangle, Briefcase, Building } from 'lucide-react';

const AuditCharter: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const charterData = {
    title: t('common.auditCharter'),
    company: t('common.brandName'),
    version: "V2.0",
    date: "28-01-2026",
    sections: [
      {
        id: "intro",
        title: t('charter.intro_title'),
        icon: BookOpen,
        content: t('charter.intro_content', { returnObjects: true }) as string[],
      },
      {
        id: "definitions",
        title: t('charter.definitions_title'),
        icon: FileText,
        items: t('charter.definitions_items', { returnObjects: true }) as { term: string; def: string }[]
      },
      {
        id: "organization",
        title: t('charter.organization_title'),
        icon: Building,
        content: t('charter.organization_content', { returnObjects: true }) as string[]
      },
      {
        id: "purpose",
        title: t('charter.purpose_title'),
        icon: Target,
        content: t('charter.purpose_content', { returnObjects: true }) as string[]
      },
      {
        id: "reports",
        title: t('charter.reports_title'),
        icon: FileText,
        content: t('charter.reports_content', { returnObjects: true }) as string[],
        table: t('charter.reports_table', { returnObjects: true }) as { name: string; freq: string; recipient: string; notes: string }[]
      },
      {
        id: "org_chart",
        title: t('charter.org_chart_title'),
        icon: Users,
        content: t('charter.org_chart_content', { returnObjects: true }) as string[]
      },
      {
        id: "independence",
        title: t('charter.independence_title'),
        icon: Scale,
        content: t('charter.independence_content', { returnObjects: true }) as string[]
      },
      {
        id: "scope",
        title: t('charter.scope_title'),
        icon: Shield,
        content: t('charter.scope_content', { returnObjects: true }) as string[]
      },
      {
        id: "authorities",
        title: t('charter.authorities_title'),
        icon: Briefcase,
        content: t('charter.authorities_content', { returnObjects: true }) as string[]
      },
      {
        id: "responsibilities",
        title: t('charter.responsibilities_title'),
        icon: Users,
        content: t('charter.responsibilities_content', { returnObjects: true }) as string[]
      },
      {
        id: "manager_responsibilities",
        title: t('charter.manager_responsibilities_title'),
        icon: Target,
        content: t('charter.manager_responsibilities_content', { returnObjects: true }) as string[]
      },
      {
        id: "external_relations",
        title: t('charter.external_relations_title'),
        icon: Building,
        content: t('charter.external_relations_content', { returnObjects: true }) as string[]
      },
      {
        id: "references",
        title: t('charter.references_title'),
        icon: BookOpen,
        content: t('charter.references_content', { returnObjects: true }) as string[]
      },
      {
        id: "approval",
        title: t('charter.approval_title'),
        icon: CheckCircle,
        content: t('charter.approval_content', { returnObjects: true }) as string[]
      }
    ]
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <BookOpen size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('common.auditCharter')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{charterData.company}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-[var(--color-bg-main)] px-4 py-2 rounded-xl text-sm font-bold text-[var(--color-text-muted)]">
            {t('common.version')}: {charterData.version}
          </div>
          <div className="bg-[var(--color-bg-main)] px-4 py-2 rounded-xl text-sm font-bold text-[var(--color-text-muted)]">
            {t('common.date')}: {charterData.date}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {charterData.sections.map((section, idx) => {
          const Icon = section.icon;
          return (
            <motion.div 
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass-card p-8"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                  <Icon size={24} />
                </div>
                <h3 className="text-2xl font-bold text-[var(--color-text-main)]">{section.title}</h3>
              </div>
              
              <div className="space-y-4 text-[var(--color-text-muted)] leading-relaxed">
                {section.id === 'org_chart' && (
                  <div className="py-8 overflow-x-auto">
                    <div className="min-w-[800px] flex flex-col items-center">
                      <div className="relative flex flex-col items-center w-full">
                        <div className="bg-[var(--color-primary)] text-white font-bold py-4 px-8 rounded-xl shadow-lg relative z-10 w-64 text-center">
                          {t('auditCharter.deptManager')}
                        </div>
                        <div className="w-0.5 h-8 bg-slate-300"></div>
                        <div className="bg-slate-700 text-white font-bold py-3 px-6 rounded-lg relative z-10 w-56 text-center">
                          {t('auditCharter.deputyManager')}
                        </div>
                        <div className="w-0.5 h-8 bg-slate-300"></div>
                        <div className="w-[75%] h-0.5 bg-slate-300"></div>
                        
                        <div className="flex w-full justify-around mt-0">
                          <div className="flex flex-col items-center flex-1 px-2">
                            <div className="w-0.5 h-8 bg-slate-300"></div>
                            <div className="bg-sky-500 w-full text-white font-bold py-3 px-2 rounded-lg shadow-md text-center text-sm h-full flex items-center justify-center leading-snug">
                              {t('auditCharter.financialAuditDept')}
                            </div>
                          </div>
                          <div className="flex flex-col items-center flex-1 px-2">
                            <div className="w-0.5 h-8 bg-slate-300"></div>
                            <div className="bg-emerald-500 w-full text-white font-bold py-3 px-2 rounded-lg shadow-md text-center text-sm h-full flex items-center justify-center leading-snug">
                              {t('auditCharter.auditDivision')}
                            </div>
                          </div>
                          <div className="flex flex-col items-center flex-1 px-2">
                            <div className="w-0.5 h-8 bg-slate-300"></div>
                            <div className="bg-amber-500 w-full text-white font-bold py-3 px-2 rounded-lg shadow-md text-center text-sm h-full flex items-center justify-center leading-snug">
                              {t('auditCharter.auditReconciliationDiv')}
                            </div>
                          </div>
                          <div className="flex flex-col items-center flex-1 px-2">
                            <div className="w-0.5 h-8 bg-slate-300"></div>
                            <div className="bg-rose-500 w-full text-white font-bold py-3 px-2 rounded-lg shadow-md text-center text-sm h-full flex items-center justify-center leading-snug">
                              {t('auditCharter.itAuditDiv')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {section.content && Array.isArray(section.content) && section.content.map((p, i) => (
                  <p key={i} className={p && p.match && p.match(/^\d+\./) ? (isRTL ? "pe-4" : "ps-4") : ""}>
                    {p}
                  </p>
                ))}
                
                {section.items && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    {section.items.map((item, i) => (
                      <div key={i} className="bg-[var(--color-bg-soft)] p-4 rounded-xl border border-[var(--color-border-soft)]">
                        <h4 className="font-bold text-[var(--color-text-main)] mb-2">{item.term}</h4>
                        <p className="text-sm text-[var(--color-text-muted)]">{item.def}</p>
                      </div>
                    ))}
                  </div>
                )}

                {section.table && (
                  <div className="overflow-x-auto mt-6">
                    <table className="w-full text-start border-collapse">
                      <thead>
                        <tr className="bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)]">
                          <th className="px-6 py-4 text-xs font-bold text-[var(--color-text-muted)] uppercase">{t('common.reportName')}</th>
                          <th className="px-6 py-4 text-xs font-bold text-[var(--color-text-muted)] uppercase">{t('common.frequency')}</th>
                          <th className="px-6 py-4 text-xs font-bold text-[var(--color-text-muted)] uppercase">{t('common.recipients')}</th>
                          <th className="px-6 py-4 text-xs font-bold text-[var(--color-text-muted)] uppercase">{t('common.notes')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border-soft)]/50">
                        {section.table.map((row, i) => (
                          <tr key={i} className="hover:bg-[var(--color-bg-soft)]/50">
                            <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)]">{row.name}</td>
                            <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{row.freq}</td>
                            <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{row.recipient}</td>
                            <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{row.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default AuditCharter;
