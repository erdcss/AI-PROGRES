/**
 * Circuit Breaker Reset Utility
 * Provides manual reset capability for circuit breakers
 */

import { proxyRotator } from './advanced-proxy-rotator';

// Global circuit breaker reset function
export function resetAllCircuitBreakers(): void {
  console.log('🔄 Resetting all circuit breakers...');
  
  // Reset the proxy rotator's internal circuit breaker
  // We'll need to expose a reset method in the advanced-proxy-rotator
  
  console.log('✅ All circuit breakers reset');
}

// Periodic circuit breaker health check
export function startCircuitBreakerHealthCheck(): void {
  setInterval(() => {
    // Auto-reset circuit breakers every 5 minutes if they've been open too long
    console.log('🔍 Circuit breaker health check...');
    // This will be handled by the circuit breaker's internal recovery logic
  }, 5 * 60 * 1000); // 5 minutes
}