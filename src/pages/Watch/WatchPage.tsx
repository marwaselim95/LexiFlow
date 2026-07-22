import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import youtubeIcon from '../../assets/youtube.svg';
import graphicDesignerNavy from '../../assets/graphic_designer_navy.svg';
import { useAppDispatch, useAppSelector } from '../../store';
import { loadSuggestedVideos, validateUrl, clearUrlError } from '../../store/watchSlice';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { VideoItem } from '../../services/api/types';

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

function VideoCard({ video, first }: { video: VideoItem; first: boolean }) {
  const navigate = useNavigate();
  return (
    <div
      className={`relative rounded-2xl overflow-hidden transition-all cursor-pointer hover:shadow-lg active:scale-[0.98] ${first ? 'glow-card' : ''}`}
      style={{ border: `2px solid ${first ? '#153C70' : '#E2E8F0'}`, backgroundColor: 'white' }}
      onClick={() => navigate(`/watch/player/${video.videoId}`, { state: { categories: video.category ? [video.category] : [] } })}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(`/watch/player/${video.videoId}`, { state: { categories: video.category ? [video.category] : [] } })}
      aria-label={`Watch ${video.title}`}
    >
      {/* Recommended badge:
            mobile  → absolute top-right corner of the whole card
            desktop → hidden here (rendered inside thumb instead) */}
      {first && (
        <span
          className="md:hidden absolute top-0 right-0 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: '#153C70' }}
        >
          ✨ recommended
        </span>
      )}

      {/* flex row: on mobile stretch children to fill card height; on desktop use default align */}
      <div className="flex max-md:items-stretch">

        {/* Thumbnail column */}
        <div className="video-card-thumb relative flex-shrink-0 max-md:self-stretch">

          {/* Image:
                mobile  → absolute so it fills the full stretched height (no gap below)
                desktop → normal flow so it keeps its natural 16:9 height */}
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="max-md:absolute max-md:inset-0 w-full h-full object-cover"
            onError={e => { const img = e.target as HTMLImageElement; if (!img.dataset.fallback) { img.dataset.fallback = '1'; img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect fill='%23153C70' width='320' height='180'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='sans-serif' font-size='16'%3EVideo%3C/text%3E%3C/svg%3E"; } }}
          />

          {/* Duration badge — always bottom-right of the image */}
          <span
            className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white z-10"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
          >
            {video.duration}
          </span>

          {/* Recommended badge inside thumb — desktop only */}
          {first && (
            <div className="max-md:hidden absolute top-1.5 left-1.5 z-10">
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: '#153C70' }}
              >
                ✨ recommended
              </span>
            </div>
          )}
        </div>

        {/* Info panel — fills remaining horizontal space */}
        <div className="flex flex-col justify-center px-4 py-3 min-w-0 flex-1">
          <p
            className="font-semibold text-sm leading-snug line-clamp-2"
            style={{ color: '#1A202C', fontFamily: 'Poppins, sans-serif' }}
          >
            {video.title}
          </p>
          <p className="text-xs mt-1 truncate" style={{ color: '#718096' }}>
            {video.channelName}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WatchPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { suggestedVideos, promptMessage, videosLoading, urlValidating, urlError, error, lastSearchQuery } = useAppSelector(s => s.watch);
  const [searchValue, setSearchValue] = useState(() => lastSearchQuery);
  const [hasSearched, setHasSearched] = useState(
    () => suggestedVideos.length > 0 || !!promptMessage || !!error
  );

  // Auto-load on mount disabled — uncomment to re-enable personalised recommendations:
  // useEffect(() => {
  //   dispatch(loadSuggestedVideos());
  // }, [dispatch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchValue.trim();
    if (!trimmed) return;
    const videoId = extractVideoId(trimmed);
    if (videoId) {
      // It's a YouTube URL — validate first
      dispatch(validateUrl(trimmed)).then((result: any) => {
        const payload = result.payload;
        if (payload?.valid) {
          dispatch(clearUrlError());
          navigate(`/watch/player/${videoId}`);
        }
      });
    } else {
      // Topic search — send the query to the edge function for a real YouTube search
      setHasSearched(true);
      dispatch(loadSuggestedVideos(trimmed));
    }
  };

  return (
    <div className="min-h-screen" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div
        className="px-6 pt-12 pb-6"
        style={{ background: 'linear-gradient(135deg, #0E2954 0%, #153C70 100%)' }}
      >
        <h1 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
          <img src={youtubeIcon} alt="" className="w-7 h-7" />
          Watch
        </h1>
        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            value={searchValue}
            onChange={e => { setSearchValue(e.target.value); dispatch(clearUrlError()); }}
            placeholder="Search topic or paste YouTube URL…"
            className="flex-1 px-4 py-3 rounded-full text-sm outline-none"
            style={{
              fontFamily: 'Inter, sans-serif',
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: 'white',
              border: '2px solid rgba(255,255,255,0.3)',
            }}
            aria-label="Search videos"
          />
          <button
            type="submit"
            disabled={urlValidating}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-all hover:opacity-80"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            {urlValidating ? '…' : '🔍'}
          </button>
        </form>
        {urlError && (
          <p className="mt-2 text-xs text-red-300">
            {urlError}
          </p>
        )}
      </div>

      <div className="px-6 pt-5">
        {/* ── Pre-search idle state: graphic + message, no network call ── */}
        {!hasSearched && !videosLoading && !error && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <img src={graphicDesignerNavy} alt="" className="w-40 h-40 object-contain" />
            <p className="text-sm font-medium" style={{ color: '#1A202C', fontFamily: 'Inter, sans-serif' }}>
              Enjoy watching videos while enriching your vocabulary!
            </p>
          </div>
        )}

        {/* ── Post-search states ── */}
        {hasSearched && videosLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner label="Loading videos…" />
          </div>
        )}

        {hasSearched && !videosLoading && error && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="text-4xl">😔</span>
            <p className="text-sm" style={{ color: '#718096' }}>Service currently busy. Please try again.</p>
            <button
              onClick={() => dispatch(loadSuggestedVideos())}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: '#153C70' }}
            >
              Retry
            </button>
          </div>
        )}

        {hasSearched && !videosLoading && promptMessage && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <span className="text-5xl">🎬</span>
            <div
              className="rounded-3xl px-6 py-5"
              style={{ backgroundColor: '#F4F7FB', border: '2px solid #E2E8F0', maxWidth: 320 }}
            >
              <p className="text-sm font-medium" style={{ color: '#1A202C', fontFamily: 'Inter, sans-serif' }}>
                {promptMessage}
              </p>
            </div>
          </div>
        )}

        {hasSearched && !videosLoading && suggestedVideos.length > 0 && (
          <div className="flex flex-col gap-5">
            {suggestedVideos.map((video, i) => (
              <VideoCard key={video.videoId} video={video} first={i === 0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
