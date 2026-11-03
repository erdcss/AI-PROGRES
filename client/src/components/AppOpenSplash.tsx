import { useEffect } from "react";
import { motion } from "framer-motion";
import { isMaykNativeApp } from "@/lib/mayk-native";

export function AppOpenSplash({ onDone }: { onDone: () => void }) {
  const native = isMaykNativeApp();
  useEffect(() => {
    const t = window.setTimeout(onDone, 1600);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 ${native ? "bg-[#0C1623]" : "bg-black"}`}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.img
        src={native ? "/api/mayk/branding/icon.png" : "/orvian-logo.png"}
        alt={native ? "M.A.Y.K" : "ORVIAN"}
        className={native ? "h-28 w-28 rounded-[26px] border border-teal-500/35 object-cover shadow-2xl" : "h-32 w-auto max-w-[85vw] object-contain sm:h-40 md:h-48"}
        initial={{ opacity: 0, scale: 0.88, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
      {native && (
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
        >
          <div className="text-[22px] font-bold tracking-[0.2em] text-slate-100">M.A.Y.K</div>
          <div className="mt-1 text-[11px] uppercase tracking-widest text-teal-300">Güvenli Yönetim Merkezi</div>
        </motion.div>
      )}
    </motion.div>
  );
}
