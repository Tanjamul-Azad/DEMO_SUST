import { motion } from 'framer-motion';

// Scroll-into-view reveal. Honors reduced-motion automatically via framer-motion.
export default function Reveal({ children, y = 28, delay = 0, className = '', once = true }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-12% 0px' }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
