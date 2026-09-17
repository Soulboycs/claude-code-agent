import React, { useState } from 'react'
import { ShieldAlert, Check, X, Terminal, FileEdit } from 'lucide-react'
import { ApprovalRequest } from '@shared/types'

interface ApprovalCardProps {
  request: ApprovalRequest
  onRespond: (approved: boolean, reason?: string) => void
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({ request, onRespond }) => {
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)

  const isCommand = request.toolName === 'run_command'
  const commandStr = isCommand ? String(request.arguments.command || '') : ''

  return (
    <div className="bg-[#1c1417] border border-rose-500/40 rounded-lg p-4 shadow-xl mb-4 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
              Authorization Required
            </span>
            <span className="text-xs text-neutral-400">
              Tool: <code className="text-rose-200 bg-rose-950/40 px-1 py-0.5 rounded">{request.toolName}</code>
            </span>
          </div>

          <p className="text-sm text-neutral-200 mb-2 font-medium">
            {request.promptMessage}
          </p>

          {/* Details / Arguments */}
          {isCommand ? (
            <div className="bg-black/60 rounded border border-neutral-800 p-2.5 mb-3 font-mono text-xs text-emerald-400 overflow-x-auto flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <span>{commandStr}</span>
            </div>
          ) : (
            <div className="bg-black/60 rounded border border-neutral-800 p-2 mb-3 font-mono text-xs text-neutral-300 max-h-36 overflow-y-auto">
              <pre>{JSON.stringify(request.arguments, null, 2)}</pre>
            </div>
          )}

          {/* Reject with reason input */}
          {showRejectInput && (
            <div className="mb-3">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Optional feedback: Why is this action rejected?"
                className="w-full bg-[#121316] border border-neutral-700 rounded px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRespond(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve & Continue</span>
            </button>

            {showRejectInput ? (
              <button
                onClick={() => onRespond(false, rejectReason || 'User rejected')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Confirm Reject</span>
              </button>
            ) : (
              <button
                onClick={() => setShowRejectInput(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#25262e] hover:bg-[#32343d] text-neutral-300 hover:text-white text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
