import { motion } from "framer-motion";
import { ReactNode } from "react";
import { useLocation } from "wouter";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/** Enter-only route animation (no exit fade — that blanked the next page). */
export function PageTransition({ children, className = "" }: PageTransitionProps) {
  const [location] = useLocation();
  return (
    <motion.div
      key={location}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      className={`min-h-screen ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedContainer({ children, className = "" }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 1, scale: 1 }}
      animate={{ opacity: 1, scale: 1 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Kart animasyonları için
export const cardVariants = {
  hidden: {
    opacity: 0,
    y: 60,
    scale: 0.9,
    rotateX: -10
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 20,
      duration: 0.6
    }
  },
  hover: {
    y: -5,
    scale: 1.02,
    rotateX: 2,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25
    }
  }
};

// Buton animasyonları için
export const buttonVariants = {
  initial: {
    scale: 1,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
  },
  hover: {
    scale: 1.05,
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 15
    }
  },
  tap: {
    scale: 0.95,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    transition: {
      duration: 0.1
    }
  }
};

// Sayfa yükleme animasyonu
export const loadingVariants = {
  initial: {
    opacity: 0,
    rotate: 0,
    scale: 0.8
  },
  animate: {
    opacity: 1,
    rotate: 360,
    scale: 1,
    transition: {
      duration: 1.2,
      repeat: Infinity,
      ease: "linear",
      scale: {
        duration: 0.5,
        ease: "easeOut"
      }
    }
  }
};

// Smooth page enter animation
export const smoothEnterVariants = {
  initial: {
    opacity: 1,
    y: 0,
    scale: 1
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94]
    }
  }
};

// Floating animation
export const floatingVariants = {
  animate: {
    y: [-4, 4, -4],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

// Slide in from side
export const slideInVariants = {
  left: {
    initial: { x: 0, opacity: 1 },
    animate: { x: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
  },
  right: {
    initial: { x: 0, opacity: 1 },
    animate: { x: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
  },
  up: {
    initial: { y: 0, opacity: 1 },
    animate: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
  },
  down: {
    initial: { y: 0, opacity: 1 },
    animate: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
  }
};

// Liste öğeleri için animasyon
export const listItemVariants = {
  hidden: {
    opacity: 0,
    x: -20
  },
  visible: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: index * 0.1,
      duration: 0.3
    }
  })
};

// Görseller için animasyon
export const imageVariants = {
  hidden: {
    opacity: 0,
    scale: 0.8
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  },
  hover: {
    scale: 1.05,
    transition: {
      duration: 0.2
    }
  }
};
