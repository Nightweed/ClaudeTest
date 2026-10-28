import React from 'react';
import { formatNumber } from '../utils/processor';
import './DataDisplay.css';

function DataDisplay({ title, data, dataPoints }) {
  return (
    <div className="data-display">
      <h2>{title}</h2>
      <div className="data-grid">
        <div className="data-item">
          <span className="data-label">Current</span>
          <span className="data-value">{formatNumber(data.current)}</span>
        </div>
        <div className="data-item">
          <span className="data-label">High</span>
          <span className="data-value positive">{formatNumber(data.highest)}</span>
        </div>
        <div className="data-item">
          <span className="data-label">Low</span>
          <span className="data-value negative">{formatNumber(data.lowest)}</span>
        </div>
        <div className="data-item">
          <span className="data-label">Avg</span>
          <span className="data-value">{formatNumber(data.average)}</span>
        </div>
      </div>
    </div>
  );
}

export default DataDisplay;
