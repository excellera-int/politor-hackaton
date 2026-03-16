import React, { useState, useRef, useEffect } from 'react';
import { useMutation, gql } from '@apollo/client';
import TopNav from '../components/TopNav';

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

function SourcesPanel({ sessions }) {
  const [open, setOpen] = useState(false);
  if (!sessions || sessions.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
      >
        <span>{open ? '▾' : '▸'}</span>
        {sessions.length} source{sessions.length !== 1 ? 's' : ''}
      </button>

      {open && (
        <ul className="mt-1 space-y-1">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-2 py-1"
            >
              <span className="font-medium text-gray-700">Session #{s.number || s.id}</span>
              {s.date && (
                <span className="ml-2">{new Date(s.date).toLocaleDateString('en-GB')}</span>
              )}
              {s.branch && <span className="ml-2 text-gray-400">· {s.branch}</span>}
              {s.type && <span className="ml-1 text-gray-400">/ {s.type}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-xl rounded-lg px-4 py-3 text-sm ${
          isUser
            ? 'bg-gray-900 text-white'
            : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && <SourcesPanel sessions={message.sources} />}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);

  const [sendChat] = useMutation(CHAT_MUTATION);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isTyping) return;

    const userMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
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
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, sources: [] },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleNewConversation() {
    setMessages([]);
    setInput('');
  }

  return (
    <div className="min-h-screen bg-brand-light-blue flex flex-col">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col bg-white mx-4 mb-4 rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
            <h2 className="text-sm font-medium text-gray-700">Council of Ministers — AI Search</h2>
            <button
              onClick={handleNewConversation}
              className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-1 transition-colors"
            >
              New conversation
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                <p className="text-base font-medium text-gray-600 mb-1">Ask Politor anything</p>
                <p className="text-sm">
                  Try: "What decisions were made about infrastructure in 2023?"
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}

            {isTyping && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <form
            onSubmit={handleSend}
            className="border-t border-gray-200 bg-white px-6 py-4 flex gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a Council of Ministers session…"
              disabled={isTyping}
              className="flex-1 border border-gray-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="bg-gray-900 text-white rounded-md px-5 py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

