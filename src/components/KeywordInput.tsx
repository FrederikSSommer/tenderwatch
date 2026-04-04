'use client'

import { useState, KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface KeywordInputProps {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}

export function KeywordInput({ values, onChange, placeholder }: KeywordInputProps) {
  const [input, setInput] = useState('')

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const trimmed = input.trim()
      if (trimmed && !values.includes(trimmed)) {
        onChange([...values, trimmed])
      }
      setInput('')
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  function removeValue(value: string) {
    onChange(values.filter((v) => v !== value))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-sm text-blue-800"
        >
          {v}
          <button
            type="button"
            onClick={() => removeValue(v)}
            className="text-blue-600 hover:text-blue-800"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={values.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] border-none outline-none text-sm bg-transparent"
      />
    </div>
  )
}
