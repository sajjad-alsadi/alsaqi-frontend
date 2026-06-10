import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { RiskItem } from '../types';
import { Plus, Search, ShieldAlert, Activity, ArrowRight, Info, Upload, Edit, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import ExcelJS from 'exceljs';
import { useRisks } from '../hooks/useRisks';
import { api } from '../api';
import InteractiveIcon from '../components/InteractiveIcon';
import { useFormat } from '../utils/formatService';
import toast from 'react-hot-toast';
import logger from '../utils/logger';

import Modal from '../components/Modal';
import RiskForm from '../components/RiskForm';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import { useFileUploadValidation } from '../hooks/useFileUploadValidation';

const RiskRegister: React.FC = () => {
  const { token } = useAuth();
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { formatDate, formatNumber } = useFormat();
  
  const { risks, loading, fetchRisks } = useRisks();
  const { validateAndFilter } = useFileUploadValidation({
    allowedExtensions: ['.xlsx', '.xls'],
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
  });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState<RiskItem | null>(null);
  const [editingRisk, setEditingRisk] = useState<RiskItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isRTL = language === 'ar';

  const handleAddSuccess = () => {
    toast.success(t(editingRisk ? 'updateSuccess' : 'createSuccess'));
    setIsModalOpen(false);
    setEditingRisk(null);
    fetchRisks();
  };

  const handleDelete = async (id: string | number) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete === null) return;
    try {
      await api.riskRegister.delete(String(itemToDelete));
      toast.success(t('deleteSuccess'));
      fetchRisks();
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (err) {
      logger.error('Operation failed', err);
      toast.error(t('errorOccurred'));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validFiles = await validateAndFilter([file]);
    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) return;

        // Extract headers from the first row
        const headers: string[] = [];
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          headers[colNumber] = String(cell.value ?? '');
        });

        // Convert rows to JSON objects using headers
        const data: Record<string, string>[] = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header row
          const rowObj: Record<string, string> = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber];
            if (header) {
              rowObj[header] = String(cell.value ?? '');
            }
          });
          data.push(rowObj);
        });

        // Helper to find value by multiple possible keys (translations)
        const getValue = (row: Record<string, string>, key: string) => {
          const enHeader = t(`excelHeaders.${key}`, { lng: 'en' });
          const arHeader = t(`excelHeaders.${key}`, { lng: 'ar' });
          
          // Also check for the specific format previously used: "Arabic (English)"
          const combinedHeader = `${arHeader} (${enHeader})`;
          
          return row[combinedHeader] || row[enHeader] || row[arHeader] || '';
        };

        // Map Excel columns to our schema
        const mappedData = data.map((row) => ({
          risk_id: getValue(row, 'riskId'),
          description: getValue(row, 'description'),
          owner: getValue(row, 'owner'),
          source: getValue(row, 'source'),
          early_warning: getValue(row, 'earlyWarning'),
          type: getValue(row, 'type'),
          likelihood: getValue(row, 'likelihood'),
          impact: getValue(row, 'impact'),
          score: parseInt(getValue(row, 'score') || '0', 10),
          rating: getValue(row, 'level'),
          controls: getValue(row, 'controls'),
          control_assessment: getValue(row, 'controlAssessment'),
          mitigation: getValue(row, 'mitigation'),
          treatment_option: getValue(row, 'treatmentOption'),
          residual_likelihood: getValue(row, 'residualLikelihood'),
          residual_impact: getValue(row, 'residualImpact'),
          residual_score: parseInt(getValue(row, 'residualScore') || '0', 10),
          residual_rating: getValue(row, 'residualLevel'),
          status: getValue(row, 'status') || 'Open',
          target_date: getValue(row, 'targetDate'),
          review_date: getValue(row, 'reviewDate'),
          notes: getValue(row, 'notes'),
          entry_date: getValue(row, 'entryDate') || new Date().toISOString().split('T')[0],
          entered_by: getValue(row, 'enteredBy')
        }));

        // Send to backend one by one
        for (const item of mappedData) {
          await api.riskRegister.create(item as any);
        }
        
        fetchRisks();
      } catch (error) {
        logger.error('Error parsing Excel:', error);
      }
    };
    reader.readAsArrayBuffer(validFiles[0]!);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <ShieldAlert size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('risks')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('globalInternalAuditStandardsAlignment')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fileInputRef.current?.click()}
            className="border border-[var(--color-border-soft)] bg-[var(--color-card)] hover:bg-[var(--color-bg-soft)] text-[var(--color-text-main)] inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-6 py-2.5 cursor-pointer gap-3"
          >
            <Upload size={20} />
            <span>{t('importExcel')}</span>
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { setEditingRisk(null); setIsModalOpen(true); }}
            className="bg-primary text-white hover:bg-primary-hover inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-6 py-2.5 cursor-pointer gap-3 shadow-[0_4px_14px_rgba(10,125,133,0.25)]"
          >
            <Plus size={24} />
            <span>{t('common.add')}</span>
          </motion.button>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingRisk(null); }} 
        title={editingRisk ? t('editRisk') : t('addRisk')}
      >
        <RiskForm 
          onSuccess={handleAddSuccess} 
          onCancel={() => { setIsModalOpen(false); setEditingRisk(null); }} 
          initialData={editingRisk}
        />
      </Modal>

      {loading ? (
        <div className="glass-card p-20">
          <LoadingSpinner size="lg" />
          <p className="text-center text-[var(--color-text-muted)] font-bold mt-4 uppercase tracking-widest text-xs">{t('loadingRiskRegister')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {(Array.isArray(risks) ? risks : []).map((risk, idx) => (
            <motion.div 
              key={risk.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              whileHover={{ y: -10 }}
              className="glass-card p-10 flex flex-col group transition-all duration-500 hover:shadow-2xl hover:shadow-[var(--color-primary)]/10"
            >
              <div className="flex items-start justify-between mb-8">
                <Badge type="risk" value={risk.rating} />
                <div className="flex items-center gap-2">
                <InteractiveIcon 
                  icon={Edit}
                  onClick={() => { setEditingRisk(risk); setIsModalOpen(true); }}
                  tooltip={t('common.edit')}
                  variant="ghost"
                  size={16}
                  className="!p-2"
                />
                <InteractiveIcon 
                  icon={Trash2}
                  onClick={() => risk.id && handleDelete(risk.id)}
                  tooltip={t('common.delete')}
                  variant="danger"
                  size={16}
                  className="!p-2"
                />
              </div>
            </div>
            
            <h4 className="text-xl font-bold text-[var(--color-text-main)] mb-3 leading-tight group-hover:text-[var(--color-primary)] transition-colors">{risk.description}</h4>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-8 uppercase tracking-wider">{risk.owner} • {t(risk.type?.toLowerCase() || '')}</p>

            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="text-center p-4 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                <p className="text-[9px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-2">{t('likelihood')}</p>
                <p className="text-sm font-bold text-[var(--color-text-main)] truncate">{risk.likelihood}</p>
              </div>
              <div className="text-center p-4 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                <p className="text-[9px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-2">{t('impact')}</p>
                <p className="text-sm font-bold text-[var(--color-text-main)] truncate">{risk.impact}</p>
              </div>
              <div className="text-center p-4 bg-[var(--color-primary)] text-white rounded-xl shadow-2xl shadow-[var(--color-primary)]/30">
                <p className="text-[9px] text-white/70 uppercase font-bold tracking-widest mb-2">{t('score')}</p>
                <p className="text-lg font-bold">{formatNumber(risk.score)}</p>
              </div>
            </div>

            <div className="space-y-4 flex-1">
              <div className="flex items-start gap-3 p-4 bg-[var(--color-bg-soft)]/50 rounded-xl border border-[var(--color-border-soft)]">
                <Activity size={16} className="text-[var(--color-primary)] mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-1">{t('controls')}</p>
                  <p className="text-xs font-bold text-[var(--color-text-main)] opacity-80 truncate">{risk.controls}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-[var(--color-bg-soft)]/50 rounded-xl border border-[var(--color-border-soft)]">
                <ArrowRight size={16} className="text-[var(--color-primary)] mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-1">{t('mitigation')}</p>
                  <p className="text-xs font-bold text-[var(--color-text-main)] opacity-80 truncate">{risk.mitigation}</p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setSelectedRisk(risk)}
              className="w-full mt-10 py-4 bg-[var(--color-bg-soft)] text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white rounded-xl transition-all duration-300 flex items-center justify-center gap-3 uppercase tracking-widest"
            >
              <Info size={18} />
              {t('details')}
            </button>
          </motion.div>
        ))}
      </div>
      )}

      <Modal
        isOpen={!!selectedRisk}
        onClose={() => setSelectedRisk(null)}
        title={t('riskDetails')}
      >
        {selectedRisk && (
          <div className="space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar pe-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-bold text-[var(--color-text-main)] mb-2">{selectedRisk.description}</h3>
                <p className="text-sm text-[var(--color-text-muted)] font-bold uppercase tracking-widest">{selectedRisk.owner} • {t(selectedRisk.type?.toLowerCase() || '')}</p>
              </div>
              <Badge type="risk" value={selectedRisk.rating} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-1">{t('riskId')}</p>
                <p className="text-sm font-bold text-[var(--color-text-main)]">{selectedRisk.risk_id}</p>
              </div>
              <div className="p-4 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-1">{t('status')}</p>
                <p className="text-sm font-bold text-[var(--color-text-main)]">{t(`common.status.${selectedRisk.status?.toLowerCase()}`) || selectedRisk.status}</p>
              </div>
              <div className="p-4 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-1">{t('targetDate')}</p>
                <p className="text-sm font-bold text-[var(--color-text-main)]">{formatDate(selectedRisk.target_date)}</p>
              </div>
              <div className="p-4 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-1">{t('reviewDate')}</p>
                <p className="text-sm font-bold text-[var(--color-text-main)]">{formatDate(selectedRisk.review_date)}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="p-6 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)] text-center">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-2">{t('likelihood')}</p>
                <p className="text-lg font-bold text-[var(--color-text-main)]">{selectedRisk.likelihood}</p>
              </div>
              <div className="p-6 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)] text-center">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-2">{t('impact')}</p>
                <p className="text-lg font-bold text-[var(--color-text-main)]">{selectedRisk.impact}</p>
              </div>
              <div className="p-6 bg-[var(--color-primary)] text-white rounded-xl shadow-xl shadow-[var(--color-primary)]/20 text-center">
                <p className="text-[10px] text-white/70 uppercase font-bold tracking-widest mb-2">{t('score')}</p>
                <p className="text-2xl font-bold">{formatNumber(selectedRisk.score)}</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                <div className="flex items-center gap-3 mb-4">
                  <Activity size={20} className="text-[var(--color-primary)]" />
                  <h4 className="text-sm font-bold text-[var(--color-text-main)] uppercase tracking-widest opacity-80">{t('existingControls')}</h4>
                </div>
                <p className="text-[var(--color-text-main)] opacity-70 font-medium leading-relaxed">{selectedRisk.controls}</p>
                <div className="mt-4 pt-4 border-t border-[var(--color-border-soft)]">
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-1">{t('controlAssessment')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{selectedRisk.control_assessment}</p>
                </div>
              </div>

              <div className="p-6 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                <div className="flex items-center gap-3 mb-4">
                  <ArrowRight size={20} className="text-[var(--color-primary)]" />
                  <h4 className="text-sm font-bold text-[var(--color-text-main)] uppercase tracking-widest opacity-80">{t('mitigationPlan')}</h4>
                </div>
                <p className="text-[var(--color-text-main)] opacity-70 font-medium leading-relaxed">{selectedRisk.mitigation}</p>
                <div className="mt-4 pt-4 border-t border-[var(--color-border-soft)]">
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-1">{t('treatmentOption')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{selectedRisk.treatment_option}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="p-6 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)] text-center">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-2">{t('residualLikelihood')}</p>
                <p className="text-lg font-bold text-[var(--color-text-main)]">{selectedRisk.residual_likelihood}</p>
              </div>
              <div className="p-6 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)] text-center">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-widest mb-2">{t('residualImpact')}</p>
                <p className="text-lg font-bold text-[var(--color-text-main)]">{selectedRisk.residual_impact}</p>
              </div>
              <div className="p-6 bg-slate-800 text-white rounded-xl shadow-xl text-center">
                <p className="text-[10px] text-white/70 uppercase font-bold tracking-widest mb-2">{t('residualScore')}</p>
                <p className="text-2xl font-bold">{formatNumber(selectedRisk.residual_score)}</p>
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-[var(--color-border-soft)] sticky bottom-0 bg-[var(--color-card)]/80 backdrop-blur-md p-4 rounded-xl">
              <button 
                onClick={() => setSelectedRisk(null)}
                className="px-8 py-4 bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] font-bold rounded-xl hover:bg-[var(--color-bg-soft)]/80 transition-colors uppercase tracking-widest text-xs"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        title={t('deleteConfirm')}
      >
        <div className="space-y-6">
          <p className="text-[var(--color-text-main)] font-medium">
            {t('deleteMessage')}
          </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setItemToDelete(null);
                  }}
                  className="px-6 py-3 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold hover:bg-[var(--color-border-soft)] transition-colors border border-[var(--color-border-soft)]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-6 py-3 rounded-2xl bg-[var(--color-danger)] text-white font-bold hover:bg-[var(--color-danger)]/90 transition-colors shadow-lg shadow-[var(--color-danger)]/20"
                >
                  {t('common.delete')}
                </button>
              </div>
        </div>
      </Modal>

    </div>
  );
};

export default RiskRegister;
