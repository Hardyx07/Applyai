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
        <h1>Career Advisor</h1>
        <p>Ask questions about your career path and get AI-powered guidance</p>
      </div>

      {/* Messages */}
      <div className="chat__messages">
        {messages.length === 0 ? (
          <div className="chat__empty">
            <div>
              <div className="chat__empty-icon">💡</div>
              <h3>Ask me anything about your career!</h3>
              <div className="chat__suggestions">
                <button className="chat__suggestion" onClick={() => setQuery("What roles should I target next?")}>What roles should I target next?</button>
                <button className="chat__suggestion" onClick={() => setQuery("How can I improve my resume?")}>How can I improve my resume?</button>
                <button className="chat__suggestion" onClick={() => setQuery("What skills should I develop?")}>What skills should I develop?</button>
                <button className="chat__suggestion" onClick={() => setQuery("What salary range is appropriate?")}>What salary range is appropriate?</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chat__bubble ${msg.role === 'user' ? 'chat__bubble--user' : 'chat__bubble--assistant'}`}
              >
                {msg.content}
              </div>
            ))}
            {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div className="chat__typing">
                <div className="chat__typing-dot"></div>
                <div className="chat__typing-dot"></div>
                <div className="chat__typing-dot"></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="chat__input">
        <form onSubmit={handleSubmit} className="chat__input-form">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
            placeholder="Ask me a question..."
            className="form-input"
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="btn btn--primary"
          >
            Send
          </button>
        </form>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
