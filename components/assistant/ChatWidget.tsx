'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, Send, Check, Loader2, Sparkles } from 'lucide-react'
import type { PendingAction } from '@/lib/assistant/tools'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: PendingAction
  done?: boolean
}

const SUGGESTIONS = [
  'How much USD is left this month?',
  'Who do I owe money to?',
  'Log $200 usage on …',
]

function uid() {
  return Math.random().toString(36).slice(2)
}

/** Parse inline **bold** into nodes. */
function inline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyBase}-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={`${keyBase}-${i}`}>{part}</span>
  })
}

const TABLE_SEPARATOR = /^\|?[\s:|-]+\|?$/

/** Lightweight renderer: bold, bullet lists, and flattened table rows. */
function RichText({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []

  lines.forEach((raw, idx) => {
    const line = raw.trim()
    const key = `l-${idx}`

    if (!line) {
      out.push(<div key={key} className="h-1.5" />)
      return
    }

    // Skip markdown table separator rows like |---|---|
    if (line.includes('-') && TABLE_SEPARATOR.test(line)) return

    // Flatten table rows ("| a | b | c |") into a single readable line.
    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      if (cells.length > 0) {
        out.push(
          <div key={key} className="flex gap-1.5">
            <span className="text-gray-400 select-none">•</span>
            <span>{inline(cells.join(' — '), key)}</span>
          </div>
        )
        return
      }
    }

    // Bullet lines.
    const bullet = /^([-*•])\s+(.*)$/.exec(line)
    if (bullet) {
      out.push(
        <div key={key} className="flex gap-1.5">
          <span className="text-gray-400 select-none">•</span>
          <span>{inline(bullet[2], key)}</span>
        </div>
      )
      return
    }

    out.push(<p key={key}>{inline(line, key)}</p>)
  })

  return <div className="space-y-1">{out}</div>
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading, open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    const userMsg: ChatMessage = { id: uid(), role: 'user', content: trimmed }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content: data.error || 'Something went wrong.',
          },
        ])
        return
      }
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: data.reply || 'Done.',
          pending: data.pendingAction as PendingAction | undefined,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: 'Network error — please try again.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function confirm(msgId: string, action: PendingAction) {
    if (confirming) return
    setConfirming(true)
    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      setMessages((prev) =>
        prev
          .map((m) => (m.id === msgId ? { ...m, pending: undefined, done: res.ok } : m))
          .concat({
            id: uid(),
            role: 'assistant',
            content: res.ok
              ? data.message || 'Done.'
              : data.error || 'Could not complete that action.',
          })
      )
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'assistant', content: 'Network error — please try again.' },
      ])
    } finally {
      setConfirming(false)
    }
  }

  function cancel(msgId: string) {
    setMessages((prev) =>
      prev
        .map((m) => (m.id === msgId ? { ...m, pending: undefined } : m))
        .concat({ id: uid(), role: 'assistant', content: 'Okay, cancelled.' })
    )
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="fixed z-50 bottom-5 left-5 md:bottom-6 md:right-6 md:left-auto h-14 w-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed z-50 flex flex-col bg-white shadow-2xl border border-gray-200 overflow-hidden
            inset-x-3 bottom-3 top-16 rounded-2xl
            md:inset-auto md:bottom-6 md:right-6 md:top-auto md:w-[400px] md:h-[600px]"
          role="dialog"
          aria-label="Assistant"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shrink-0">
            <Sparkles className="w-5 h-5" />
            <div className="font-semibold">Assistant</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="ml-auto rounded-md p-1.5 hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-gray-500 space-y-3">
                <p>
                  Ask me about balances, or tell me to log usage and payments.
                  I&apos;ll ask you to confirm before changing anything.
                </p>
                <div className="space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="block w-full text-left text-sm rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id}>
                <div
                  className={
                    m.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                  }
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm whitespace-pre-wrap'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {m.role === 'assistant' ? (
                      <RichText text={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>
                </div>

                {m.pending && (
                  <div className="mt-2 ml-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                    <p className="font-medium text-amber-900">Confirm action</p>
                    <p className="mt-0.5 text-amber-800">{m.pending.summary}</p>
                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        disabled={confirming}
                        onClick={() => confirm(m.id, m.pending as PendingAction)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {confirming ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={confirming}
                        onClick={() => cancel(m.id)}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="border-t border-gray-200 p-3 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="h-9 w-9 shrink-0 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
