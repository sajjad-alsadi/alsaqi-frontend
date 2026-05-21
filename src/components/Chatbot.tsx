import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, X, Send, Bot, User, Loader2, Search, ExternalLink, FileText, Scale, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useFormat } from '../services/formatService';
import logger from '../utils/logger';

interface SearchResult {
  id: string | number;
  title: string;
  type: 'policy' | 'instruction' | 'law';
  path: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  results?: SearchResult[];
}

const Chatbot: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { formatDateTime } = useFormat();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          text: 'chatbot.welcomeMessage', // Store key, translate at render time
          sender: 'bot',
          timestamp: new Date()
        }
      ]);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Local search in policies, instructions, and law bank
      const [policiesRes, instructionsRes, lawBankRes] = await Promise.all([
        api.get(`/compliance?source_type=internal_policy`),
        api.get(`/compliance?source_type=cbi_instruction`),
        api.get(`/compliance?source_type=law`)
      ]);

      const searchTerm = userMsg.text.toLowerCase();

      // Extract data correctly based on response format (some might be wrapped in { data: [...] })
      const allPolicies = policiesRes.data.data || (Array.isArray(policiesRes.data) ? policiesRes.data : []);
      const allInstructions = instructionsRes.data.data || (Array.isArray(instructionsRes.data) ? instructionsRes.data : []);
      const allLaws = lawBankRes.data.data || (Array.isArray(lawBankRes.data) ? lawBankRes.data : []);

      // Local filtering
      const filteredPolicies = allPolicies.filter((p: any) => 
        p.title?.toLowerCase().includes(searchTerm) || 
        p.department?.toLowerCase().includes(searchTerm)
      );
      
      const filteredInstructions = allInstructions.filter((inst: any) => 
        inst.title?.toLowerCase().includes(searchTerm) || 
        inst.description?.toLowerCase().includes(searchTerm) ||
        inst.instruction_number?.toLowerCase().includes(searchTerm)
      );

      const filteredLaws = allLaws.filter((law: any) => 
        law.title?.toLowerCase().includes(searchTerm) || 
        law.description?.toLowerCase().includes(searchTerm) ||
        law.law_number?.toLowerCase().includes(searchTerm)
      );

      const results: SearchResult[] = [
        ...filteredPolicies.map((p: any) => ({
          id: p.id,
          title: p.title,
          type: 'policy' as const,
          path: '/compliance-matrix'
        })),
        ...filteredInstructions.map((inst: any) => ({
          id: inst.id,
          title: inst.title || inst.instruction_number,
          type: 'instruction' as const,
          path: '/compliance-matrix'
        })),
        ...filteredLaws.map((law: any) => ({
          id: law.id,
          title: law.title || law.law_number,
          type: 'law' as const,
          path: '/compliance-matrix'
        }))
      ];

      let reply = '';
      if (results.length > 0) {
        reply = 'chatbot.foundResults'; // Store key for dynamic translation
      } else {
        reply = 'chatbot.noResults';
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: reply,
        sender: 'bot',
        timestamp: new Date(),
        results: results.slice(0, 5) // Limit to top 5 results
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      logger.error('Search error:', error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: 'chatbot.errorOccurred',
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'policy': return <BookOpen size={14} />;
      case 'instruction': return <FileText size={14} />;
      case 'law': return <Scale size={14} />;
      default: return <Search size={14} />;
    }
  };

  const getResultLabel = (type: string) => {
      switch (type) {
        case 'policy': return t('internalPolicies');
        case 'instruction': return t('centralBankInstructions');
        case 'law': return t('legal.law');
        default: return t('chatbot.result');
      }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 30, scale: 0.95, filter: 'blur(10px)' }}
            className="fixed bottom-24 end-6 w-80 sm:w-[400px] h-[600px] max-h-[85vh] bg-[var(--color-card)] dark:bg-slate-900 rounded-2xl shadow-2xl border border-[var(--color-border-soft)] flex flex-col z-50 overflow-hidden backdrop-blur-xl"
          >
            {/* Header */}
            <div className="p-6 bg-[var(--color-primary)] text-white flex items-center justify-between shadow-lg shadow-[var(--color-primary)]/20">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[var(--color-card)]/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30">
                  <Search size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg tracking-tight">{t('searchAssistant')}</h3>
                  <p className="text-xs text-white/70 font-bold">{t('localPolicySearch')}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="w-10 h-10 flex items-center justify-center hover:bg-[var(--color-card)]/20 rounded-full transition-all active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[var(--color-bg-main)]/30 dark:bg-slate-900/50">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col gap-3 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                      msg.sender === 'user' ? 'bg-[var(--color-card)] text-[var(--color-primary)]' : 'bg-[var(--color-primary)] text-white'
                    }`}>
                      {msg.sender === 'user' ? <User size={18} /> : <Bot size={18} />}
                    </div>
                    <div className={`max-w-[85%] p-4 rounded-xl text-sm font-medium shadow-sm ${
                      msg.sender === 'user' 
                        ? 'bg-[var(--color-primary)] text-white rounded-tr-none' 
                        : 'bg-[var(--color-card)] dark:bg-slate-800 border border-[var(--color-border-soft)] text-[var(--color-text-main)] dark:text-white rounded-tl-none'
                    }`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.sender === 'bot' ? t(msg.text) : msg.text}</p>
                      <span className={`text-[10px] mt-2 block font-bold uppercase tracking-widest ${msg.sender === 'user' ? 'text-white/60' : 'text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]'}`}>
                        {formatDateTime(msg.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Structured Results */}
                  {msg.results && msg.results.length > 0 && (
                    <div className="ms-13 space-y-3 w-full max-w-[85%]">
                      {msg.results.map((result, idx) => (
                        <motion.button
                          key={`${msg.id}-res-${idx}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          onClick={() => {
                            navigate(result.path, { state: { searchTerm: input } });
                            setIsOpen(false);
                          }}
                          className="w-full flex items-center gap-4 p-4 bg-[var(--color-card)] dark:bg-slate-800 border border-[var(--color-border-soft)] rounded-2xl hover:border-[var(--color-primary)]/50 hover:shadow-lg hover:shadow-[var(--color-primary)]/5 transition-all text-start group"
                        >
                          <div className="w-10 h-10 bg-[var(--color-bg-main)] dark:bg-slate-700 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors">
                            {getResultIcon(result.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] uppercase tracking-[0.15em] mb-1">
                              {getResultLabel(result.type)}
                            </p>
                            <p className="text-sm font-bold text-[var(--color-text-main)] dark:text-white truncate">
                              {result.title}
                            </p>
                          </div>
                          <ExternalLink size={16} className="text-[var(--color-border-strong)] group-hover:text-[var(--color-primary)] transition-colors" />
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Bot size={18} />
                  </div>
                  <div className="p-4 bg-[var(--color-card)] dark:bg-slate-800 border border-[var(--color-border-soft)] rounded-xl rounded-tl-none shadow-sm">
                    <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-6 bg-[var(--color-card)] dark:bg-slate-900 border-t border-[var(--color-border-soft)]">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={t('askAboutPolicies')}
                    className="w-full bg-[var(--color-bg-main)] dark:bg-slate-800 border-none rounded-full px-6 py-4 text-sm font-medium text-[var(--color-text-main)] dark:text-white placeholder:text-[var(--color-text-muted)] dark:placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none transition-all"
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="w-12 h-12 bg-[var(--color-primary)] text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--color-primary-hover)] transition-all shadow-md shadow-[var(--color-primary)]/20 active:scale-90 shrink-0"
                >
                  <Send size={20} className={i18n.language === 'ar' ? '-scale-x-100' : ''} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 end-8 w-16 h-16 bg-[var(--color-primary)] text-white rounded-xl shadow-2xl shadow-[var(--color-primary)]/40 flex items-center justify-center z-50 border-2 border-white/20 backdrop-blur-sm transition-all"
      >
        {isOpen ? <X size={28} /> : <Search size={28} />}
      </motion.button>
    </>
  );
};

export default Chatbot;
