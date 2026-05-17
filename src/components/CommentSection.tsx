import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import api from '../services/api';
import { UserRole } from '../constants';
import logger from '../utils/logger';

interface Comment {
  id: string | number;
  user_name: string;
  content: string;
  created_at: string;
  user_id: string | number;
}

interface CommentSectionProps {
  relatedType: string;
  relatedId: string | number;
}

const CommentSection: React.FC<CommentSectionProps> = ({ relatedType, relatedId }) => {
  const { token } = useAuth();
  const { user } = useUser();
  const { t, i18n } = useTranslation();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    fetchComments();
  }, [relatedType, relatedId]);

  const fetchComments = async () => {
    if (!token) return;
    try {
      const res = await api.get(`/comments/${relatedType}/${relatedId}`);
      if (res.data) {
        setComments(res.data);
      }
    } catch (err) {
      logger.error('Failed to fetch comments', err);
    }
  };

  const addComment = async () => {
    if (!token || !newComment.trim()) return;
    try {
      await api.post('/comments', { related_type: relatedType, related_id: relatedId, content: newComment });
      setNewComment('');
      fetchComments();
    } catch (err) {
      logger.error('Failed to add comment', err);
    }
  };

  const deleteComment = async (id: string | number) => {
    if (!token) return;
    try {
      await api.delete(`/comments/${id}`);
      fetchComments();
    } catch (err) {
      logger.error('Failed to delete comment', err);
    }
  };

  return (
    <div className="mt-6 border-t border-[var(--color-border-soft)] pt-6">
      <h4 className="font-bold text-[var(--color-text-main)] mb-4 flex items-center gap-2">
        <MessageSquare size={18} className="text-[var(--color-primary)]" />
        {t('comments')}
      </h4>
      
      <div className="space-y-4 mb-4">
        {(Array.isArray(comments) ? comments : []).map(comment => (
          <div key={comment.id} className="bg-[var(--color-bg-soft)] p-4 rounded-2xl border border-[var(--color-border-soft)]">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-xs text-[var(--color-text-main)]">{comment.user_name}</span>
              <span className="text-[10px] font-bold text-[var(--color-text-muted)]">{new Date(comment.created_at).toLocaleString()}</span>
            </div>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{comment.content}</p>
            {(user?.id === comment.user_id || user?.role === UserRole.ADMIN) && (
              <button 
                onClick={() => deleteComment(comment.id)} 
                className="text-rose-500 hover:text-rose-700 mt-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors"
              >
                <Trash2 size={12} />
                {t('delete')}
              </button>
            )}
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-center py-6 text-xs font-bold text-[var(--color-text-muted)] italic">
            {t('noCommentsYet')}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t('writeComment')}
          className="input-field flex-1 py-3"
          onKeyDown={(e) => e.key === 'Enter' && addComment()}
        />
        <button 
          onClick={addComment} 
          className="btn-primary w-12 h-12 flex items-center justify-center p-0 shrink-0"
          disabled={!newComment.trim()}
        >
          <Send size={20} className={i18n.language === 'ar' ? '-scale-x-100' : ''} />
        </button>
      </div>
    </div>
  );
};

export default CommentSection;
