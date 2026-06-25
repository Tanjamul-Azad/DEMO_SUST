import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import { cn } from '../lib/cn.js';
import { SAMPLE_MESSAGES, DEPT_COLOR } from '../lib/format.js';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { SeverityBadge, CaseTag, DeptTag } from '../components/ui/Badge.jsx';
import { SeverityGauge, ConfidenceDial } from '../components/ui/Gauge.jsx';
import { JsonViewer } from '../components/ui/JsonViewer.jsx';

const CHANNELS = ['app', 'sms', 'call_center', 'merchant_portal'];
const LOCALES = ['en', 'bn', 'mixed'];
const newId = () => `T-${Math.floor(1000 + Math.random() * 9000)}`;

export default function Playground() {
  const [message, setMessage] = useState(SAMPLE_MESSAGES[0].message);
  const [channel, setChannel] = useState('app');
  const [locale, setLocale] = useState('en');
  const [ticketId, setTicketId] = useState(newId());

  const mut = useMutation({
    mutationFn: () => api.sortTicket({ ticket_id: ticketId, channel, locale, message }),
  });

  const classify = () => {
    if (!message.trim()) return;
    mut.mutate();
  };

  const pickSample = (s) => {
    setMessage(s.message);
    setChannel(s.channel);
    setLocale(s.locale);
    setTicketId(newId());
    mut.reset();
  };

  return (
    <div className="shell pb-24">
      <PageHeader index="01" title="Triage Playground" subtitle="One message in, one structured verdict out. Type a complaint, or try a sample." />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ---------------- Composer ---------------- */}
        <div className="card p-6 md:p-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">Compose ticket</span>
            <span className="font-mono text-xs text-faint">{ticketId}</span>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder="e.g. I sent 5000 taka to a wrong number this morning…"
            className={cn(
              'w-full resize-none rounded-2xl border border-hairline bg-base/60 p-4 text-base outline-none transition focus:border-violet',
              locale === 'bn' && 'font-bn',
            )}
            data-cursor
          />

          <div className="mt-5 grid grid-cols-2 gap-4">
            <Field label="Channel">
              <Select value={channel} onChange={setChannel} options={CHANNELS} />
            </Field>
            <Field label="Locale">
              <Select value={locale} onChange={setLocale} options={LOCALES} />
            </Field>
          </div>

          <div className="mt-6">
            <div className="label mb-3">Samples</div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_MESSAGES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => pickSample(s)}
                  className={cn('rounded-full border border-hairline px-3 py-1.5 text-xs text-muted transition hover:border-line hover:text-ink', s.locale === 'bn' && 'font-bn')}
                  data-cursor
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={classify}
            disabled={mut.isPending || !message.trim()}
            className="btn btn-primary mt-8 w-full justify-center disabled:opacity-50"
            data-cursor
          >
            {mut.isPending ? 'Reading the storm…' : 'Classify ticket'}
          </button>
        </div>

        {/* ---------------- Result ---------------- */}
        <div className="relative min-h-[460px]">
          <AnimatePresence mode="wait">
            {mut.isPending && <ReadingState key="reading" />}
            {mut.isError && (
              <Centered key="error">
                <p className="font-display text-2xl text-muted">Could not reach the service.</p>
                <p className="mt-2 text-sm text-faint">{String(mut.error?.message || '')}</p>
                <p className="mt-4 text-sm text-faint">Is the backend running on {api.base}?</p>
              </Centered>
            )}
            {mut.isSuccess && <Result key="result" data={mut.data} />}
            {mut.isIdle && (
              <Centered key="idle">
                <div className="font-serif text-6xl text-faint">{'{ }'}</div>
                <p className="mt-4 max-w-xs text-muted">Your classification will assemble here — case type, severity, routing, and a two-second summary.</p>
              </Centered>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Result({ data }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="card overflow-hidden p-6 md:p-8"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="label mb-3">Classification</div>
          <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }}>
            <CaseTag caseType={data.case_type} className="!text-sm !px-3 !py-1.5" />
          </motion.div>
        </div>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }}>
          <ConfidenceDial value={data.confidence} />
        </motion.div>
      </div>

      <div className="mt-8 grid grid-cols-[auto_1fr] items-center gap-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <div className="label mb-3">Severity</div>
          <SeverityGauge severity={data.severity} height={130} />
        </motion.div>
        <div className="space-y-5">
          <motion.div initial={{ x: 16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.28 }}>
            <div className="label mb-2">Severity</div>
            <SeverityBadge severity={data.severity} />
          </motion.div>
          <motion.div initial={{ x: 16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.36 }}>
            <div className="label mb-2">Routed to</div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: DEPT_COLOR[data.department] }} />
              <DeptTag dept={data.department} />
            </div>
          </motion.div>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }} className="mt-8">
        <div className="label mb-2">Agent summary</div>
        <Typewriter text={data.agent_summary} className="font-serif text-lg leading-relaxed text-ink" />
      </motion.div>

      {data.human_review_required && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 flex items-center justify-between rounded-2xl border px-4 py-3"
          style={{ borderColor: '#FF3B5C55', background: '#FF3B5C12' }}
        >
          <span className="flex items-center gap-2 text-sm font-medium" style={{ color: '#FF3B5C' }}>
            <span className="h-2 w-2 animate-pulse-critical rounded-full" style={{ background: '#FF3B5C' }} />
            Human review required — escalated to Sentinel
          </span>
          <Link to="/sentinel" className="text-xs font-medium underline" style={{ color: '#FF3B5C' }} data-cursor>Open Sentinel</Link>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-6">
        <JsonViewer data={data} />
      </motion.div>
    </motion.div>
  );
}

function ReadingState() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card grid min-h-[460px] place-items-center p-8">
      <div className="text-center">
        <div className="relative mx-auto h-24 w-24">
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute inset-0 rounded-full border" style={{ borderColor: ['#FF3D81', '#7A5CFF', '#28E0C8'][i], animation: `spin ${1.4 + i * 0.4}s linear infinite`, transform: `scale(${1 - i * 0.18})`, opacity: 0.8 }} />
          ))}
          <span className="absolute inset-0 grid place-items-center font-mono text-xs text-muted">sort</span>
        </div>
        <p className="mt-6 text-muted">Reading the storm…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </motion.div>
  );
}

function Centered({ children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card grid min-h-[460px] place-items-center p-8 text-center">
      <div>{children}</div>
    </motion.div>
  );
}

function Typewriter({ text, className }) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(text); return undefined; }
    setShown('');
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [text]);
  return <p className={className}>{shown}<span className="animate-pulse">{shown.length < text.length ? '▍' : ''}</span></p>;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-hairline bg-base/60 px-3 py-2.5 text-sm outline-none transition focus:border-violet"
      data-cursor
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-elevated text-ink">{o}</option>
      ))}
    </select>
  );
}
