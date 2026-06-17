import React, { useMemo } from 'react';
import { Truck, MapPin, Warehouse, RefreshCw, Compass } from 'lucide-react';
import { Coordinates } from '../types';
import { COMPASS_MAP_POINTS, MAP_BUILDINGS } from '../data/mockData';

interface TrackingMapProps {
  courierX: number; // 0 to 100
  courierName: string;
  status: string;
  onAdvanceCourier?: (newVal: number) => void;
  isSimulating: boolean;
  onToggleSimulate: () => void;
}

export default function TrackingMap({
  courierX,
  courierName,
  status,
  onAdvanceCourier,
  isSimulating,
  onToggleSimulate
}: TrackingMapProps) {
  // Interpolate exact (x, y) coordinates of courier alongside the 5-segment track path
  const courierCoord = useMemo((): Coordinates => {
    if (courierX <= 0) return COMPASS_MAP_POINTS[0];
    if (courierX >= 100) return COMPASS_MAP_POINTS[COMPASS_MAP_POINTS.length - 1];

    const segmentCount = COMPASS_MAP_POINTS.length - 1; // 5 segments
    const segmentWeight = 100 / segmentCount; // 20
    const segmentIndex = Math.floor(courierX / segmentWeight);
    const segmentPercentage = (courierX % segmentWeight) / segmentWeight;

    const start = COMPASS_MAP_POINTS[segmentIndex];
    const end = COMPASS_MAP_POINTS[segmentIndex + 1] || start;

    return {
      x: start.x + (end.x - start.x) * segmentPercentage,
      y: start.y + (end.y - start.y) * segmentPercentage
    };
  }, [courierX]);

  // Create an SVG-compliant string representation of the route line
  const routePathD = useMemo(() => {
    return COMPASS_MAP_POINTS.map((pt, idx) => 
      `${idx === 0 ? 'M' : 'L'} ${pt.x}% ${pt.y}%`
    ).join(' ');
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col h-full" id="realtime-courier-map-container">
      {/* Title & Simulation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4.5">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider">
            <Compass className="w-4 h-4 text-blue-600" />
            Courier Map Visualizer
          </h3>
          <p className="text-[10px] text-slate-400 font-mono">Live route on local coordinates</p>
        </div>
        
        {status !== 'delivered' ? (
          <button
            onClick={onToggleSimulate}
            id="btn-simulate-courier"
            className={`cursor-pointer px-3.5 py-1.5 rounded-lg font-medium text-[10px] flex items-center gap-1.5 transition-all duration-200 ${
              isSimulating 
                ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            {isSimulating ? 'Pause driving' : 'Run simulator'}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 border border-slate-205 px-3 py-1 rounded-md text-[10px] font-bold font-mono tracking-wider uppercase">
            REACHED DESTINATION
          </span>
        )}
      </div>

      {/* Styled Grid Canvas Map */}
      <div className="relative flex-1 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden min-h-[300px] h-[340px] select-none" id="shipping-route-grid">
        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:24px_24px] opacity-100"></div>

        {/* City Parks and Building Landmarks */}
        {MAP_BUILDINGS.map((b, idx) => (
          <div
            key={idx}
            className={`absolute rounded-md border border-slate-200/55 flex flex-col justify-center items-center p-1 transition-all ${b.color}`}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
          >
            <span className="font-mono text-[8px] text-slate-400 tracking-tight text-center truncate w-full">{b.label}</span>
          </div>
        ))}

        {/* Courier Route Path Lines (Underneath Pins) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {/* Main street track route background shadow */}
          <path
            d={routePathD}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-40"
          />
          {/* Active completed route highlighting */}
          <path
            d={routePathD}
            fill="none"
            stroke="url(#blueGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 3"
          />
          
          <defs>
            <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
        </svg>

        {/* Waypoint Pins */}
        {COMPASS_MAP_POINTS.map((pt, idx) => {
          const isFulfillment = idx === 0;
          const isHome = idx === COMPASS_MAP_POINTS.length - 1;
          
          return (
            <div
              key={idx}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group pointer-events-none"
              style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
            >
              {isFulfillment ? (
                <div className="p-1 px-2 rounded bg-slate-900 text-white text-[8px] font-mono shadow-xs font-semibold">
                  HUB
                </div>
              ) : isHome ? (
                <div className="p-1 rounded bg-blue-600 text-white shadow-md animate-bounce">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
              ) : (
                <div className="w-2 h-2 rounded-full bg-slate-300 border border-white shadow-xs"></div>
              )}
              
              <div className="absolute top-8 bg-slate-900 text-white text-[9px] font-medium leading-none px-2 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30">
                {pt.label}
              </div>
            </div>
          );
        })}

        {/* The Live Moving Dispatcher Van */}
        {status !== 'delivered' && (
          <div
            id="realtime-courier-marker"
            className="absolute -translate-x-1/2 -translate-y-1/2 select-none z-20 flex flex-col items-center transition-all duration-300"
            style={{ left: `${courierCoord.x}%`, top: `${courierCoord.y}%` }}
          >
            {/* Courier Name Tag Bubble */}
            <div className="bg-slate-900 text-white text-[9px] font-mono px-2 py-0.5 rounded shadow-sm whitespace-nowrap mb-1">
              {courierName}
            </div>

            {/* Pulsing Backing Shadow Effect */}
            <div className="relative p-2 rounded-full bg-blue-600 text-white shadow-md flex items-center justify-center">
              <Truck className="w-3.5 h-3.5" />
              <div className="absolute inset-0 rounded-full border border-blue-400 animate-ping opacity-20"></div>
            </div>
          </div>
        )}
      </div>

      {/* Dashboard telemetry stats block (Clean Minimalism) */}
      <div className="mt-4 grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200/80 p-3 rounded-lg font-mono text-xs">
        <div className="text-center" id="stat-delivery-route">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest font-mono font-medium">Tracking Phase</p>
          <p className="font-semibold text-slate-800 mt-1 truncate">
            {courierX < 15 ? 'Hub Loading' : courierX < 70 ? 'In-Transit Route' : courierX < 100 ? 'Final Mile Out' : 'Delivered'}
          </p>
        </div>
        <div className="text-center border-x border-slate-200" id="stat-delivery-est">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest font-mono font-medium">Distance remaining</p>
          <p id="tracker-km-remaining" className="font-semibold text-slate-800 mt-1">
            {status === 'delivered' ? '0.00 km' : `${Math.max(0.1, (10 - (courierX * 0.1))).toFixed(2)} miles`}
          </p>
        </div>
        <div className="text-center" id="stat-delivery-eta">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest font-mono font-medium">ETA</p>
          <p id="tracker-time-remaining" className="font-semibold text-blue-600 mt-1">
            {status === 'delivered' ? 'Delivered' : `~ ${Math.max(2, Math.ceil(15 - (courierX * 0.15)))} min`}
          </p>
        </div>
      </div>
    </div>
  );
}
