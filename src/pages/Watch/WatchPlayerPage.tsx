import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { loadCaptions, clearSession } from '../../store/watchSlice';
import { YouTubePlayer } from '../../components/YouTubePlayer/YouTubePlayer';
import { useDetailCardFlow } from '../../components/DetailCard/useDetailCardFlow';
import { showBeeIcon } from '../../store/uiSlice';
import { recordWatchHistory } from '../../services/api/mockApi';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

// ---------------------------------------------------------------------------
// CaptionBox
// ---------------------------------------------------------------------------
// fixedHeight: explicit pixel height handed in from the parent after the
// player's rendered height is measured. This makes the box exactly as tall
// as the video player on both mobile (stacked) and desktop (side-by-side).
// ---------------------------------------------------------------------------
function CaptionBox({
  captions,
  currentTimeMs,
  fixedHeight,
}: {
  captions: { startMs: number; endMs: number; text: string }[];
  currentTimeMs: number;
  fixedHeight?: number;
}) {
  const dispatch = useAppDispatch();
  const { triggerCardOpen } = useDetailCardFlow();
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);

  const handleCaptionMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 1) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      dispatch(showBeeIcon({ text, x: rect.left + rect.width / 2, y: rect.top + window.scrollY - 8 }));
    }
  };

    // Index of the caption line currently being spoken, or -1 if none is active.
    const activeIndex = captions.findIndex(
      line => currentTimeMs >= line.startMs && currentTimeMs <= line.endMs
    );

    // Auto-scroll the transcript so the active line stays in view as the video plays.
    // "nearest" only scrolls the caption box's own internal scroll container when the
    // line isn't already visible — it never scrolls the outer page.
    useEffect(() => {
      if (activeIndex === -1) return;
      activeLineRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [activeIndex]);

  return (
    <div
      className="rounded-2xl p-4 select-text flex flex-col"
      style={{
        backgroundColor: 'white',
        border: '2px solid #E2E8F0',
        height: fixedHeight ? fixedHeight : undefined,
        minHeight: fixedHeight ? undefined : 160,
        overflow: 'hidden',
      }}
      onMouseUp={handleCaptionMouseUp}
    >
      {/* Label — never scrolled away */}
      <p className="text-xs font-semibold mb-3 flex-shrink-0" style={{ color: '#718096' }}>
        Captions (select text for details)
      </p>

      {/* Transcript — only this inner div scrolls */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {captions.length === 0 ? (
          <p className="text-sm italic" style={{ color: '#A0AEC0', fontFamily: 'Inter, sans-serif' }}>
            No captions available for this video.
          </p>
        ) : (
          captions.map((line, i) => {
            const isActive = currentTimeMs >= line.startMs && currentTimeMs <= line.endMs;
            return (
              <p
                key={i}
                ref={isActive ? activeLineRef : undefined}
                className="text-sm transition-all leading-relaxed"
                style={{
                  color: isActive ? '#1A202C' : '#718096',
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: 'Inter, sans-serif',
                  backgroundColor: isActive ? '#F4F7FB' : 'transparent',
                  borderRadius: 8,
                  padding: isActive ? '4px 8px' : '0 8px',
                }}
              >
                {line.text}
              </p>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WatchPlayerPage
// ---------------------------------------------------------------------------
export default function WatchPlayerPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { captions, captionsLoading, sessionSavedWords } = useAppSelector(s => s.watch);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // ── Watch-history tracking ───────────────────────────────────────────────
  // Record the watch once on the first play event. The ref prevents
  // duplicate inserts when the YouTube player re-fires PLAYING after
  // buffering or seeking.
  const categories: string[] = (location.state as any)?.categories ?? [];
  const hasRecorded = useRef(false);

  const handleFirstPlay = useCallback(() => {
    if (hasRecorded.current || !videoId) return;
    hasRecorded.current = true;
    recordWatchHistory(videoId, categories).catch(err =>
      console.warn('[watch-history] Failed to record:', err)
    );
  }, [videoId, categories]);

  // ── Playback toggle ref ──────────────────────────────────────────
  // YouTubePlayer populates this ref with its internal togglePlay function
  // once mounted. CaptionBox's onClick reads from it so it always calls the
  // latest player-internal implementation without closure staleness.
  const togglePlayRef = useRef<() => void>(() => {});

  // Ref attached to the wrapper div around <YouTubePlayer>.
  // We observe its size so the captions box can match it exactly.
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const [playerHeight, setPlayerHeight] = useState<number | undefined>(undefined);

  // Measure the player wrapper height and update whenever it changes
  // (e.g. on window resize or when the controls bar appears after load).
  useEffect(() => {
    const el = playerWrapperRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setPlayerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    // Also capture the initial height synchronously in case the observer
    // fires before React has a chance to re-render.
    setPlayerHeight(el.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (videoId) dispatch(loadCaptions(videoId));
    return () => { dispatch(clearSession()); };
  }, [dispatch, videoId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        togglePlayRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!videoId) return null;

  return (
    <div className="min-h-screen" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div
        className="px-6 pt-12 pb-4 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #0E2954 0%, #153C70 100%)' }}
      >
        <button
          onClick={() => navigate('/watch')}
          aria-label="Back to Watch"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Now Watching
        </h1>
      </div>

      <div className="px-6 pt-5 flex flex-col gap-4">
        {/*
          ── Two-column on desktop, stacked on mobile ──────────────────────────
          Both breakpoints use the same measured `playerHeight` so the captions
          box is always pixel-perfect in height.
        */}
        <div className="lg:flex lg:gap-5 lg:items-start">

          {/* ── LEFT: Video Player (65% on desktop, full-width on mobile) ── */}
          {/*
            The ref is on this wrapper so ResizeObserver sees the total
            rendered height including the player's controls bar.
          */}
          <div ref={playerWrapperRef} className="lg:w-[65%] flex-shrink-0">
            <YouTubePlayer
              videoId={videoId}
              onTimeUpdate={t => setCurrentTimeMs(t * 1000)}
              onPlay={handleFirstPlay}
              togglePlayRef={togglePlayRef}
            />
          </div>

          {/* ── RIGHT: Captions (35% on desktop, full-width on mobile) ── */}
          {/*
            mt-4 on mobile creates the gap between stacked player and captions.
            On desktop lg:mt-0 removes it (gap-5 on the row handles spacing).
            The fixedHeight prop makes the box exactly as tall as the player.
          */}
          <div className="lg:flex-1 mt-4 lg:mt-0">
            {captionsLoading ? (
              <div
                className="flex items-center justify-center rounded-2xl"
                style={{
                  height: playerHeight,
                  minHeight: 160,
                  backgroundColor: 'white',
                  border: '2px solid #E2E8F0',
                }}
              >
                <LoadingSpinner label="Loading captions…" />
              </div>
            ) : (
              <CaptionBox
                captions={captions}
                currentTimeMs={currentTimeMs}
                fixedHeight={playerHeight}
              />
            )}
          </div>
        </div>

        {/* Session saved words — always below both columns */}
        {sessionSavedWords.length > 0 && (
          <div
            className="rounded-2xl p-4"
            style={{ backgroundColor: '#F4F7FB', border: '2px solid #E2E8F0' }}
          >
            <p className="text-xs font-semibold mb-3" style={{ color: '#153C70' }}>
              🐝 Words saved this session ({sessionSavedWords.length})
            </p>
            <div className="flex flex-col gap-2">
              {sessionSavedWords.map((w, i) => (
                <div key={i} className="flex items-center justify-between">
                  <p className="font-semibold text-sm" style={{ color: '#1A202C' }}>{w.headword}</p>
                  <p className="text-xs" style={{ color: '#718096' }}>{w.nativeTranslation}</p>
                </div>
              ))}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

