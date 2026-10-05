import { useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import styles from '../messages.module.css';

const mmss = (seconds: number) => (Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` : '0:00');

/** Áudio da conversa com a duração real do arquivo. */
export default function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => setPlaying(false));
  };

  return (
    <div className={styles.audio}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <button type="button" className={styles.playBtn} onClick={toggle} aria-label={playing ? 'Pausar' : 'Ouvir'}>
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <input
        type="range"
        className={styles.audioRange}
        min={0}
        max={duration || 0}
        step={0.1}
        value={current}
        aria-label="Posição do áudio"
        onChange={(e) => {
          if (audioRef.current) audioRef.current.currentTime = Number(e.target.value);
          setCurrent(Number(e.target.value));
        }}
      />
      <span className={styles.audioTime}>{mmss(playing || current ? current : duration)}</span>
    </div>
  );
}
