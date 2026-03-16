import React, { useState, useRef, useEffect } from 'react';
import { useMutation, gql } from '@apollo/client';
import TopNav from '../components/TopNav';
import logoCompressed from '../../assets/screenshots/workspace/Logo_compressed.svg';

const CHAT_MUTATION = gql`
  mutation Chat($message: String!, $conversation_history: [ChatMessageInput]) {
    chat(message: $message, conversation_history: $conversation_history) {
      message
      context_used {
        id
        number
        branch
        type
        status
        date
      }
    }
  }
`;

function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center py-1">
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

function UserBubble({ message }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="bg-brand-purple/20 text-brand-dark-blue text-sm rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[82%] leading-relaxed">
        {message.content}
      </div>
      <span className="text-[11px] text-gray-400 mr-0.5">{formatTime(message.time)}</span>
    </div>
  );
}

function AssistantBubble({ message }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="text-sm text-gray-700 max-w-[92%] leading-relaxed">
        {message.content}
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-dark-blue text-white ml-1.5 align-middle cursor-default flex-shrink-0"
          style={{ fontSize: '9px' }}
          title="AI generated response"
        >
          i
        </span>
      </div>
      <span className="text-[11px] text-gray-400">{formatTime(message.time)}</span>
    </div>
  );
}

function SourceCard({ source, index }) {
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/60">
        <span className="bg-brand-dark-blue text-white text-xs font-semibold px-2.5 py-0.5 rounded-full font-funnel tracking-wide">
          SOURCE {index + 1}
        </span>
        <span className="text-sm font-medium text-gray-700 truncate">
          Session #{source.number || source.id}
          {source.branch ? ` — ${source.branch}` : ''}
          {source.type ? ` / ${source.type}` : ''}
        </span>
      </div>
      <div className="px-5 py-4">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
          Document Extract: {source.type || 'N/A'}
        </p>
        <p className="text-sm text-gray-600 leading-relaxed">
          {source.status || 'No extract available.'}
        </p>
        {source.date && (
          <p className="text-xs text-gray-400 mt-3">
            Published:{' '}
            {new Date(source.date).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
            {source.branch && <span className="ml-2">· {source.branch}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [rightPanel, setRightPanel] = useState(null);
  const bottomRef = useRef(null);

  const [sendChat] = useMutation(CHAT_MUTATION);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isTyping) return;

    const userMessage = { role: 'user', content: text, time: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const { data } = await sendChat({
        variables: { message: text, conversation_history: history },
      });

      const aiMessage = {
        role: 'assistant',
        content: data.chat.message,
        sources: data.chat.context_used,
        time: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setRightPanel({ analysis: data.chat.message, sources: data.chat.context_used });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, sources: [], time: new Date() },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div className="h-screen bg-brand-light-blue flex flex-col overflow-hidden">
      <TopNav />

      <div className="flex flex-1 gap-3 px-4 pb-4 min-h-0">

        {/* ── Left: Chat panel ── */}
        <div className="w-[38%] bg-white rounded-2xl flex flex-col shadow-sm overflow-hidden">

          {/* Chat header */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
            <img src={logoCompressed} alt="Politor" className="h-8 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-funnel font-bold text-sm text-brand-dark-blue leading-tight">Agent: Politory</p>
              <p className="text-[11px] text-gray-400 leading-tight">by Politor Analytics &amp; Riserve</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 min-h-0">
            {messages.length === 0 && !isTyping && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-gray-400 text-center">
                  Ask Politor anything about parliament sessions
                </p>
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === 'user'
                ? <UserBubble key={i} message={msg} />
                : <AssistantBubble key={i} message={msg} />
            )}

            {isTyping && <TypingDots />}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="px-5 py-4 flex-shrink-0">
            <form
              onSubmit={handleSend}
              className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-4 py-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about legislation, sources, or trends..."
                disabled={isTyping}
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none min-w-0"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-purple to-brand-energic-blue flex items-center justify-center disabled:opacity-40 transition-opacity flex-shrink-0"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>
        </div>

        {/* ── Right: Knowledge Base & Sources ── */}
        <div className="flex-1 bg-white rounded-2xl flex flex-col shadow-sm overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-2.5 px-6 py-3.5 border-b border-gray-100 flex-shrink-0">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#05204a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <h2 className="font-funnel font-semibold text-brand-dark-blue text-base">Knowledge Base &amp; Sources</h2>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
            {!rightPanel ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-gray-400 text-center max-w-xs">
                  Sources and analysis will appear here after your first query
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* AI Analysis block */}
                <div>
                  <p className="text-[11px] font-semibold tracking-widest text-brand-energic-blue uppercase mb-3">
                    AI Analysis: Policy Implications
                  </p>
                  <div className="bg-gray-50 rounded-xl px-5 py-4 text-sm text-gray-700 leading-relaxed">
                    {rightPanel.analysis}
                  </div>
                </div>

                {/* Source cards */}
                {rightPanel.sources && rightPanel.sources.length > 0 && (
                  <div className="space-y-3">
                    {rightPanel.sources.map((s, i) => (
                      <SourceCard key={s.id} source={s} index={i} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
