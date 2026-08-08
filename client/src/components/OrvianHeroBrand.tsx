import { motion } from "framer-motion";

type OrvianHeroBrandProps = {
  compact?: boolean;
  className?: string;
};

const WORD = "ORVIAN".split("");
const TAGLINE = "TOMORROW BEGINS HERE".split("");

const easeOut = [0.16, 1, 0.3, 1] as const;

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const markIn = {
  hidden: { opacity: 0, rotateY: 24, scale: 0.82, filter: "blur(5px)" },
  show: {
    opacity: 1,
    rotateY: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 90, damping: 14, mass: 0.9 },
  },
};

const letterIn = {
  hidden: { opacity: 0, y: 22, rotateX: 60, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 125, damping: 15, mass: 0.65 },
  },
};

const tagLetterIn = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: easeOut },
  },
};

/** Birleşik marka satırı: ORVIAN + sağında tam amblem */
export function OrvianHeroBrand({ compact = false, className = "" }: OrvianHeroBrandProps) {
  // Daha geniş / büyük — amblem yazıyla aynı görsel blok
  const markSize = compact
    ? "h-[3.75rem] w-[3.75rem] sm:h-[4.25rem] sm:w-[4.25rem]"
    : "h-[4.75rem] w-[4.75rem] sm:h-[5.5rem] sm:w-[5.5rem] md:h-[6.25rem] md:w-[6.25rem]";
  const wordSize = compact
    ? "text-[2.35rem] sm:text-[2.75rem]"
    : "text-[3rem] sm:text-[3.5rem] md:text-[4rem]";

  return (
    <motion.div
      className={`relative flex flex-col items-center justify-center overflow-visible select-none ${className}`}
      initial="hidden"
      animate="show"
      variants={container}
      style={{ perspective: 1100 }}
      aria-label="ORVIAN — Tomorrow begins here."
    >
      {/* Birleşik satır — küçük boşluk, taşmaya izin */}
      <div className="flex items-center justify-center overflow-visible gap-1.5 sm:gap-2 md:gap-2.5">
        <motion.h1
          className={`orvian-word m-0 flex items-center justify-center gap-[0.02em] leading-none ${wordSize}`}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
          }}
          style={{ transformStyle: "preserve-3d", perspective: 900 }}
        >
          {WORD.map((ch, i) => (
            <motion.span
              key={`${ch}-${i}`}
              className="orvian-letter inline-block origin-bottom"
              variants={letterIn}
              style={{ transformStyle: "preserve-3d" }}
              aria-hidden
            >
              {ch}
            </motion.span>
          ))}
          <span className="sr-only">ORVIAN</span>
        </motion.h1>

        <motion.div
          className={`relative shrink-0 overflow-visible bg-transparent ${markSize}`}
          variants={markIn}
          style={{ transformStyle: "preserve-3d" }}
        >
          <motion.img
            src="/orvian-mark-3d.png?v=7"
            alt=""
            aria-hidden
            className="orvian-mark-img block h-full w-full max-w-none bg-transparent object-contain object-center"
            draggable={false}
            animate={{ rotateY: [0, 7, 0, -7, 0], y: [0, -1.5, 0] }}
            transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
            style={{
              transformStyle: "preserve-3d",
              // drop-shadow kesmesin
              overflow: "visible",
            }}
          />
        </motion.div>
      </div>

      <motion.p
        className="mt-2.5 flex flex-wrap justify-center gap-[0.02em] text-[9px] tracking-[0.3em] sm:mt-3 sm:text-[10px] sm:tracking-[0.36em]"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.015, delayChildren: 0.65 } },
        }}
        aria-label="Tomorrow begins here."
      >
        {TAGLINE.map((ch, i) => (
          <motion.span
            key={`t-${i}`}
            className="orvian-tag-letter inline-block"
            variants={tagLetterIn}
            aria-hidden
          >
            {ch === " " ? "\u00A0" : ch}
          </motion.span>
        ))}
      </motion.p>
    </motion.div>
  );
}
