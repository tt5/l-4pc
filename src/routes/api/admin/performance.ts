import { performanceTracker } from '~/utils/performance';
import { withAuth } from '~/middleware/auth';

export const GET = withAuth(async () => {
  try {
    const metrics = performanceTracker.getMetrics();
    const calculateSquaresMetrics = metrics.filter(m => m.operation === 'calculate-squares');
    
    const summary = {
      totalRequests: metrics.length,
      calculateSquares: {
        count: calculateSquaresMetrics.length,
        averageDuration: calculateSquaresMetrics.reduce((sum, m) => sum + m.duration, 0) / Math.max(1, calculateSquaresMetrics.length),
        maxBasePoints: Math.max(...calculateSquaresMetrics.map(m => m.data.basePointCount || 0), 0),
        averageResponseSize: calculateSquaresMetrics.reduce((sum, m) => sum + (m.data.responseSize || 0), 0) / Math.max(1, calculateSquaresMetrics.length)
      },
      lastUpdated: new Date().toISOString()
    };

    return new Response(JSON.stringify({ success: true, data: summary }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Failed to get performance metrics' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
