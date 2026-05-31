import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface SidebarProps {
    benchmark: string;
    setBenchmark: (b: string) => void;
    timeframe: string;
    setTimeframe: (t: string) => void;
    trailLength: number;
    setTrailLength: (l: number) => void;
    loading: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
    benchmark, setBenchmark, timeframe, setTimeframe, trailLength, setTrailLength, loading
}) => {
    const [sectors, setSectors] = useState<string[]>([]);

    useEffect(() => {
        axios.get('http://localhost:8080/api/rrg/sectors')
            .then(res => setSectors(res.data))
            .catch(err => console.error(err));
    }, []);

    return (
        <div className="w-64 border-r border-gray-800 p-4 flex flex-col gap-6 bg-zinc-900">
            <div>
                <label className="block text-xs uppercase opacity-50 mb-2">Benchmark</label>
                <select 
                    value={benchmark} 
                    onChange={(e) => setBenchmark(e.target.value)}
                    className="w-full bg-black border border-gray-700 p-2 text-sm outline-none focus:border-orange-500"
                >
                    {sectors.map(s => (
                        <option key={s} value={s}>{s.replace('NSE_INDEX__', '').replace(/_/g, ' ')}</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-xs uppercase opacity-50 mb-2">Timeframe</label>
                <div className="grid grid-cols-2 gap-2">
                    {['day', 'week', 'month'].map(t => (
                        <button 
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={`p-2 text-xs uppercase border ${timeframe === t ? 'bg-orange-500 text-black border-orange-500' : 'border-gray-700'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-xs uppercase opacity-50 mb-2">Trail Length ({trailLength})</label>
                <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    value={trailLength}
                    onChange={(e) => setTrailLength(parseInt(e.target.value))}
                    className="w-full accent-orange-500"
                />
            </div>

            {loading && (
                <div className="mt-auto text-xs animate-pulse">Loading data...</div>
            )}
        </div>
    );
};

export default Sidebar;
