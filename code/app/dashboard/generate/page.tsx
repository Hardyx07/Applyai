'use client';

import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { apiStream, APIError } from '@/app/lib/api';
import { getByokKeys } from '@/app/lib/byok';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type StreamEvent = {
  event: string | null;
  data: string;
};

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

    const storedKeys = getByokKeys();
    if (!storedKeys.gemini_api_key || !storedKeys.cohere_api_key) {
      addToast('Please add your API keys in the API Keys page before using chat.', 'error');
      return;
    }

    const userMessage = query;
    setQuery('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '' },
    ]);
    setIsLoading(true);

    try {
      const queryString = new URLSearchParams({ prompt: userMessage }).toString();
      const stream = await apiStream(
        `/generate/stream?${queryString}`,
        undefined,
        {
          byokHeaders: {
            'X-Gemini-API-Key': storedKeys.gemini_api_key,
            'X-Cohere-API-Key': storedKeys.cohere_api_key,
          },
        }
      );

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseEvents(buffer);
        buffer = rest;

        for (const event of events) {
          if (event.event !== 'token') {
            continue;
          }

          try {
            const token = JSON.parse(event.data) as string;
            fullResponse += token;
          } catch {
            fullResponse += event.data;
          }

          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: fullResponse },
          ]);
        }
      }

      // Final flush
      buffer += decoder.decode();
      const { events } = parseSseEvents(buffer, true);
      for (const event of events) {
        if (event.event !== 'token') {
          continue;
        }

        try {
          const token = JSON.parse(event.data) as string;
          fullResponse += token;
        } catch {
          fullResponse += event.data;
        }

        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: fullResponse },
        ]);
      }
    } catch (error) {
      if (error instanceof APIError) {
        if (error.statusCode === 422) {
          addToast('Missing or invalid API keys. Please update keys and try again.', 'error');
        } else if (error.statusCode === 404) {
          addToast('No indexed profile data found. Please ingest your resume text first.', 'error');
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
        <h1>ApplyAI Chatbot</h1>
        <p>Ask a question and get a grounded answer from your profile data.</p>
      </div>

      {/* Messages */}
      <div className="chat__messages">
        {messages.length === 0 ? (
          <div className="chat__empty">
            <div>
              <div className="chat__empty-icon">💡</div>
              <h3>Ask a question about your application</h3>
              <div className="chat__suggestions">
                <button className="chat__suggestion" onClick={() => setQuery('Write a short summary for this role.')}>Write a short summary for this role.</button>
                <button className="chat__suggestion" onClick={() => setQuery('Help me answer this field professionally.')}>Help me answer this field professionally.</button>
                <button className="chat__suggestion" onClick={() => setQuery('Summarize my experience in two sentences.')}>Summarize my experience in two sentences.</button>
                <button className="chat__suggestion" onClick={() => setQuery('Draft a concise answer from my profile.')}>Draft a concise answer from my profile.</button>
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
            Ask
          </button>
        </form>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

function parseSseEvents(buffer: string, finalize = false): { events: StreamEvent[]; rest: string } {
  const lines = buffer.split(/\r?\n/);
  const events: StreamEvent[] = [];
  let currentEvent: string | null = null;
  let currentData: string[] = [];

  const limit = finalize ? lines.length : Math.max(lines.length - 1, 0);
  for (let index = 0; index < limit; index += 1) {
    const line = lines[index];

    if (!line) {
      if (currentData.length > 0) {
        events.push({ event: currentEvent, data: currentData.join('\n') });
        currentEvent = null;
        currentData = [];
      }
      continue;
    }

    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      currentData.push(line.slice('data:'.length).trimStart());
    }
  }

  if (finalize && currentData.length > 0) {
    events.push({ event: currentEvent, data: currentData.join('\n') });
  }

  const rest = finalize ? '' : lines[lines.length - 1] ?? '';
  return { events, rest };
}
