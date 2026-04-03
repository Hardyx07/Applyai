'use client';

import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { apiStream, APIError } from '@/app/lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function GeneratePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) {
      addToast('Please enter a question', 'error');
      return;
    }

    const userMessage = query;
    setQuery('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const stream = await apiStream('/generate/stream', {
        query: userMessage,
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        
        // Update the last message (assistant) with the accumulated response
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: fullResponse },
        ]);
      }

      // Final flush
      const finalChunk = decoder.decode();
      if (finalChunk) {
        fullResponse += finalChunk;
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: fullResponse },
        ]);
      }
    } catch (error) {
      if (error instanceof APIError) {
        if (error.statusCode === 422) {
          addToast('Please complete your profile and upload a resume first', 'error');
        } else {
          addToast(error.message, 'error');
        }
      } else {
        addToast('Failed to generate response', 'error');
      }
      // Remove the empty assistant message if there was an error
      setMessages((prev) => prev.filter((m) => m.content.length > 0));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat">
      {/* Header */}
      <div className="chat__header">
        <h1 className="chat__header-title">Career Advisor</h1>
        <p className="chat__header-subtitle">Ask questions about your career path and get AI-powered guidance</p>
      </div>

      {/* Messages */}
      <div className="chat__messages">
        {messages.length === 0 ? (
          <div className="chat__empty">
            <div>
              <p style={{ fontSize: '2rem', marginBottom: 'var(--space-4)' }}>💡</p>
              <p style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text)' }}>
                 Ask me anything about your career!
              </p>
              <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)' }}>Examples:</p>
              <ul style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>• What roles should I target next?</li>
                <li>• How can I improve my resume?</li>
                <li>• What skills should I develop?</li>
                <li>• What salary range is appropriate?</li>
              </ul>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                   display: 'flex',
                   justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                   width: '100%'
                }}
              >
                <div
                  className={`chat__bubble ${
                    msg.role === 'user' ? 'chat__bubble--user' : 'chat__bubble--ai'
                  }`}
                >
                  <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
                <div className="chat__bubble chat__bubble--ai">
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '24px' }}>
                     <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'var(--color-text)' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="chat__input-area">
        <form onSubmit={handleSubmit} className="chat__input-wrapper">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
            placeholder="Ask me a question..."
            className="chat__input"
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="btn btn--primary"
            style={{ borderRadius: 'var(--radius-xl)' }}
          >
            Send
          </button>
        </form>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
