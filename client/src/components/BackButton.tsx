import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  to?: string;
  label?: string;
  className?: string;
}

export function BackButton({ to = "/", label = "Geri", className = "" }: BackButtonProps) {
  const [, setLocation] = useLocation();

  return (
    <motion.button
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      onClick={() => setLocation(to)}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-full
        glassmorphism-card text-white hover:text-blue-300
        transition-all duration-300 hover:scale-105
        tech-button group
        ${className}
      `}
    >
      <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-300" />
      <span className="text-sm font-medium">{label}</span>
    </motion.button>
  );
}

export default BackButton;