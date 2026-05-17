import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, User, Mail, FileText, MessageSquare, CheckCircle, AlertCircle } from 'lucide-react';
import { submitContactAdminRequest, ContactAdminRequest } from '../../services/contactAdminService';
import { extractErrorMessage } from '../../services/errorService';
import api from '../../services/api';

interface ContactAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: any;
  dir: 'rtl' | 'ltr';
}

const ContactAdminModal: React.FC<ContactAdminModalProps> = ({ isOpen, onClose, t, dir }) => {
  const [formData, setFormData] = useState<ContactAdminRequest>({
    fullName: '',
    contactInfo: '',
    requestType: '',
    requestDetails: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof ContactAdminRequest, string>>>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      if (status === 'success') {
        setFormData({ fullName: '', contactInfo: '', requestType: '', requestDetails: '' });
      }
      setStatus('idle');
      setErrors({});
      setErrorMessage('');
    }
  }, [isOpen, status]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && status !== 'loading') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, status]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ContactAdminRequest, string>> = {};
    
    if (!formData.fullName.trim()) {
      newErrors.fullName = t('auth.contactAdminModal.validation.fullNameRequired');
    }
    
    if (!formData.contactInfo.trim()) {
      newErrors.contactInfo = t('auth.contactAdminModal.validation.contactInfoRequired');
    }
    
    if (!formData.requestType) {
      newErrors.requestType = t('auth.contactAdminModal.validation.requestTypeRequired');
    }
    
    // Request details are optional for password reset
    if (formData.requestType !== 'passwordReset' && !formData.requestDetails.trim()) {
      newErrors.requestDetails = t('auth.contactAdminModal.validation.requestDetailsRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    setStatus('loading');
    setErrorMessage('');
    
    try {
      if (formData.requestType === 'passwordReset') {
        // Call the actual forgot-password API to preserve functionality
        await api.post('/auth/forgot-password', { username: formData.contactInfo });
        setStatus('success');
      } else {
        const response = await submitContactAdminRequest(formData);
        if (response.success) {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMessage(response.message || t('auth.contactAdminModal.errorMessage'));
        }
      }
    } catch (error: any) {
      setStatus('error');
      setErrorMessage(extractErrorMessage(error, t('auth.contactAdminModal.errorMessage')));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof ContactAdminRequest]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6" dir={dir}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => status !== 'loading' && onClose()}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg bg-[var(--color-card)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-soft)]">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text-main)]">
                  {t('auth.contactAdminModal.title')}
                </h2>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  {t('auth.contactAdminModal.description')}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={status === 'loading'}
                className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)] rounded-full transition-colors disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar">
              {status === 'success' ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-8 text-center"
                >
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-2">
                    {t('auth.contactAdminModal.successMessage')}
                  </h3>
                  <button
                    onClick={onClose}
                    className="mt-6 px-6 py-2.5 bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold rounded-xl hover:bg-[var(--color-bg-main)] transition-colors"
                  >
                    {t('auth.contactAdminModal.close')}
                  </button>
                </motion.div>
              ) : (
                <form id="contact-admin-form" onSubmit={handleSubmit} className="space-y-5">
                  {status === 'error' && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600">
                      <AlertCircle size={20} className="shrink-0 mt-0.5" />
                      <p className="text-sm font-medium">{errorMessage || t('auth.contactAdminModal.errorMessage')}</p>
                    </div>
                  )}

                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[var(--color-text-main)] uppercase tracking-widest">
                      {t('auth.contactAdminModal.fullName')}
                    </label>
                    <div className="relative group">
                      <User className={`absolute ${dir === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-primary)] transition-colors`} size={18} />
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        disabled={status === 'loading'}
                        className={`w-full bg-[var(--color-bg-soft)] border ${errors.fullName ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-[var(--color-border-soft)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20'} rounded-xl py-2.5 ${dir === 'rtl' ? 'pr-10 pl-4' : 'pl-10 pr-4'} text-sm text-[var(--color-text-main)] transition-all outline-none focus:ring-4 disabled:opacity-60`}
                      />
                    </div>
                    {errors.fullName && <p className="text-xs text-red-500 font-medium mt-1">{errors.fullName}</p>}
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[var(--color-text-main)] uppercase tracking-widest">
                      {t('auth.contactAdminModal.contactInfo')}
                    </label>
                    <div className="relative group">
                      <Mail className={`absolute ${dir === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-primary)] transition-colors`} size={18} />
                      <input
                        type="text"
                        name="contactInfo"
                        value={formData.contactInfo}
                        onChange={handleChange}
                        disabled={status === 'loading'}
                        className={`w-full bg-[var(--color-bg-soft)] border ${errors.contactInfo ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-[var(--color-border-soft)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20'} rounded-xl py-2.5 ${dir === 'rtl' ? 'pr-10 pl-4' : 'pl-10 pr-4'} text-sm text-[var(--color-text-main)] transition-all outline-none focus:ring-4 disabled:opacity-60`}
                      />
                    </div>
                    {errors.contactInfo && <p className="text-xs text-red-500 font-medium mt-1">{errors.contactInfo}</p>}
                  </div>

                  {/* Request Type */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[var(--color-text-main)] uppercase tracking-widest">
                      {t('auth.contactAdminModal.requestType')}
                    </label>
                    <div className="relative group">
                      <FileText className={`absolute ${dir === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-primary)] transition-colors`} size={18} />
                      <select
                        name="requestType"
                        value={formData.requestType}
                        onChange={handleChange}
                        disabled={status === 'loading'}
                        className={`w-full bg-[var(--color-bg-soft)] border ${errors.requestType ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-[var(--color-border-soft)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20'} rounded-xl py-2.5 ${dir === 'rtl' ? 'pr-10 pl-4' : 'pl-10 pr-4'} text-sm text-[var(--color-text-main)] transition-all outline-none focus:ring-4 disabled:opacity-60 appearance-none`}
                      >
                        <option value="" disabled>--</option>
                        <option value="newAccount">{t('auth.contactAdminModal.requestTypes.newAccount')}</option>
                        <option value="loginProblem">{t('auth.contactAdminModal.requestTypes.loginProblem')}</option>
                        <option value="passwordReset">{t('auth.contactAdminModal.requestTypes.passwordReset')}</option>
                        <option value="permissionIssue">{t('auth.contactAdminModal.requestTypes.permissionIssue')}</option>
                        <option value="generalSupport">{t('auth.contactAdminModal.requestTypes.generalSupport')}</option>
                      </select>
                    </div>
                    {errors.requestType && <p className="text-xs text-red-500 font-medium mt-1">{errors.requestType}</p>}
                  </div>

                  {/* Request Details */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[var(--color-text-main)] uppercase tracking-widest">
                      {t('auth.contactAdminModal.requestDetails')}
                    </label>
                    <div className="relative group">
                      <MessageSquare className={`absolute ${dir === 'rtl' ? 'right-3' : 'left-3'} top-3 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-primary)] transition-colors`} size={18} />
                      <textarea
                        name="requestDetails"
                        value={formData.requestDetails}
                        onChange={handleChange}
                        disabled={status === 'loading'}
                        rows={4}
                        className={`w-full bg-[var(--color-bg-soft)] border ${errors.requestDetails ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-[var(--color-border-soft)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20'} rounded-xl py-2.5 ${dir === 'rtl' ? 'pr-10 pl-4' : 'pl-10 pr-4'} text-sm text-[var(--color-text-main)] transition-all outline-none focus:ring-4 disabled:opacity-60 resize-none`}
                      />
                    </div>
                    {errors.requestDetails && <p className="text-xs text-red-500 font-medium mt-1">{errors.requestDetails}</p>}
                  </div>
                </form>
              )}
            </div>

            {/* Footer */}
            {status !== 'success' && (
              <div className="p-6 border-t border-[var(--color-border-soft)] bg-[var(--color-bg-soft)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={status === 'loading'}
                  className="px-5 py-2.5 text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-main)] rounded-xl transition-colors disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  form="contact-admin-form"
                  disabled={status === 'loading'}
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-white text-sm font-bold rounded-xl hover:bg-[var(--color-primary)]/90 transition-all disabled:opacity-70 flex items-center gap-2 shadow-lg shadow-[var(--color-primary)]/20"
                >
                  {status === 'loading' ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send size={16} className={dir === 'rtl' ? 'rotate-180' : ''} />
                      {t('auth.contactAdminModal.send')}
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ContactAdminModal;
