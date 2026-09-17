import React, { useState } from 'react'
import { ShieldAlert, Check, X, Terminal } from 'lucide-react'
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
    <div className="bg-white border border-rose-200/90 rounded-xl p-4 shadow-md mb-4 text-neutral-900 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0 border border-rose-100">
          <ShieldAlert className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">
              Authorization Required
            </span>
            <span className="text-xs text-neutral-500">
              Tool: <code className="text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.5 rounded font-mono text-[11px]">{request.toolName}</code>
            </span>
          </div>

          <p className="text-sm text-neutral-800 mb-2 font-medium">
            {request.promptMessage}
          </p>

          {/* Details / Arguments */}
          {isCommand ? (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-2.5 mb-3 font-mono text-xs text-emerald-400 overflow-x-auto flex items-center gap-2 shadow-inner">
              <Terminal className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <span>{commandStr}</span>
            </div>
          ) : (
            <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-2.5 mb-3 font-mono text-xs text-neutral-800 max-h-36 overflow-y-auto">
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
                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-rose-500"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRespond(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve & Continue</span>
            </button>

            {showRejectInput ? (
              <button
                onClick={() => onRespond(false, rejectReason)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Confirm Reject</span>
              </button>
            ) : (
              <button
                onClick={() => setShowRejectInput(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reject...</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
