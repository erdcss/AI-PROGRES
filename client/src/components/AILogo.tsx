import React from 'react';
import { Brain, Sparkles, Zap } from 'lucide-react';

interface AILogoProps {
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

export function AILogo({ size = 'md', animated = true, className = '' }: AILogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12', 
    lg: 'w-16 h-16'
  };
  
  const sparkleSize = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Ana AI Brain Icon */}
      <div className={`relative ${sizeClasses[size]} ${animated ? 'animate-pulse' : ''}`}>
        <Brain className="w-full h-full text-blue-400" />
        
        {/* Glow effect */}
        <div className="absolute inset-0 bg-blue-400/20 rounded-full blur-lg"></div>
      </div>
      
      {/* Sparkle animations */}
      {animated && (
        <>
          <Sparkles 
            className={`absolute -top-1 -right-1 ${sparkleSize[size]} text-purple-400 animate-bounce`}
            style={{ animationDelay: '0.5s' }}
          />
          <Zap 
            className={`absolute -bottom-1 -left-1 ${sparkleSize[size]} text-yellow-400 animate-ping`}
            style={{ animationDelay: '1s' }}
          />
          <Sparkles 
            className={`absolute top-1 -left-2 ${sparkleSize[size]} text-green-400 animate-bounce`}
            style={{ animationDelay: '1.5s' }}
          />
        </>
      )}
    </div>
  );
}

export function AIBrandLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <AILogo size="md" animated={true} />
      <div className="flex flex-col">
        <span className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          AI Scraper
        </span>
        <span className="text-xs text-gray-400 font-medium">
          Yapay Zeka Destekli
        </span>
      </div>
    </div>
  );
}