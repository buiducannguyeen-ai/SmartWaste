import React, { useState } from 'react';
import { History, Trash2, ArrowUpRight, Filter, Clock, Sparkles, Sprout, Recycle, ShieldAlert, BarChart3 } from 'lucide-react';
import { WasteHistoryRecord, WasteCategory } from '../types';
import { playClickSound } from '../utils/audio';

interface ClassificationHistoryProps {
  history: WasteHistoryRecord[];
  onClearHistory: () => void;
}

export const ClassificationHistory: React.FC<ClassificationHistoryProps> = ({
  history,
  onClearHistory,
}) => {
  const [filter, setFilter] = useState<'all' | WasteCategory>('all');

  const filteredHistory = history.filter((item) =>
    filter === 'all' ? true : item.category === filter
  );

  // Compute stats
  const totalScans = history.length;
  const organicCount = history.filter((x) => x.category === 'organic').length;
  const recyclableCount = history.filter((x) => x.category === 'recyclable').length;
  const inorganicCount = history.filter((x) => x.category === 'inorganic').length;
  const totalPoints = history.reduce((acc, curr) => acc + curr.points, 0);

  // Eco impact calculations (for STEM presentation)
  const co2ReducedKg = (recyclableCount * 0.18 + organicCount * 0.12).toFixed(2);
  const compostGrams = (organicCount * 80).toFixed(0);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div id="classification-history-section" className="w-full space-y-4">
      {/* Environmental Impact & STEM Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Stat 1: Total Points */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border-2 border-slate-800 flex items-center gap-3 shadow-lg">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 border-2 border-amber-400/50 flex items-center justify-center text-amber-300 flex-shrink-0 shadow-md shadow-amber-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Tổng Điểm Tích Lũy</div>
            <div className="text-xl font-black font-mono text-amber-300">{totalPoints} đ</div>
          </div>
        </div>

        {/* Stat 2: Organic (+1) */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border-2 border-slate-800 flex items-center gap-3 shadow-lg">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center text-emerald-300 flex-shrink-0 shadow-md shadow-emerald-500/20">
            <Sprout className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-black text-emerald-400 uppercase tracking-wider">Hữu Cơ (+1đ)</div>
            <div className="text-xl font-black font-mono text-emerald-300">
              {organicCount} <span className="text-xs text-slate-400 font-semibold">(~{compostGrams}g ủ)</span>
            </div>
          </div>
        </div>

        {/* Stat 3: Recyclable (+2) */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border-2 border-slate-800 flex items-center gap-3 shadow-lg">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 border-2 border-amber-400/50 flex items-center justify-center text-amber-300 flex-shrink-0 shadow-md shadow-amber-500/20">
            <Recycle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-black text-amber-400 uppercase tracking-wider">Tái Chế (+2đ)</div>
            <div className="text-xl font-black font-mono text-amber-300">
              {recyclableCount} <span className="text-xs text-slate-400 font-semibold">mẫu</span>
            </div>
          </div>
        </div>

        {/* Stat 4: Inorganic (+3) & CO2 reduction */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border-2 border-slate-800 flex items-center gap-3 shadow-lg">
          <div className="w-11 h-11 rounded-xl bg-orange-500/20 border-2 border-orange-400/50 flex items-center justify-center text-orange-300 flex-shrink-0 shadow-md shadow-orange-500/20">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-black text-orange-400 uppercase tracking-wider">Vô Cơ (+3đ)</div>
            <div className="text-xl font-black font-mono text-orange-300">
              {inorganicCount} <span className="text-xs text-slate-400 font-semibold">(-{co2ReducedKg}kg CO2)</span>
            </div>
          </div>
        </div>
      </div>

      {/* History Log Table / Cards */}
      <div className="bg-slate-900/90 border-2 border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Header & Controls */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/20 border-2 border-emerald-400/50 text-emerald-300 shadow-md shadow-emerald-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-100 tracking-tight">
                NHẬT KÝ PHÂN LOẠI RÁC ({history.length} LẦN)
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">Ghi nhận minh bạch kết quả AI & điểm số</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Buttons with high-contrast active state */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border-2 border-slate-800 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1 mr-0.5" />
              <button
                onClick={() => {
                  playClickSound();
                  setFilter('all');
                }}
                className={`px-3 py-1 rounded-xl font-black transition-all cursor-pointer ${
                  filter === 'all'
                    ? 'bg-slate-200 text-slate-950 border border-white shadow-md scale-105'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95'
                }`}
              >
                Tất cả ({totalScans})
              </button>
              <button
                onClick={() => {
                  playClickSound();
                  setFilter('organic');
                }}
                className={`px-3 py-1 rounded-xl font-black transition-all cursor-pointer ${
                  filter === 'organic'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 border border-emerald-200 shadow-md shadow-emerald-500/40 scale-105'
                    : 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40 active:scale-95'
                }`}
              >
                Hữu cơ ({organicCount})
              </button>
              <button
                onClick={() => {
                  playClickSound();
                  setFilter('recyclable');
                }}
                className={`px-3 py-1 rounded-xl font-black transition-all cursor-pointer ${
                  filter === 'recyclable'
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 border border-amber-100 shadow-md shadow-amber-500/40 scale-105'
                    : 'text-amber-400 hover:text-amber-200 hover:bg-amber-950/40 active:scale-95'
                }`}
              >
                Tái chế ({recyclableCount})
              </button>
              <button
                onClick={() => {
                  playClickSound();
                  setFilter('inorganic');
                }}
                className={`px-3 py-1 rounded-xl font-black transition-all cursor-pointer ${
                  filter === 'inorganic'
                    ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white border border-orange-200 shadow-md shadow-orange-500/40 scale-105'
                    : 'text-orange-400 hover:text-orange-200 hover:bg-orange-950/40 active:scale-95'
                }`}
              >
                Vô cơ ({inorganicCount})
              </button>
            </div>

            {/* Clear History */}
            {history.length > 0 && (
              <button
                id="btn-clear-history"
                onClick={() => {
                  playClickSound();
                  onClearHistory();
                }}
                title="Xóa lịch sử"
                className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-white px-3 py-2 rounded-xl hover:bg-rose-950 border-2 border-slate-800 hover:border-rose-500/60 transition-all active:scale-95 cursor-pointer font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Xóa lịch sử</span>
              </button>
            )}
          </div>
        </div>

        {/* List Content */}
        <div className="divide-y divide-slate-800/80 max-h-[420px] overflow-y-auto">
          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-medium">
              Chưa có lần phân loại nào trong danh mục này. Hãy đưa mẫu rác vào camera hoặc dùng chế độ Demo!
            </div>
          ) : (
            filteredHistory.map((item) => {
              const categoryBadge =
                item.category === 'organic'
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                  : item.category === 'recyclable'
                  ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                  : 'bg-orange-950/70 border-orange-500/50 text-orange-300';

              const pointBadge =
                item.category === 'organic'
                  ? 'bg-emerald-400 text-slate-950'
                  : item.category === 'recyclable'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-orange-500 text-white';

              return (
                <div
                  key={item.id}
                  className="p-3.5 sm:p-4 hover:bg-slate-850/60 transition-colors flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.rawImage ? (
                      <img
                        src={item.rawImage}
                        alt={item.itemName}
                        className="w-11 h-11 rounded-xl object-cover border-2 border-slate-700 flex-shrink-0 group-hover:border-emerald-400 transition-colors"
                      />
                    ) : (
                      <span className="text-2xl select-none group-hover:scale-110 transition-transform">
                        {item.category === 'organic' ? '🍌' : item.category === 'recyclable' ? '🧴' : '📦'}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-100 truncate group-hover:text-emerald-300 transition-colors">
                          {item.itemName}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${categoryBadge}`}>
                          {item.categoryTitle || (item.category === 'organic' ? 'Rác Hữu Cơ' : item.category === 'recyclable' ? 'Rác Tái Chế' : 'Rác Vô Cơ')}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full font-mono shadow-sm ${pointBadge}`}>
                          +{item.points} đ
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {formatTime(item.timestamp)}
                        </span>
                        <span>•</span>
                        <span className="text-slate-300 truncate font-medium">{item.instruction || item.recyclingTip || item.description}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-bold text-slate-400 block">Thí sinh</span>
                    <span className="text-xs font-black text-emerald-300 truncate max-w-[120px] block">
                      {item.userName}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
