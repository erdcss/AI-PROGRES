import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

const pageVariants = {
  initial: {
    opacity: 0,
    x: -50,
    scale: 0.95
  },
  in: {
    opacity: 1,
    x: 0,
    scale: 1
  },
  out: {
    opacity: 0,
    x: 50,
    scale: 1.05
  }
};

const pageTransition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.4
};

const containerVariants = {
  initial: {
    opacity: 0
  },
  in: {
    opacity: 1,
    transition: {
      duration: 0.3,
      when: "beforeChildren",
      staggerChildren: 0.1
    }
  },
  out: {
    opacity: 0,
    transition: {
      duration: 0.2
    }
  }
};

export function PageTransition({ children, className = "" }: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
      className={`min-h-screen ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedContainer({ children, className = "" }: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={containerVariants}
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
    y: 50,
    scale: 0.9
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  }
};

// Buton animasyonları için
export const buttonVariants = {
  hover: {
    scale: 1.05,
    transition: {
      duration: 0.2
    }
  },
  tap: {
    scale: 0.95
  }
};

// Sayfa yükleme animasyonu
export const loadingVariants = {
  initial: {
    opacity: 0,
    rotate: 0
  },
  animate: {
    opacity: 1,
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "linear"
    }
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