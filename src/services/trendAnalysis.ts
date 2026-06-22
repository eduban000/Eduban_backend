/**
 * Trend Analysis Service
 * Provides algorithms for calculating learning trends and performance patterns
 */

export class TrendAnalysisService {
  /**
   * Calculate trend between two values
   */
  static calculateTrend(current: number, previous: number) {
    if (previous === 0) {
      return {
        direction: current > 0 ? 'up' : 'flat',
        percentage: current > 0 ? 100 : 0
      };
    }

    const change = ((current - previous) / previous) * 100;
    
    return {
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      percentage: Math.abs(Math.round(change))
    };
  }

  /**
   * Analyze a series of data points to determine overall trend
   */
  static analyzeSeriesTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' | 'volatile' {
    if (values.length < 2) return 'stable';

    let increases = 0;
    let decreases = 0;

    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[i - 1]) increases++;
      else if (values[i] < values[i - 1]) decreases++;
    }

    const totalChanges = values.length - 1;
    if (increases / totalChanges > 0.7) return 'increasing';
    if (decreases / totalChanges > 0.7) return 'decreasing';
    
    return 'volatile';
  }
}