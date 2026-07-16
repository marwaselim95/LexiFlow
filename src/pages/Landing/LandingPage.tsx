import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Preloader from '../../components/Preloader/Preloader';
import lexiLogoWhite from '../../assets/lexi_logo_white.svg';

const contentVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] } },
};

export default function LandingPage() {
  const [showPreloader, setShowPreloader] = useState(true);
  const navigate = useNavigate();
  const handleComplete = useCallback(() => setShowPreloader(false), []);

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ backgroundColor: '#153C70' }}
    >
      <AnimatePresence mode="wait">
        {showPreloader && <Preloader key="preloader" onComplete={handleComplete} />}
      </AnimatePresence>

      {!showPreloader && (
        <motion.div
          variants={contentVariants}
          initial="hidden"
          animate="visible"
          className="text-center space-y-8 max-w-3xl px-6"
        >
          <img src={lexiLogoWhite} alt="LexiFlow" className="mx-auto w-56 md:w-72 object-contain" />
          <p className="text-white/80 text-base md:text-lg font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
            Enrich your language using innovative, neuro-based features
          </p>
          <button
            onClick={() => navigate('/auth/login')}
            className="px-8 py-3 mt-6 text-base font-semibold rounded-full shadow-md focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 transform transition-all duration-300 ease-in-out hover:scale-105 active:scale-95"
            style={{ backgroundColor: '#ffffff', color: '#153C70', fontFamily: 'Inter, sans-serif' }}
          >
            Try it now!
          </button>
        </motion.div>
      )}
    </div>
  );
}
