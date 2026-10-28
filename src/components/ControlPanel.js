import React from 'react';
import './ControlPanel.css';

function ControlPanel({ symbol, timeframe, onSymbolChange, onTimeframeChange, onFetch, loading }) {
  return (
    <div className="control-panel">
      <div className="control-group">
        <label htmlFor="symbol">Trading Pair:</label>
        <input
          id="symbol"
          type="text"
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          placeholder="e.g., BTCUSD"
          disabled={loading}
        />
      </div>

      <div className="control-group">
        <label htmlFor="timeframe">Timeframe:</label>
        <select
          id="timeframe"
          value={timeframe}
          onChange={(e) => onTimeframeChange(e.target.value)}
          disabled={loading}
        >
          <option value="1m">1 min</option>
          <option value="5m">5 min</option>
          <option value="15m">15 min</option>
          <option value="1h">1 hour</option>
          <option value="4h">4 hours</option>
          <option value="1d">1 day</option>
        </select>
      </div>

      <button
        className="fetch-button"
        onClick={onFetch}
        disabled={loading || !symbol}
      >
        {loading ? 'Loading...' : 'Fetch Data'}
      </button>
    </div>
  );
}

export default ControlPanel;
