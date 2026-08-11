import { useEffect } from "react";
import { motion } from "framer-motion";

export function AppOpenSplash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 1600);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.img
        src="/orvian-logo.png"
        alt="ORVIAN"
        className="h-16 w-auto max-w-[70vw] object-contain sm:h-20"
        initial={{ opacity: 0, scale: 0.88, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.div>
  );
}
