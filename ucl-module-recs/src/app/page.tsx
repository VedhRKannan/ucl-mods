'use client'
import { Analytics } from "@vercel/analytics/next"
import { useRef, useState, useEffect } from 'react'
import styles from './page.module.css'
import Head from "next/head"

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto'; // Reset
      el.style.height = `${el.scrollHeight}px`; // Expand to fit content
    }
  }, [query]);

  const search = async () => {
    setLoading(true)
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })
    const data = await res.json()
    setResults(data.results || [])
    setLoading(false)
  }

  return (
    <>
    <Head>
      <title>UCL Module Recommender</title>
      <link rel="icon" href="/favicon.ico" />
      
    </Head> 
      

    <main className="bg-black min-h-screen">
      <div className={styles.container}>
        <h1 className={styles.title}>UCL Module Recommender</h1>
        <p className={styles.subtitle}>
          Describe your interests and level (e.g. "Organic chemistry and neuroscience, year 2 Natural Sciences") to get tailored module suggestions. Also check for prerequisites by asking "What are the prerequisite modules for CHEM0019?"
        </p>

        <div className={styles.searchBar}>
            <textarea
                className={styles.input}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. biomed and maths, year 2"
                rows={1}
                />

          <button onClick={search} className={styles.button}>
            Search
          </button>
        </div>

        {loading && <p className="text-gray-500">Searching...</p>}

        {results && (
          <>
            {results.length === 0 ? (
              <p className="text-gray-500">No matching modules found.</p>
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
                      {m.outline.slice(0, 200)}...
                    </p>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
    </div>
  </main>
  </>
  )
}
