import React, { useState, useRef, useEffect } from 'react';
import { useMutation, gql } from '@apollo/client';
import TopNav from '../components/TopNav';
import logoCompressed from '../../assets/screenshots/workspace/Logo_compressed.svg';

const CHAT_MUTATION = gql`
  mutation Chat($message: String!, $conversation_history: [ChatMessageInput]) {
    chat(message: $message, conversation_history: $conversation_history) {
      message
      sessions {
        sessionId
        sessionTitle
        date
        url
        paragraphs {
          paragraphId
          title
          contentPreview
          issue
          subIssue
          issueCode
          stakeholders
        }
      }
    }
  }
`;

function renderInline(text) {
  // **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

function MarkdownMessage({ content }) {
  const lines = content.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^### /.test(line)) {
      elements.push(<h3 key={i} className="font-semibold text-brand-dark-blue text-sm mt-3 mb-1">{renderInline(line.slice(4))}</h3>);
    } else if (/^## /.test(line)) {
      elements.push(<h2 key={i} className="font-bold text-brand-dark-blue text-sm mt-4 mb-1.5">{renderInline(line.slice(3))}</h2>);
    } else if (/^# /.test(line)) {
      elements.push(<h1 key={i} className="font-bold text-brand-dark-blue text-base mt-4 mb-2">{renderInline(line.slice(2))}</h1>);
    } else if (/^[-*] /.test(line)) {
      // Collect consecutive list items
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(<li key={i} className="ml-4 list-disc">{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="my-1 space-y-0.5">{items}</ul>);
      continue;
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

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
      <div className="text-sm text-gray-700 max-w-[92%]">
        <MarkdownMessage content={message.content} />
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

function ParagraphCard({ para }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-brand-dark-blue leading-snug">{para.title}</p>
          {para.issue && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              {para.issueCode && <span className="font-mono mr-1">{para.issueCode}</span>}
              {para.issue}{para.subIssue ? ` › ${para.subIssue}` : ''}
            </p>
          )}
        </div>
        <span className="text-gray-400 text-xs mt-0.5 flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-50 space-y-2">
          {para.contentPreview && (
            <p className="text-xs text-gray-600 leading-relaxed pt-2">{para.contentPreview}</p>
          )}
          {para.stakeholders && (() => {
            try {
              const shs = JSON.parse(para.stakeholders).filter(s => s.name);
              if (!shs.length) return null;
              return (
                <div className="flex flex-wrap gap-1 pt-1">
                  {shs.map((s, i) => (
                    <span key={i} className="text-[10px] bg-brand-purple/10 text-brand-dark-blue px-2 py-0.5 rounded-full">
                      {s.name}
                    </span>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, index }) {
  const date = session.date
    ? new Date(session.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  // Extract session number from title like "Comunicato stampa del Consiglio dei Ministri n. 163"
  const numMatch = session.sessionTitle?.match(/n\.\s*(\d+)/);
  const sessionNum = numMatch ? numMatch[1] : session.sessionId;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="bg-brand-dark-blue text-white text-[10px] font-semibold px-2 py-0.5 rounded-full font-funnel tracking-wide flex-shrink-0">
              CdM #{sessionNum}
            </span>
            {date && <span className="text-xs text-gray-500">{date}</span>}
          </div>
        </div>
        {session.url && (
          <a href={session.url} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-brand-energic-blue underline flex-shrink-0">
            fonte ↗
          </a>
        )}
      </div>
      <div className="px-4 py-3 space-y-2">
        {session.paragraphs.length === 0 ? (
          <p className="text-xs text-gray-400">Nessun paragrafo disponibile.</p>
        ) : (
          session.paragraphs.map((p) => <ParagraphCard key={p.paragraphId} para={p} />)
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
      setRightPanel({ analysis: data.chat.message, sessions: data.chat.sessions || [] });
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
                {/* Session cards */}
                {rightPanel.sessions && rightPanel.sessions.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-3">
                      Sessioni rilevanti ({rightPanel.sessions.length})
                    </p>
                    <div className="space-y-3">
                      {rightPanel.sessions.map((s, i) => (
                        <SessionCard key={s.sessionId} session={s} index={i} />
                      ))}
                    </div>
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
