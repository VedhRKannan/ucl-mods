'use client'

import { Analytics } from '@vercel/analytics/next'
import { useRef, useState, useEffect } from 'react'
import styles from './page.module.css'

type Module = {
  slug: string
  title: string
  url: string
  department: string
  level: string
  outline: string
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Module[] | null>(null)
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // autosize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [query])

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      setResults(data.results || [])
    } catch (e) {
      console.error(e)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <div className={`${styles.container}`}>
        <h1 className={styles.title}>UCL Module Recommender</h1>
        <p className={styles.subtitle}>
          Describe your interests and level (e.g. “Organic chemistry and neuroscience, year 2 Natural Sciences”) to get tailored module suggestions.
          Also check for prerequisites by asking “What are the prerequisite modules for CHEM0019?”
        </p>

        <div className={styles.searchBar}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                search()
              }
            }}
            placeholder="e.g. biomed and maths, year 2"
            rows={1}
            aria-label="Search query"
          />
          <button
            onClick={search}
            className={styles.button}
            disabled={loading}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {loading && (
          <div className={styles.loadingWrap} aria-live="polite">
            <span className={styles.loadingText}>Searching…</span>
            <span className={styles.orbit} aria-hidden="true">
              <span className={styles.bolt} role="img" aria-label="lightning">
                ⚡️
              </span>
            </span>
          </div>
        )}

        {results && !loading && (
          <>
            {results.length === 0 ? (
              <p className={styles.empty}>No matching modules found.</p>
            ) : (
              <div className={styles.cardGrid}>
                {results.map((m) => (
                  <a
                    key={m.slug}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.card}
                  >
                    <h2 className={styles.cardTitle}>{m.title}</h2>
                    <p className={styles.cardSub}>
                      {m.department} — Level {m.level}
                    </p>
                    <p className={styles.cardText}>
                      {m.outline.slice(0, 200)}…
                    </p>
                  </a>
                ))}
              </div>
            )}
          </>
        )}

        <Analytics />
      </div>
    </main>
  )
}
