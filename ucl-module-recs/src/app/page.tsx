'use client'

import { Analytics } from '@vercel/analytics/next'
import { useRef, useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import styles from './page.module.css'

type Module = {
  slug: string
  title: string
  url: string
  department: string
  level: string
  outline: string
  yearData?: YearDatum[]
}

type YearDatum = {
  year: string
  meanMark: number
  totalStudents: number
  gradeDistribution: Array<{ range: string; count: number | string }>
}

type StatsMap = Record<
  string,
  {
    latestYear?: string
    meanMark?: number
    yearsAvailable?: number
    studentsLatest?: number
    gradeDistribution?: Array<{ range: string; count: number | string }>
  }
>

// Recharts (client-only) for the modal chart
const ResponsiveContainer = dynamic(
  () => import('recharts').then(m => m.ResponsiveContainer),
  { ssr: false }
)
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const CartesianGrid = dynamic(
  () => import('recharts').then(m => m.CartesianGrid),
  { ssr: false }
)
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Module[] | null>(null)
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const router = useRouter()
  const params = useSearchParams()
  const selectedSlug = params.get('m')

  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
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
      <div className={styles.container}>
        <h1 className={styles.title}>UCL Module Recommender</h1>
        <p className={styles.subtitle}>
          Describe your interests and level (e.g. “Organic chemistry and neuroscience, year 2 Natural Sciences”) to get tailored module
          suggestions. Also check for prerequisites by asking “What are the prerequisite modules for CHEM0019?”
        </p>

        <div className={styles.searchBar}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                search()
              }
            }}
            placeholder="e.g. biomed and maths, year 2"
            rows={1}
            aria-label="Search query"
          />
          <button onClick={search} className={styles.button} disabled={loading}>
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
                {results.map(m => (
                  <button
                    key={m.slug}
                    type="button"
                    className={styles.card}
                    onClick={() => router.push(`/?m=${m.slug}`, { scroll: false })}
                    aria-haspopup="dialog"
                    aria-controls="module-modal"
                  >
                    <h2 className={styles.cardTitle}>{m.title}</h2>
                    <p className={styles.cardSub}>
                      {m.department} — Level {m.level}
                    </p>

                    {/* optional chips if you later hydrate with stats in search */}
                    <p className={styles.cardText}>{m.outline.slice(0, 200)}…</p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal overlay driven by ?m= */}
        <Suspense fallback={null}>
        <ModalFromQuery />
      </Suspense>
      

      <Analytics />
    </main>
  )
}



function ModalFromQuery() {
  const router = useRouter();
  const params = useSearchParams();         // <-- safe inside Suspense
  const slug = params.get('m');

  if (!slug) return null;
  return (
    <ModuleModal
      slug={slug}
      onClose={() => router.push('/', { scroll: false })}
    />
  );
}



/* --------------------
   Modal component
---------------------*/
function ModuleModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  // ---- Types ----
  type ModuleStats = {
    latestYear?: string;
    meanMark?: number;
    yearsAvailable?: number;
    studentsLatest?: number;
    gradeDistribution?: Array<{ range: string; count: number | string }>;
  };

  // ---- State ----
  const [record, setRecord] = useState<Module | null>(null);
  const [stats, setStats] = useState<ModuleStats | null>(null);
  const [year, setYear] = useState<string>('');
  const [tab, setTab] = useState<'selected' | 'avg' | 'distYears'>('selected');
  const [hasOnlyStatsDist, setHasOnlyStatsDist] = useState(false);

  // ---- Visual constants ----
  const AXIS_TICK = { fill: '#bcd1ff', fontSize: 12 };
  const GRID_STROKE = 'rgba(255,255,255,0.06)';
  const BLUE_1 = '#7aa2ff';
  const BLUE_2 = '#3b5aaa';
  const TEAL_1 = '#6ee7d2';
  const TEAL_2 = '#1e907d';
  const RANGE_PALETTE = [
    '#7289ff', '#66c7ff', '#8f7aff', '#5ee0a0',
    '#ffd166', '#f6a5ff', '#f08c2e', '#a1e3ff', '#a2ffde', '#ffd3a1'
  ];
  const colorForRange = (rangeKey: string) => {
    const ranges = [
      '00.01–9.99%','10.00–19.99%','20.00–29.99%','30.00–39.99%',
      '40.00–49.99%','50.00–59.99%','60.00–69.99%','70.00–79.99%',
      '80.00–89.99%','90.00%+'
    ];
    const idx = Math.max(0, ranges.indexOf(rangeKey));
    return RANGE_PALETTE[idx % RANGE_PALETTE.length];
  };

  // ---- Helpers ----
  const approxToNumber = (v: number | string): number => {
    if (typeof v === 'number') return v;
    if (v.includes('<')) return 3;
    const n = parseInt(v.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const SelectedTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    return (
      <div
        style={{
          background: 'rgba(18,29,52,0.95)',
          border: '1px solid #223353',
          borderRadius: 12,
          padding: '10px 12px',
          color: '#eaf1ff',
          boxShadow: '0 10px 26px rgba(0,0,0,.35)'
        }}
      >
        <div style={{ fontSize: 12, opacity: .85, marginBottom: 4 }}>{label}</div>
        <div style={{ fontWeight: 800, fontSize: 16, lineHeight: '18px' }}>
          {p.payload.raw /* show raw only, e.g. "~37" */}
        </div>
      </div>
    );
  };
  

  // ---- Load data from /public JSONs ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const [baseRes, statsRes] = await Promise.all([
        fetch('/ucl_modules_structured.json'),
        fetch('/module_stats.json').catch(() => null),
      ]);
      const baseAll = (await baseRes.json()) as Module[];
      const rec = baseAll.find((m) => m.slug === slug) || null;
      const statsMap = (statsRes ? await statsRes.json() : {}) as Record<string, ModuleStats>;
      if (!alive) return;

      setRecord(rec);
      const s = statsMap?.[slug] ?? null;
      setStats(s);

      const baseYears = (rec?.yearData ?? []).map((y) => y.year).sort();
      const defaultYear = baseYears.at(-1) || s?.latestYear || '';
      setYear(defaultYear);

      setHasOnlyStatsDist(!baseYears.length && Array.isArray(s?.gradeDistribution));
    })();
    return () => { alive = false; };
  }, [slug]);

  // ---- Close on ESC ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ---- Derived data ----
  const years = useMemo(() => (record?.yearData ?? []).map((y) => y.year).sort(), [record]);
  const selectedYearData = useMemo(
    () => record?.yearData?.find((y) => y.year === year),
    [record, year]
  );
  const hasMultiYear = (record?.yearData?.length ?? 0) > 1;

  const meanAcross = useMemo(() => {
    const ys = record?.yearData ?? [];
    if (!ys.length) return null;
    const sum = ys.reduce((acc, y) => acc + (y.meanMark ?? 0), 0);
    return (sum / ys.length).toFixed(1);
  }, [record]);

  // Selected-year distribution (base first, then stats.latestYear fallback)
  const chartSelectedYear = useMemo(() => {
    const fromBase = selectedYearData?.gradeDistribution;
    if (fromBase?.length) {
      return fromBase.map((b) => ({
        range: b.range,
        count: approxToNumber(b.count),
        raw: b.count,
      }));
    }
    if (stats?.gradeDistribution && stats.latestYear && year === stats.latestYear) {
      return stats.gradeDistribution.map((b) => ({
        range: b.range,
        count: approxToNumber(b.count),
        raw: b.count,
      }));
    }
    return [];
  }, [selectedYearData, stats, year]);

  // Averages through years
  const chartAveragesYears = useMemo(() => {
    return (record?.yearData ?? [])
      .slice()
      .sort((a, b) => a.year.localeCompare(b.year))
      .map((y) => ({
        year: y.year,
        mean: Number(y.meanMark?.toFixed(2) ?? 0),
        students: y.totalStudents,
      }));
  }, [record]);

  // Stacked distribution across years
  const chartDistributionYears = useMemo(() => {
    const ys = (record?.yearData ?? [])
      .slice()
      .sort((a, b) => a.year.localeCompare(b.year));
    if (!ys.length) return [];
    const ranges = (ys[0].gradeDistribution ?? []).map((b) => b.range);
    return ys.map((y) => {
      const row: Record<string, number | string> = { year: y.year };
      (y.gradeDistribution ?? []).forEach((b) => { row[b.range] = approxToNumber(b.count); });
      ranges.forEach((r) => { if (row[r] == null) row[r] = 0; });
      return row;
    });
  }, [record]);

  // ---- Render ----
  if (!record) {
    return (
      <div className={styles.modalBackdropFull} onClick={onClose}>
        <div className={styles.modalFull} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeaderFull}>
            <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className={styles.modalBody}><p className={styles.muted}>Loading…</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modalBackdropFull} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modalFull} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeaderFull}>
          <button className={styles.backPill} onClick={onClose}>← Back to Search</button>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* HERO */}
        <section className={styles.hero}>
          <h1 className={styles.h1}>{record.title}</h1>

          <div className={styles.heroMetaRow}>
            <div className={styles.heroMeta}>
              <div className={styles.metaIcon}>👥</div>
              <div>
                <div className={styles.metaLabel}>Department</div>
                <div className={styles.metaValue}>{record.department ?? '—'}</div>
              </div>
            </div>

            <div className={styles.heroMeta}>
              <div className={`${styles.metaIcon} ${styles.success}`}>📈</div>
              <div>
                <div className={styles.metaLabel}>Average Grade</div>
                <div className={styles.metaValue}>
                  {typeof stats?.meanMark === 'number' ? `${stats.meanMark.toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>

            <div className={styles.heroMeta}>
              <div className={`${styles.metaIcon} ${styles.purple}`}>📊</div>
              <div>
                <div className={styles.metaLabel}>Total Students</div>
                <div className={styles.metaValue}>
                  {typeof stats?.studentsLatest === 'number' ? stats.studentsLatest : '—'}
                </div>
              </div>
            </div>
          </div>

          {record.outline && <p className={styles.outline}>{record.outline}</p>}

          <div className={styles.heroFooter}>
            <a href={record.url} target="_blank" className={styles.extLink} rel="noreferrer">
              View in UCL Catalogue ↗
            </a>
          </div>
        </section>

        {/* YEARS (only if base has them) */}
        {(record.yearData?.length ?? 0) > 0 && (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitleWrap}>
                <div className={styles.panelIcon}>📅</div>
                <h2 className={styles.panelTitle}>Academic Years</h2>
                <span className={styles.muted}>({years.length} years available)</span>
              </div>
            </div>

            <div className={styles.yearRow}>
              {years.map((y) => {
                const yd = record.yearData!.find((d) => d.year === y)!;
                const active = y === year;
                return (
                  <button
                    key={y}
                    className={`${styles.yearBtn} ${active ? styles.yearBtnActive : ''}`}
                    onClick={() => setYear(y)}
                  >
                    <div className={styles.yearBig}>{y}</div>
                    <div className={styles.yearSmall}>{yd.meanMark.toFixed(1)}% avg</div>
                    <div className={styles.yearSmall}>{yd.totalStudents} students</div>
                  </button>
                );
              })}
            </div>

            <div className={styles.yearSummary}>
              <span>Selected: {year || '—'}</span>
              {meanAcross && (
                <>
                  <span className={styles.dot} />
                  <span>Mean: <strong>{meanAcross}%</strong></span>
                </>
              )}
              {record.yearData?.find((y) => y.year === year) && (
                <>
                  <span className={styles.dot} />
                  <span>
                    Students: <strong>{record.yearData.find((y) => y.year === year)!.totalStudents}</strong>
                  </span>
                </>
              )}
            </div>
          </section>
        )}

        {/* Tabs */}
        <div className={styles.tabsBar}>
          {(record.yearData?.length ?? 0) > 1 && (
            <>
              <button
                className={`${styles.tab} ${tab === 'avg' ? styles.tabActive : ''}`}
                onClick={() => setTab('avg')}
              >
                Averages (through years)
              </button>
              <button
                className={`${styles.tab} ${tab === 'distYears' ? styles.tabActive : ''}`}
                onClick={() => setTab('distYears')}
              >
                Distributions (through years)
              </button>
            </>
          )}
        </div>

        {/* Selected-year distribution */}
        {tab === 'selected' && (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitleWrap}>
                <div className={styles.panelIcon}>📈</div>
                <h2 className={styles.panelTitle}>Grade Distribution</h2>
                {year && <span className={styles.muted}> ({year})</span>}
                {hasOnlyStatsDist && stats?.latestYear === year }
              </div>
            </div>

            <div className={styles.chartWrap}>
              {chartSelectedYear.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartSelectedYear} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
                    <defs>
                      <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BLUE_1} />
                        <stop offset="100%" stopColor={BLUE_2} />
                      </linearGradient>
                      <linearGradient id="barFillActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#9db7ff" />
                        <stop offset="100%" stopColor="#4b6fd6" />

                      </linearGradient>
                    </defs>

                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="range" tick={AXIS_TICK} />
                    <YAxis allowDecimals={false} tick={AXIS_TICK} />
                    <Tooltip content={<SelectedTooltip />} cursor={false} />
                    <Bar
                      dataKey="count"
                      fill="url(#barFill)"
                      radius={[10, 10, 4, 4]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className={styles.empty}>No grade data for this year.</p>
              )}
            </div>
          </section>
        )}

        {/* Averages per year */}
        {tab === 'avg' && (record.yearData?.length ?? 0) > 1 && (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitleWrap}>
                <div className={styles.panelIcon}>📉</div>
                <h2 className={styles.panelTitle}>Average mark per year</h2>
              </div>
            </div>

            <div className={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartAveragesYears} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
                  <defs>
                    <linearGradient id="avgFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TEAL_1} />
                      <stop offset="100%" stopColor={TEAL_2} />
                    </linearGradient>
                    <linearGradient id="avgFillActive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#99f2de" />
                      <stop offset="100%" stopColor="#2db39c" />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="year" tick={AXIS_TICK} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} />
                  <Tooltip content={<SelectedTooltip />}cursor={false} />
                  <Bar
                    dataKey="mean"
                    name="Mean mark"
                    fill="url(#avgFill)"
                    radius={[10, 10, 4, 4]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Stacked distributions across years */}
        {tab === 'distYears' && (record.yearData?.length ?? 0) > 1 && (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitleWrap}>
                <div className={styles.panelIcon}>📊</div>
                <h2 className={styles.panelTitle}>Distribution across years</h2>
              </div>
            </div>

            <div className={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartDistributionYears} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="year" tick={AXIS_TICK} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(18,29,52,0.95)',
                      border: '1px solid #223353',
                      borderRadius: 12,
                      color: '#eaf1ff',
                    }}
                  />
                  {Object.keys(chartDistributionYears[0] || {})
                    .filter((k) => k !== 'year')
                    .map((rangeKey) => (
                      <Bar
                        key={rangeKey}
                        dataKey={rangeKey}
                        stackId="a"
                        fill={colorForRange(rangeKey)}
                        radius={[6, 6, 0, 0]}
                      />
                    ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}



function approxToNumber(v: number | string): number {
  if (typeof v === 'number') return v
  if (v.includes('<')) return 3
  const n = parseInt(v.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}
