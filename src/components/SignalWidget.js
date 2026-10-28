import React from 'react';
import './SignalWidget.css';

function SignalWidget({ signal, cvdValue, oiValue, cvdTrend, oiTrend }) {
  const getSignalClass = () => {
    switch (signal) {
      case 'BULLISH':
        return 'bullish';
      case 'BEARISH':
        return 'bearish';
      default:
        return 'neutral';
    }
  };

  const getTrendIcon = (trend) => {
    if (parseFloat(trend) > 0) return '📈';
    if (parseFloat(trend) < 0) return '📉';
    return '→';
  };

  return (
    <div className={`signal-widget ${getSignalClass()}`}>
      <h2 className="signal-text">{signal}</h2>

      <div className="signal-details">
        <div className="trend-item">
          <span className="trend-label">CVD</span>
          <span className="trend-value">
            {getTrendIcon(cvdTrend)} {cvdValue}
          </span>
          <span className="trend-change">{cvdTrend}</span>
        </div>

        <div className="trend-item">
          <span className="trend-label">OI</span>
          <span className="trend-value">
            {getTrendIcon(oiTrend)} {oiValue}
          </span>
          <span className="trend-change">{oiTrend}</span>
        </div>
      </div>
    </div>
  );
}

export default SignalWidget;
