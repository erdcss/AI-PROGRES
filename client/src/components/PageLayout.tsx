import { motion } from "framer-motion";
import { ReactNode } from "react";
import BackButton from "./BackButton";

interface PageLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  showBackButton?: boolean;
  className?: string;
}

export function PageLayout({ 
  children, 
  title, 
  subtitle, 
  backTo = "/", 
  backLabel = "Ana Sayfa",
  showBackButton = true,
  className = ""
}: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-800 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-800/20 via-indigo-800/30 to-blue-900/20 animate-pulse"></div>
      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/10 via-blue-900/20 to-purple-900/10 animate-pulse" style={{animationDelay: '1s'}}></div>
      
      {/* Floating particles */}
      <div className="absolute top-20 left-20 w-2 h-2 bg-blue-400/60 rounded-full animate-particle-float"></div>
      <div className="absolute top-40 right-32 w-3 h-3 bg-purple-400/40 rounded-full animate-particle-float" style={{animationDelay: '2s'}}></div>
      <div className="absolute bottom-32 left-40 w-2 h-2 bg-cyan-400/50 rounded-full animate-particle-float" style={{animationDelay: '4s'}}></div>
      <div className="absolute bottom-20 right-20 w-1 h-1 bg-blue-300/70 rounded-full animate-particle-float" style={{animationDelay: '6s'}}></div>

      <div className={`relative z-10 w-full px-4 md:px-8 py-8 ${className}`}>
        {/* Header with Back Button */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-8"
        >
          {showBackButton && (
            <div className="mb-6">
              <BackButton to={backTo} label={backLabel} />
            </div>
          )}
          
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {title}
            </h1>
            {subtitle && (
              <p className="text-gray-300 text-lg mb-6">
                {subtitle}
              </p>
            )}
          </div>
        </motion.div>

        {/* Page Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

export default PageLayout;