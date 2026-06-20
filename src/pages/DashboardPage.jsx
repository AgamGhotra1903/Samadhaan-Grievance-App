import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { getGrievances } from '../services/api';
import GrievanceCard from '../components/GrievanceCard';
import TypingText from '../components/TypingText';
import {
  BarChart3,
  CheckCircle,
  ThumbsUp,
  Clock,
  AlertTriangle,
  MapPin,
  Activity,
  Radar,
} from 'lucide-react';

const ALL_CATEGORIES = [
  'Roads & Infrastructure',
  'Water Supply',
  'Electricity',
  'Waste Management',
  'Public Safety',
  'Emergency Services',
  'Other',
];

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="skeleton-shimmer h-48 rounded-2xl" />
        <div className="skeleton-shimmer h-48 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton-shimmer h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton-shimmer h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/** Radial resolution gauge (SVG) */
function ResolutionRadial({ percent }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
        <defs>
          <linearGradient id="radGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(16,185,129,0.12)" strokeWidth="10" />
        <motion.circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="url(#radGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{Math.round(percent)}%</span>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">Resolved</span>
      </div>
    </div>
  );
}

/** Sparkline from last N days of volume */
function TrendSparkline({ points }) {
  if (!points.length) return null;
  const w = 280;
  const h = 96;
  const max = Math.max(...points, 1);
  const step = w / Math.max(points.length - 1, 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - (p / max) * (h - 12) - 6}`)
    .join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#0ea5e9" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.45" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.path
        d={d}
        fill="none"
        stroke="url(#lineGlow)"
        strokeWidth="2.5"
        filter="url(#glow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.4, ease: 'easeInOut' }}
      />
    </svg>
  );
}

function DashboardPage() {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ status: 'All', category: 'All', search: '' });
  const [sortBy, setSortBy] = useState('date');

  const { isAuthority, isSuperAdmin, user, departmentId, token } = useAuth();

  const [toast, setToast] = useState(null);

  const [userLocation, setUserLocation] = useState({
    latitude: null,
    longitude: null,
    address: 'Fetching location…',
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        showToast('Triangulating position…', 'info');
        await new Promise((res) => setTimeout(res, 800));
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          })
        );
        const { latitude, longitude } = pos.coords;
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
        );
        const geoJson = await geoRes.json();
        const address = geoJson.display_name || 'Unknown location';
        setUserLocation({ latitude, longitude, address });
        showToast(`Locked: ${address.split(',')[0]}`, 'success');
      } catch (err) {
        try {
          const ipRes = await fetch('https://ipapi.co/json/');
          const ipJson = await ipRes.json();
          const fallbackAddress = `${ipJson.city}, ${ipJson.region}`;
          setUserLocation({
            latitude: ipJson.latitude,
            longitude: ipJson.longitude,
            address: fallbackAddress,
          });
          showToast(`Approximate: ${fallbackAddress}`, 'info');
        } catch {
          setUserLocation({ latitude: null, longitude: null, address: 'Location unavailable' });
          showToast('Location unavailable', 'error');
        }
      }
    };
    fetchLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDistanceKm = (loc1, loc2) => {
    if (!loc1?.latitude || !loc2?.latitude) return Infinity;
    const R = 6371;
    const dLat = ((loc2.latitude - loc1.latitude) * Math.PI) / 180;
    const dLon = ((loc2.longitude - loc1.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((loc1.latitude * Math.PI) / 180) *
        Math.cos((loc2.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const stats = useMemo(() => {
    return grievances.reduce(
      (acc, g) => {
        acc.total++;
        if (g.status === 'In Progress') acc.inProgress++;
        if (g.status === 'Resolved') acc.resolved++;
        return acc;
      },
      { total: 0, inProgress: 0, resolved: 0 }
    );
  }, [grievances]);

  const resolutionPercent = stats.total ? (stats.resolved / stats.total) * 100 : 0;

  const trendPoints = useMemo(() => {
    const days = 7;
    const now = new Date();
    const buckets = Array(days).fill(0);
    grievances.forEach((g) => {
      const d = new Date(g.createdAt);
      const diff = Math.floor((now - d) / (86400000));
      if (diff >= 0 && diff < days) buckets[days - 1 - diff]++;
    });
    return buckets;
  }, [grievances]);

  const deptResolvePreview = useMemo(() => {
    const map = {};
    grievances.forEach((g) => {
      const cat = g.category || 'Other';
      if (!map[cat]) map[cat] = { total: 0, resolved: 0 };
      map[cat].total++;
      if (g.status === 'Resolved') map[cat].resolved++;
    });
    return Object.entries(map)
      .map(([name, v]) => ({
        name,
        rate: v.total ? Math.round((v.resolved / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 4);
  }, [grievances]);

  useEffect(() => {
    setLoading(true);
    getGrievances(1, 100, token)
      .then((data) => {
        setGrievances(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load grievances. Please refresh.');
        setLoading(false);
      });
  }, [token]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const priorityOrder = {
    Critical: 1,
    High: 2,
    Medium: 3,
    Low: 4,
    Pending: 5,
    undefined: 6,
  };

  const filteredGrievances = grievances
    .filter((g) => {
      const matchesStatus = filters.status === 'All' || g.status === filters.status;
      const matchesCategory = filters.category === 'All' || g.category === filters.category;
      const matchesSearch =
        !filters.search ||
        g.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        g.category.toLowerCase().includes(filters.search.toLowerCase()) ||
        (g.aiPriority || '').toLowerCase().includes(filters.search.toLowerCase());
      return matchesStatus && matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'priority') {
        const aPriority = priorityOrder[a.aiPriority] || 6;
        const bPriority = priorityOrder[b.aiPriority] || 6;
        return aPriority - bPriority;
      }
      if (sortBy === 'upvotes') return (b.upvotes || 0) - (a.upvotes || 0);
      if (sortBy === 'nearest' && userLocation) {
        const distA = getDistanceKm(userLocation, a.location);
        const distB = getDistanceKm(userLocation, b.location);
        return distA - distB;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  return (
    <motion.div
      className="relative min-h-[60vh] overflow-hidden text-slate-800"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className={`fixed bottom-6 right-6 z-50 rounded-xl border px-5 py-3 text-sm font-medium shadow-lg backdrop-blur-xl ${
              toast.type === 'success'
                ? 'border-neon-emerald/40 bg-neon-emerald-dim/20 text-neon-emerald'
                : toast.type === 'error'
                  ? 'border-neon-crimson-hot/50 bg-neon-crimson-hot/15 text-neon-crimson'
                  : 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="mb-10 space-y-8"
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45 }}
      >
        <div className="glass-panel-strong relative overflow-hidden p-6 lg:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/12 via-white/40 to-sky-500/10" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
              for Our Own Public
            </p>
            <h1 className="font-space-grotesk bg-gradient-to-r from-slate-900 via-emerald-700 to-sky-700 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent md:text-5xl">
              Community issue dashboard
            </h1>
            <p className="mt-3 max-w-xl text-sm font-medium text-slate-600">
              {isSuperAdmin
                ? 'All departments and citizen reports in one clean civic view'
                : isAuthority
                  ? `Department workspace · ${departmentId}`
                  : 'Track, filter, and support live public grievances'}
            </p>
          </div>

          <div className="relative w-full max-w-md">
            <input
              type="text"
              value={filters.search || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              className="input-dark w-full py-3 pl-4 pr-10"
            />
            {(!filters.search || filters.search.trim() === '') && (
              <span className="pointer-events-none absolute left-4 top-3 text-sm text-slate-500">
                <TypingText
                  texts={['Query: water outage', 'Query: road hazard', 'Query: critical', 'Filter by department']}
                  typingSpeed={80}
                  deletingSpeed={40}
                  pauseTime={900}
                />
              </span>
            )}
          </div>
          </div>
        </div>

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* Hero visualizations */}
            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <motion.div
                className="glass-panel-strong hover-lift relative overflow-hidden p-6"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-emerald-600">
                      <Activity className="h-5 w-5" />
                      <span className="text-xs font-semibold uppercase tracking-widest">Ingest volume</span>
                    </div>
                    <p className="font-space-grotesk mt-2 text-3xl font-extrabold text-slate-900">{stats.total}</p>
                    <p className="text-xs text-slate-500">Cases · trailing 7-day window</p>
                  </div>
                  <div className="min-h-[96px] flex-1 sm:max-w-[55%]">
                    <TrendSparkline points={trendPoints} />
                  </div>
                </div>
              </motion.div>

              <motion.div
                className="glass-panel-strong hover-lift flex flex-col gap-4 p-6"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <Radar className="h-5 w-5" />
                    <span className="text-xs font-semibold uppercase tracking-widest">Resolution field</span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-around">
                  <ResolutionRadial percent={resolutionPercent} />
                  <ul className="w-full space-y-2 text-xs sm:max-w-[160px]">
                    {deptResolvePreview.map((d) => (
                      <li
                        key={d.name}
                        className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-2 text-slate-600 last:border-0"
                      >
                        <span className="truncate">{d.name}</span>
                        <span className="font-mono text-emerald-600">{d.rate}%</span>
                      </li>
                    ))}
                    {deptResolvePreview.length === 0 && (
                      <li className="text-slate-500">No department data yet</li>
                    )}
                  </ul>
                </div>
              </motion.div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'date', label: 'Newest', icon: Clock },
                { id: 'upvotes', label: 'Upvotes', icon: ThumbsUp },
                { id: 'priority', label: 'Priority', icon: AlertTriangle },
                { id: 'nearest', label: 'Nearest', icon: MapPin },
              ].map((btn) => {
                const Icon = btn.icon;
                return (
                  <motion.button
                    key={btn.id}
                    type="button"
                    onClick={() => setSortBy(btn.id)}
                    whileTap={{ scale: 0.97 }}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                      sortBy === btn.id
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800 shadow-[0_8px_24px_rgba(16,185,129,0.18)]'
                        : 'border-emerald-100 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {btn.label}
                  </motion.button>
                );
              })}

              <select
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="input-dark ml-auto max-w-[140px] py-2 text-xs"
              >
                <option>All</option>
                <option>Submitted</option>
                <option>In Progress</option>
                <option>Resolved</option>
              </select>

              <select
                name="category"
                value={filters.category}
                onChange={handleFilterChange}
                className="input-dark max-w-[180px] py-2 text-xs"
              >
                <option>All</option>
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  label: 'Total cases',
                  value: stats.total,
                  icon: BarChart3,
                  edge: 'border-neon-cyan/30 shadow-neon-cyan',
                },
                {
                  label: 'In progress',
                  value: stats.inProgress,
                  icon: Clock,
                  edge: 'neon-edge-amber',
                },
                {
                  label: 'Resolved',
                  value: stats.resolved,
                  icon: CheckCircle,
                  edge: 'neon-edge-emerald',
                },
              ].map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={`glass-panel hover-lift relative overflow-hidden p-5 ${stat.edge}`}
                  >
                    <div className="absolute left-0 top-0 h-1 w-full bg-gradient-primary opacity-70" />
                    <Icon className="mb-3 h-5 w-5 text-emerald-600" />
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      {stat.label}
                    </p>
                    <p className="font-space-grotesk mt-1 text-3xl font-extrabold text-slate-900">{stat.value}</p>
                  </motion.div>
                );
              })}
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 py-12 text-center text-red-600">
                {error}
              </div>
            ) : filteredGrievances.length === 0 ? (
              <div className="glass-panel py-16 text-center text-slate-500">
                No grievances match this filter.
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredGrievances.map((g, index) => (
                  <GrievanceCard
                    key={g._id}
                    grievance={g}
                    index={index}
                    isAuthority={isAuthority}
                    currentUserId={user?.id}
                    showToast={showToast}
                    userLocation={userLocation}
                    getDistanceKm={getDistanceKm}
                    onGrievanceUpdate={(updated) => {
                      setGrievances((prev) => prev.map((x) => (x._id === updated._id ? { ...x, ...updated } : x)));
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export default DashboardPage;
