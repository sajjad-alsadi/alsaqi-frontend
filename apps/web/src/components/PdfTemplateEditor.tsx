import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { ViewUpdate } from '@codemirror/view';
import { Save, Eye, AlertTriangle, Loader2, X } from 'lucide-react';
import api from '../api/httpClient';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { toast } from 'react-hot-toast';
import logger from '../utils/logger';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateTypeKey =
  | 'audit_report'
  | 'quarterly_report'
  | 'annual_report'
  | 'audit_plan'
  | 'audit_missions'
  | 'recommendations'
  | 'outgoing_letter'
  | 'general';

interface TemplateTypeDefinition {
  key: TemplateTypeKey;
  i18nLabel: string;
}

/**
 * Mirrors the TEMPLATE_TYPES constant from packages/api/src/constants/templateTypes.ts.
 * This ensures consistency between frontend and backend template type keys.
 */
const TEMPLATE_TYPES: TemplateTypeDefinition[] = [
  { key: 'audit_report', i18nLabel: 'pdfTemplates.auditReport' },
  { key: 'quarterly_report', i18nLabel: 'pdfTemplates.quarterlyReport' },
  { key: 'annual_report', i18nLabel: 'pdfTemplates.annualReport' },
  { key: 'audit_plan', i18nLabel: 'pdfTemplates.auditPlan' },
  { key: 'audit_missions', i18nLabel: 'pdfTemplates.auditMissions' },
  { key: 'recommendations', i18nLabel: 'pdfTemplates.recommendations' },
  { key: 'outgoing_letter', i18nLabel: 'pdfTemplates.outgoingLetter' },
  { key: 'general', i18nLabel: 'pdfTemplates.general' },
];

type TemplateStatus = 'Draft' | 'Approved' | 'Archived';

export interface PdfTemplate {
  id: string;
  template_name: string;
  template_type_key: TemplateTypeKey;
  content: string;
  status: TemplateStatus;
  is_default: boolean;
  version: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateDto {
  template_name: string;
  template_type_key: TemplateTypeKey;
  content: string;
  status: TemplateStatus;
  is_default: boolean;
}

export interface PdfTemplateEditorProps {
  template: PdfTemplate | null; // null for "create new"
  onSave: (data: CreateTemplateDto) => Promise<void>;
  onCancel: () => void;
}

interface EditorStateData {
  content: string;
  previewHtml: string;
  previewLoading: boolean;
  syntaxErrors: Array<{ message: string; line?: number }>;
  sampleData: Record<string, unknown>;
}

// ─── Default sample data ──────────────────────────────────────────────────────

const DEFAULT_SAMPLE_DATA: Record<string, unknown> = {
  auditTitle: 'تدقيق العمليات المالية',
  auditDate: '2024-03-15',
  auditorName: 'أحمد محمد',
  departmentName: 'الشؤون المالية',
  report_number: 'RPT-2024-001',
  report_date: '2024-03-15',
  template_type: 'تقرير التدقيق',
  findings: [
    {
      title: 'ملاحظة 1',
      description: 'وصف الملاحظة الأولى',
      risk_level: 'عالي',
      status: 'مفتوح',
    },
    {
      title: 'ملاحظة 2',
      description: 'وصف الملاحظة الثانية',
      risk_level: 'متوسط',
      status: 'قيد المعالجة',
    },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

const PdfTemplateEditor: React.FC<PdfTemplateEditorProps> = ({
  template,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  // Form state
  const [templateName, setTemplateName] = useState(template?.template_name ?? '');
  const [templateTypeKey, setTemplateTypeKey] = useState<TemplateTypeKey>(
    template?.template_type_key ?? 'audit_report'
  );
  const [status, setStatus] = useState<TemplateStatus>(template?.status ?? 'Draft');
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);
  const [saving, setSaving] = useState(false);

  // Editor state
  const [editorState, setEditorState] = useState<EditorStateData>({
    content: template?.content ?? '',
    previewHtml: '',
    previewLoading: false,
    syntaxErrors: [],
    sampleData: DEFAULT_SAMPLE_DATA,
  });

  const [sampleDataText, setSampleDataText] = useState(
    JSON.stringify(DEFAULT_SAMPLE_DATA, null, 2)
  );
  const [sampleDataError, setSampleDataError] = useState<string | null>(null);

  // ─── Debounced preview request (800ms delay per Req 6.2) ─────────────────

  const requestPreview = useDebouncedCallback(
    async (content: string, data: Record<string, unknown>) => {
      if (!content.trim()) {
        setEditorState((prev) => ({
          ...prev,
          previewHtml: '',
          previewLoading: false,
          syntaxErrors: [],
        }));
        return;
      }

      setEditorState((prev) => ({ ...prev, previewLoading: true }));

      try {
        const response = await api.post('/pdf-templates/preview-html', {
          content,
          sampleData: data,
        });
        setEditorState((prev) => ({
          ...prev,
          previewHtml: response.data.compiledHtml || '',
          syntaxErrors: (response.data.errors || []).map((e: string) => ({
            message: e,
          })),
          previewLoading: false,
        }));
      } catch (err: any) {
        const errors = err.response?.data?.errors;
        setEditorState((prev) => ({
          ...prev,
          previewLoading: false,
          syntaxErrors: Array.isArray(errors)
            ? errors.map((e: string) => ({ message: e }))
            : [{ message: t('pdfTemplates.previewError') }],
        }));
      }
    },
    800
  );

  // ─── CodeMirror setup ────────────────────────────────────────────────────

  useEffect(() => {
    if (!editorContainerRef.current) return;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        setEditorState((prev) => ({ ...prev, content: newContent }));
        requestPreview(newContent, editorState.sampleData);
      }
    });

    const state = EditorState.create({
      doc: template?.content ?? '',
      extensions: [
        basicSetup,
        html(),
        updateListener,
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '13px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
          },
          '.cm-content': {
            direction: 'ltr',
            textAlign: 'left',
          },
          '&.cm-focused': {
            outline: 'none',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sample data change handler ──────────────────────────────────────────

  const handleSampleDataChange = useCallback(
    (text: string) => {
      setSampleDataText(text);
      try {
        const parsed = JSON.parse(text);
        setSampleDataError(null);
        setEditorState((prev) => ({ ...prev, sampleData: parsed }));
        // Trigger preview with updated data
        requestPreview(editorState.content, parsed);
      } catch {
        setSampleDataError(t('pdfTemplates.invalidJson'));
      }
    },
    [editorState.content, requestPreview, t]
  );

  // ─── Save handler ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error(t('pdfTemplates.nameRequired'));
      return;
    }
    if (!editorState.content.trim()) {
      toast.error(t('pdfTemplates.contentRequired'));
      return;
    }

    setSaving(true);
    try {
      await onSave({
        template_name: templateName.trim(),
        template_type_key: templateTypeKey,
        content: editorState.content,
        status,
        is_default: isDefault,
      });
    } catch (err) {
      logger.error('Save failed', err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Preview PDF download (Level 2 preview) ─────────────────────────────

  const handlePreviewPdf = async () => {
    try {
      setEditorState((prev) => ({ ...prev, previewLoading: true }));
      const response = await api.post(
        '/pdf-templates/preview-pdf',
        {
          content: editorState.content,
          sampleData: editorState.sampleData,
        },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(response.data);
      window.open(url);
    } catch (err) {
      toast.error(t('pdfTemplates.previewPdfError'));
      logger.error('PDF preview failed', err);
    } finally {
      setEditorState((prev) => ({ ...prev, previewLoading: false }));
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header / Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Template Name */}
        <div className="lg:col-span-2">
          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">
            {t('pdfTemplates.templateName')}
          </label>
          <input
            type="text"
            className="input-field"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder={t('pdfTemplates.templateNamePlaceholder')}
            maxLength={200}
          />
        </div>

        {/* Template Type Selector */}
        <div>
          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">
            {t('pdfTemplates.reportType')}
          </label>
          <select
            className="input-field"
            value={templateTypeKey}
            onChange={(e) => setTemplateTypeKey(e.target.value as TemplateTypeKey)}
          >
            {TEMPLATE_TYPES.map((type) => (
              <option key={type.key} value={type.key}>
                {t(type.i18nLabel)}
              </option>
            ))}
          </select>
        </div>

        {/* Status Selector */}
        <div>
          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">
            {t('pdfTemplates.templateStatus')}
          </label>
          <select
            className="input-field"
            value={status}
            onChange={(e) => setStatus(e.target.value as TemplateStatus)}
          >
            <option value="Draft">{t('status.draft')}</option>
            <option value="Approved">{t('status.approved')}</option>
            <option value="Archived">{t('status.archived')}</option>
          </select>
        </div>
      </div>

      {/* Is Default Toggle */}
      <div className="flex items-center">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <span className="font-bold text-[var(--color-text-main)]">
            {t('pdfTemplates.setAsDefault')}
          </span>
        </label>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Left: Code Editor */}
        <div className="flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
              {t('pdfTemplates.templateContent')}
            </label>
            <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-1 rounded">
              HTML + Handlebars
            </span>
          </div>
          <div
            ref={editorContainerRef}
            className="flex-1 border-2 border-[var(--color-border-soft)] rounded-xl overflow-hidden bg-[var(--color-card)] min-h-[400px]"
          />

          {/* Syntax Errors */}
          {editorState.syntaxErrors.length > 0 && (
            <div className="mt-2 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl">
              {editorState.syntaxErrors.map((err, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300"
                >
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    {err.line != null && (
                      <span className="font-bold">Line {err.line}: </span>
                    )}
                    {err.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
              {t('pdfTemplates.preview')}
            </label>
            <div className="flex items-center gap-2">
              {editorState.previewLoading && (
                <Loader2 size={14} className="animate-spin text-[var(--color-primary)]" />
              )}
              <button
                type="button"
                onClick={handlePreviewPdf}
                disabled={!editorState.content.trim() || editorState.previewLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye size={14} />
                {t('pdfTemplates.previewPdf')}
              </button>
            </div>
          </div>
          <div className="flex-1 border-2 border-[var(--color-border-soft)] rounded-xl overflow-hidden bg-white min-h-[400px]">
            {editorState.previewHtml ? (
              <iframe
                srcDoc={editorState.previewHtml}
                sandbox="allow-same-origin"
                title={t('pdfTemplates.preview')}
                className="w-full h-full border-0"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--color-text-muted)] text-sm font-medium">
                {t('pdfTemplates.previewPlaceholder')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sample Data Editor */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
            {t('pdfTemplates.sampleData')}
          </label>
          {sampleDataError && (
            <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
              <AlertTriangle size={12} />
              {sampleDataError}
            </span>
          )}
        </div>
        <textarea
          dir="ltr"
          className="w-full h-40 p-4 rounded-xl border-2 border-[var(--color-border-soft)] font-mono text-xs leading-relaxed focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all bg-[var(--color-bg-soft)] text-left resize-none"
          value={sampleDataText}
          onChange={(e) => handleSampleDataChange(e.target.value)}
          placeholder='{"key": "value"}'
        />
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-4 pt-4 border-t border-[var(--color-border-soft)]">
        <button
          type="button"
          onClick={onCancel}
          className="px-8 py-3 text-[var(--color-text-muted)] font-bold uppercase tracking-widest hover:bg-[var(--color-bg-main)] rounded-xl transition-all flex items-center gap-2"
        >
          <X size={16} />
          {t('common.cancel')}
        </button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || !templateName.trim() || !editorState.content.trim()}
          className="flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {saving ? t('common.loading') : t('pdfTemplates.saveTemplate')}
        </Button>
      </div>
    </div>
  );
};

export default PdfTemplateEditor;
