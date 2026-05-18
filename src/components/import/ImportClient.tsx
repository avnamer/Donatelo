'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileJson, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

type Status = 'idle' | 'preview' | 'loading' | 'success' | 'error'

interface Preview {
  portfolioName?: string
  folders: number
  holdings: number
  lots: number
  cashAccounts: number
}

function parsePreview(json: unknown): Preview | null {
  try {
    const data = json as any
    const portfolio = data?.portfolio
    if (!portfolio?.folders) return null

    let holdings = 0
    let lots = 0
    for (const f of portfolio.folders) {
      holdings += f.holdings?.length ?? 0
      for (const h of f.holdings ?? []) {
        lots += h.lots?.length ?? 0
      }
    }

    return {
      portfolioName: portfolio.name,
      folders: portfolio.folders.length,
      holdings,
      lots,
      cashAccounts: portfolio.cashAccounts?.length ?? 0,
    }
  } catch {
    return null
  }
}

export function ImportClient() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [parsedJson, setParsedJson] = useState<unknown>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState<{ foldersCreated: number; holdingsCreated: number; lotsCreated: number } | null>(null)

  function handleFile(f: File) {
    if (!f.name.endsWith('.json')) {
      setErrorMsg('Please upload a .json file exported from this app or Donatello.')
      setStatus('error')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string)
        const p = parsePreview(json)
        if (!p) {
          setErrorMsg('File format not recognised. Please use a JSON backup from this app.')
          setStatus('error')
          return
        }
        setFile(f)
        setParsedJson(json)
        setPreview(p)
        setStatus('preview')
      } catch {
        setErrorMsg('Could not parse JSON. The file may be corrupted.')
        setStatus('error')
      }
    }
    reader.readAsText(f)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  async function handleImport() {
    if (!parsedJson) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedJson),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Import failed. Please try again.')
        setStatus('error')
        return
      }
      setResult(data)
      setStatus('success')
    } catch {
      setErrorMsg('Network error. Please try again.')
      setStatus('error')
    }
  }

  function reset() {
    setStatus('idle')
    setFile(null)
    setPreview(null)
    setParsedJson(null)
    setErrorMsg('')
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Portfolio</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import from a JSON backup exported from this app or from Donatello.
        </p>
      </div>

      {status === 'idle' && (
        <div
          className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium text-sm">Drop your JSON file here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {status === 'preview' && preview && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileJson className="h-4 w-4 text-primary" />
              {file?.name}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Folders" value={preview.folders} />
              <Stat label="Holdings" value={preview.holdings} />
              <Stat label="Lots" value={preview.lots} />
              <Stat label="Cash Accounts" value={preview.cashAccounts} />
            </div>
            <p className="text-xs text-muted-foreground pt-1 border-t">
              These items will be added to your existing portfolio. Existing data will not be deleted.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Import
            </button>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Importing…
        </div>
      )}

      {status === 'success' && result && (
        <div className="rounded-xl border bg-card p-6 text-center space-y-4">
          <CheckCircle2 className="h-10 w-10 text-gain mx-auto" />
          <div>
            <p className="font-semibold">Import complete</p>
            <p className="text-sm text-muted-foreground mt-1">
              {result.foldersCreated} folders · {result.holdingsCreated} holdings · {result.lotsCreated} lots
            </p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Go to Portfolio
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-destructive text-sm font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorMsg}
          </div>
          <button
            onClick={reset}
            className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
